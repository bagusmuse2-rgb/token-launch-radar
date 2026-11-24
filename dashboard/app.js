/* Token Radar — board logic. Reads window.RADAR (written beside dashboard/ as
   data.js), renders the ranked board, filters, sorting, and the per-protocol
   detail modal. No network: every byte shown comes from data.js. The board
   rows are pre-token only; live-token protocols arrive in window.RADAR.live.
   Tolerant of missing fields: a row without a value is shown as unknown,
   never as zero. */
(function () {
  'use strict';

  var DATA = window.RADAR || null;
  var board = (DATA && DATA.board && DATA.board.rows) || (DATA && DATA.rows) || [];
  var liveSrc = (DATA && DATA.live) || null;

  /* Source is the status: board.json holds pre-token rows only (40 watchlist +
     160 early); the live-token set arrives as its own window.RADAR.live array.
     Nothing about live/pre-token is inferred from token_status inside the board. */
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function clean(list, live) {
    return (list || []).filter(function (r) { return r && typeof r.slug === 'string'; })
      .map(function (r) { r._live = live; return r; });
  }
  function isLive(r) { return r._live === true; }

  var PRE = clean(board, false);
  var LIVE = liveSrc ? clean(liveSrc, true) : [];
  var ALL = PRE.concat(LIVE);
  var MODEL = (DATA && DATA.model) || (PRE[0] && PRE[0].model) || null;
  var AS_OF = (DATA && (DATA.asOf || DATA.as_of)) || null;
  var FLOOR = (DATA && (DATA.floorUsd !== undefined ? DATA.floorUsd : DATA.floor_usd)) || null;
  var WATCH = (DATA && (DATA.watchlistCount !== undefined ? DATA.watchlistCount : DATA.watchlist_size)) || null;

  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'value', dir: -1, selected: null };
  var $ = function (id) { return document.getElementById(id); };
  var hasData = ALL.length > 0;

  /* ---------- formatting ---------- */
  function fmtUsd(n) {
    n = num(n);
    if (n === null) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtPct(n) {
    n = num(n);
    if (n === null) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    d = num(d);
    if (d === null) return '—';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function chainsOf(r) {
    var c = r.chains || [];
    return c.length ? c.slice(0, 3).join(', ') + (c.length > 3 ? ' +' + (c.length - 3) : '') : '—';
  }
  function valueOf(r) { return isLive(r) ? num(r.mcap_usd) : num(r.implied_value_usd); }
  function catOf(r) { return r.category || 'Uncategorized'; }

  /* ---------- model ---------- */
  function clampGrowth(g) {
    if (!MODEL) return num(g) === null ? 0 : num(g);
    var lo = num(MODEL.growth_floor), hi = num(MODEL.growth_cap);
    var v = num(g) === null ? 0 : num(g);
    if (lo !== null) v = Math.max(lo, v);
    if (hi !== null) v = Math.min(hi, v);
    return v;
  }
  /* Size discount from the model constants (DATA.model): giant protocols
     are valued cheaper per TVL dollar. Without it the modal's recompute
     overshoots the board for every protocol with TVL >= $500M. */
  function sizeDiscount(tvl) {
    if (!MODEL || tvl === null) return null;
    var over1b = num(MODEL.size_discount_over_1b), mid = num(MODEL.size_discount_500m_1b);
    var t1 = num(MODEL.size_threshold_1b), t5 = num(MODEL.size_threshold_500m);
    if (t1 !== null && over1b !== null && tvl > t1) return { mult: over1b, label: 'TVL over $1B' };
    if (t5 !== null && mid !== null && tvl >= t5) return { mult: mid, label: 'TVL $500M–$1B' };
    return { mult: 1, label: 'TVL under $500M' };
  }
  function breakdown(r) {
    var m = r.model || null;
    var base = m ? num(m.base_multiple) : (MODEL ? num(MODEL.base_multiple) : null);
    var gm = m ? num(m.growth_multiplier) : null;
    var mm = m ? num(m.maturity_multiplier) : null;
    var gp = m ? num(m.growth_pct) : null;
    if (gm === null && MODEL && num(MODEL.growth_weight) !== null) {
      gp = clampGrowth(r.change_7d);
      gm = 1 + (gp / 100) * MODEL.growth_weight;
    }
    if (mm === null && MODEL && num(MODEL.maturity_floor) !== null) {
      var age = num(r.age_days) !== null ? num(r.age_days) : num(MODEL.unknown_age_days);
      if (age !== null) {
        var cap = num(MODEL.maturity_days) || 1095;
        mm = MODEL.maturity_floor + (Math.min(Math.max(age, 0), cap) / cap) * (num(MODEL.maturity_range) || 0);
      }
    }
    var sd = sizeDiscount(num(r.tvl_usd));
    if (base === null || gm === null || mm === null || sd === null || num(r.tvl_usd) === null) return null;
    return { base: base, growthPct: gp, growthMult: gm, maturityMult: mm,
      sizeDiscount: sd.mult, sizeLabel: sd.label,
      recomputed: Math.min(num(r.tvl_usd), Math.max(1, Math.round(r.tvl_usd * base * sd.mult * gm * mm))) };
  }

  /* ---------- filtering & sorting ---------- */
  function pool() {
    if (state.tab === 'pre-token') return PRE;
    if (state.tab === 'live-token') return LIVE;
    return ALL;
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return pool().filter(function (r) {
      if (state.category !== 'all' && catOf(r) !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, catOf(r), (r.chains || []).join(' '), r.symbol || ''].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function keyOf(r, key) {
    if (key === 'rank') return (isLive(r) || num(r.rank) === null) ? Infinity : num(r.rank);
    if (key === 'name') return (r.name || '').toLowerCase();
    if (key === 'category') return catOf(r).toLowerCase();
    if (key === 'tvl') return num(r.tvl_usd) === null ? -Infinity : num(r.tvl_usd);
    if (key === 'chg') return num(r.change_7d) === null ? -Infinity : num(r.change_7d);
    if (key === 'age') return num(r.age_days) === null ? -Infinity : num(r.age_days);
    var v = valueOf(r);
    return v === null ? -Infinity : v;
  }
  function sorted(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av = keyOf(a, key), bv = keyOf(b, key);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  /* ---------- rendering ---------- */
  var COLS = [
    { key: 'rank', label: 'Rank', cls: 'num' },
    { key: 'name', label: 'Protocol', cls: '' },
    { key: 'category', label: 'Category', cls: '' },
    { key: 'tvl', label: 'TVL', cls: 'num' },
    { key: 'chg', label: '7d', cls: 'num' },
    { key: 'age', label: 'Age', cls: 'num' },
    { key: 'value', label: 'Implied value', cls: 'num' }
  ];
  function valueLabel() { return state.tab === 'live-token' ? 'Market cap' : 'Implied value'; }

  function renderHead() {
    $('head-row').innerHTML = COLS.map(function (c) {
      var label = c.key === 'value' ? valueLabel() : c.label;
      var arrow = state.sort === c.key ? '<span class="arrow" aria-hidden="true">' + (state.dir < 0 ? '↓' : '↑') + '</span>' : '';
      return '<th scope="col" class="' + c.cls + '"><button type="button" data-sort="' + c.key + '" aria-label="Sort by ' + esc(label) + '">' + esc(label) + arrow + '</button></th>';
    }).join('');
  }
  function rowHtml(r, maxTvl) {
    var live = isLive(r);
    var chg = num(r.change_7d);
    var chgCls = chg === null ? '' : chg >= 0 ? 'up' : 'down';
    var tvl = num(r.tvl_usd);
    var pct = maxTvl > 0 && tvl !== null ? Math.max(2, Math.round((tvl / maxTvl) * 100)) : 0;
    var v = valueOf(r);
    return '<tr data-slug="' + esc(r.slug) + '" data-live="' + live + '" tabindex="0">' +
      '<td class="num">' + (live || num(r.rank) === null ? '—' : esc(r.rank)) + '</td>' +
      '<td><span class="cell-name"><b>' + esc(r.name || r.slug) + '</b>' +
      '<span class="badge ' + (live ? 'live' : 'pre') + '">' + (live ? 'live token' : 'pre-token') + '</span></span>' +
      '<span class="cell-sub">' + esc(chainsOf(r)) + (r.symbol ? ' · ' + esc(r.symbol) : '') + '</span></td>' +
      '<td class="cat">' + esc(catOf(r)) + '</td>' +
      '<td class="num"><span class="tvl-cell"><span>' + fmtUsd(tvl) + '</span>' +
      '<span class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span></span></td>' +
      '<td class="num ' + chgCls + '">' + fmtPct(chg) + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td class="num"><span class="value' + (live ? ' mcap' : '') + '">' + fmtUsd(v) + '</span></td></tr>';
  }
  function renderTable() {
    renderHead();
    var list = sorted(filtered());
    var maxTvl = list.reduce(function (m, r) { var t = num(r.tvl_usd); return t !== null && t > m ? t : m; }, 0);
    $('rows').innerHTML = list.map(function (r) { return rowHtml(r, maxTvl); }).join('');
    var total = pool().length;
    $('count').textContent = hasData ? list.length + ' of ' + total + ' shown' : 'No data loaded';
    var emptyEl = $('empty');
    if (list.length > 0) { emptyEl.hidden = true; return; }
    emptyEl.hidden = false;
    var h = emptyEl.querySelector('h2'), p = emptyEl.querySelector('p'), btn = $('clear-filters');
    if (!hasData) {
      h.textContent = 'No board data found';
      p.textContent = 'Place data.js beside the dashboard folder and reload — the page reads window.RADAR from it.';
      btn.hidden = true;
    } else if (state.tab === 'live-token' && !liveSrc) {
      h.textContent = 'No live-token data in this file';
      p.textContent = 'This data.js carries no live array — the Live token tab reads window.RADAR.live, which is absent here. The pre-token board is unaffected.';
      btn.hidden = true;
    } else {
      h.textContent = 'No protocol matches that filter';
      p.textContent = 'Clear the search or pick another category to see the board again.';
      btn.hidden = false;
    }
  }
  function renderMeta() {
    $('meta-asof').textContent = AS_OF || '—';
    $('meta-floor').textContent = FLOOR !== null ? fmtUsd(FLOOR) : '—';
    $('meta-rows').textContent = hasData ? String(ALL.length) : '—';
    $('stat-watch').textContent = WATCH !== null ? WATCH + ' / ' + WATCH : String(PRE.length);
    $('stat-board').textContent = String(PRE.length);
    var top = PRE.slice().sort(function (a, b) { return (num(b.implied_value_usd) || 0) - (num(a.implied_value_usd) || 0); })[0];
    $('stat-top').textContent = top ? fmtUsd(top.implied_value_usd) : '—';
    $('stat-top-name').textContent = top ? 'rank 1 · ' + top.name : '—';
    $('stat-live').textContent = String(LIVE.length);
  }
  function renderModel() {
    if (!MODEL) return;
    var set = function (id, v) { var n = $(id); if (n && v !== null && v !== undefined) n.textContent = v; };
    /* radar-3 carries base_multiples per category + base_default; there is
       no MODEL.base_multiple. The per-row base_multiple is only a fallback. */
    var baseDefault = num(MODEL.base_default);
    var base = baseDefault !== null ? baseDefault : num(MODEL.base_multiple);
    if (base === null && PRE[0] && PRE[0].model) base = num(PRE[0].model.base_multiple);
    set('m-base', base);
    if (num(MODEL.growth_floor) !== null && num(MODEL.growth_cap) !== null) set('m-clamp', MODEL.growth_floor + '% … +' + MODEL.growth_cap + '%');
    set('m-weight', num(MODEL.growth_weight));
    set('m-floor', num(MODEL.maturity_floor));
    set('m-days', num(MODEL.maturity_days));
    set('m-range', num(MODEL.maturity_range));
    if (base !== null) {
      var sdOver = num(MODEL.size_discount_over_1b), sdMid = num(MODEL.size_discount_500m_1b);
      var sdText = (sdOver !== null && sdMid !== null)
        ? ' × size discount (' + sdOver + ' over $1B, ' + sdMid + ' $500M–$1B, 1 below)'
        : '';
      var formula = 'implied = round( tvl_usd × ' + base + sdText +
        ' × (1 + clamp(change_7d, ' + MODEL.growth_floor + ', ' + MODEL.growth_cap + ') / 100 × ' + MODEL.growth_weight +
        ') × (' + MODEL.maturity_floor + ' + min(age_days, ' + MODEL.maturity_days + ') / ' + MODEL.maturity_days +
        ' × ' + MODEL.maturity_range + ') )';
      var mults = MODEL.base_multiples;
      if (mults && typeof mults === 'object') {
        var parts = Object.keys(mults).sort().map(function (k) { return k + ' ' + mults[k]; });
        if (parts.length) formula += ' — base by category: ' + parts.join(', ') + '; other categories use the default ' + base + '.';
      }
      $('formula').textContent = formula;
    }
  }
  function renderCategories() {
    var cats = [];
    ALL.forEach(function (r) { var c = catOf(r); if (cats.indexOf(c) < 0) cats.push(c); });
    cats.sort();
    $('category').innerHTML = '<option value="all">All categories</option>' +
      cats.map(function (c) { return '<option value="' + esc(c) + '"' + (c === state.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
  }
  function renderTabs() {
    ['all', 'pre-token', 'live-token'].forEach(function (t) {
      var b = document.querySelector('[data-tab="' + t + '"]');
      if (b) b.setAttribute('aria-selected', String(state.tab === t));
    });
  }
  function renderAll() { renderTabs(); renderTable(); }

  /* ---------- farm steps ---------- */
  function stepParts(s) {
    if (s && typeof s === 'object') return { text: s.text || '', tail: [s.cost, s.time].filter(Boolean).join(' · ') };
    var str = String(s || '');
    var at = str.indexOf(' Cost: ');
    if (at < 0) return { text: str, tail: '' };
    return { text: str.slice(0, at), tail: str.slice(at + 1) };
  }

  /* ---------- detail modal ---------- */
  var dialog = $('detail');
  function kv(label, value) {
    return '<div class="kv"><span>' + esc(label) + '</span><b>' + value + '</b></div>';
  }
  function openDetail(slug) {
    var r = null;
    ALL.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    state.selected = slug;
    writeHash();
    var live = isLive(r);
    var bd = breakdown(r);
    var steps = Array.isArray(r.farm_steps) ? r.farm_steps : [];
    var body = '<div class="detail-body"><div class="detail-top"><div>' +
      '<span class="rank-chip">' + (live ? 'LIVE TOKEN — NOT RANKED' : 'RANK ' + (num(r.rank) === null ? '—' : r.rank) + ' OF ' + PRE.length) + '</span>' +
      '<h2 id="detail-title">' + esc(r.name || r.slug) + '</h2>' +
      '<p class="sub">' + esc(catOf(r)) + ' · ' + esc(chainsOf(r)) + (r.symbol ? ' · ' + esc(r.symbol) : '') + '</p>' +
      '<p style="margin-top:8px"><span class="badge ' + (live ? 'live' : 'pre') + '">' + (live ? 'live token' : 'pre-token') + '</span></p>' +
      '</div><button type="button" class="close" data-close aria-label="Close details">✕</button></div>';

    body += '<div class="kv-grid">' +
      kv('TVL', esc(fmtUsd(r.tvl_usd))) +
      kv('7-day change', esc(fmtPct(r.change_7d))) +
      kv('Age with no token', esc(fmtAge(r.age_days))) +
      kv('Listed since', esc(r.listed_at || '—')) +
      kv('Market cap', esc(live ? fmtUsd(r.mcap_usd) : '— no token')) +
      kv('Chains', esc((r.chains || []).length ? (r.chains || []).join(', ') : '—')) +
      '</div>';

    if (!live && bd) {
      var implied = num(r.implied_value_usd);
      var matches = implied !== null && Math.abs(bd.recomputed - implied) / implied < 0.001;
      body += '<section><h3>Model breakdown</h3><div class="model-box" style="margin-top:10px">' +
        '<div class="row"><span>TVL × base multiple (' + bd.base + ')</span><b>' + esc(fmtUsd(r.tvl_usd)) + ' × ' + bd.base + '</b></div>' +
        '<div class="row"><span>Size discount — ' + esc(bd.sizeLabel) + '</span><b>× ' + bd.sizeDiscount + '</b></div>' +
        '<div class="row"><span>Growth — 7d ' + fmtPct(r.change_7d) + (bd.growthPct !== null && bd.growthPct !== num(r.change_7d) ? ' (clamped to ' + bd.growthPct + '%)' : '') + '</span><b>× ' + bd.growthMult.toFixed(4) + '</b></div>' +
        '<div class="row"><span>Maturity — ' + fmtAge(r.age_days) + ' with no token</span><b>× ' + bd.maturityMult.toFixed(4) + '</b></div>' +
        '<div class="row total"><span>Implied value</span><b>' + esc(fmtUsd(r.implied_value_usd)) + '</b></div>' +
        '<p class="check">Recomputed from these inputs: ' + esc(fmtUsd(bd.recomputed)) +
        (matches ? ' — matches the board (within rounding).' : ' — differs from the board; the data may be stale.') + '</p>' +
        '</div></section>';
    } else if (!live) {
      body += '<section><h3>Model inputs</h3><div class="model-box" style="margin-top:10px">' +
        '<div class="row"><span>TVL</span><b>' + esc(fmtUsd(r.tvl_usd)) + '</b></div>' +
        '<div class="row"><span>7-day change</span><b>' + esc(fmtPct(r.change_7d)) + '</b></div>' +
        '<div class="row"><span>Age with no token</span><b>' + esc(fmtAge(r.age_days)) + '</b></div>' +
        '<div class="row total"><span>Implied value</span><b>' + esc(fmtUsd(r.implied_value_usd)) + '</b></div>' +
        '<p class="check">This data file carries no model constants, so the multipliers are not shown.</p>' +
        '</div></section>';
    } else {
      var ratio = (num(r.mcap_usd) !== null && num(r.tvl_usd)) ? (num(r.mcap_usd) / num(r.tvl_usd)).toFixed(2) + '×' : '—';
      body += '<section><h3>Market value</h3><div class="model-box" style="margin-top:10px">' +
        '<div class="row"><span>Market cap (the market\u2019s own value)</span><b>' + esc(fmtUsd(r.mcap_usd)) + '</b></div>' +
        '<div class="row"><span>TVL</span><b>' + esc(fmtUsd(r.tvl_usd)) + '</b></div>' +
        '<div class="row"><span>Market cap / TVL</span><b>' + esc(ratio) + '</b></div>' +
        '<p class="check">This protocol already trades, so it is set aside from the pre-token ranking — its market cap is a fact, not a model.</p>' +
        '</div></section>';
    }

    body += '<section><h3>Farm plan</h3>' +
      (steps.length
        ? '<ol class="steps" style="margin-top:10px">' + steps.map(function (s) {
          var p = stepParts(s);
          return '<li>' + esc(p.text) + (p.tail ? '<span class="cost">' + esc(p.tail) + '</span>' : '') + '</li>';
        }).join('') + '</ol>'
        : '<p class="check" style="margin-top:10px">No farm plan was shipped with this data for this protocol.</p>') +
      '</section>';

    body += '<p class="detail-note">Implied value is an estimate from snapshot figures, not a price and not a promise that a token launches. Never pay to claim an airdrop; claim only from the protocol\u2019s own pages.</p></div>';
    $('detail-body').innerHTML = body;
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }
  function closeDetail() {
    if (dialog.open) dialog.close();
    else { state.selected = null; writeHash(); }
  }

  /* ---------- hash deep-links: #/protocol/<slug> ---------- */
  function readHash() {
    var h = window.location.hash || '';
    var m = h.match(/^#\/protocol\/([A-Za-z0-9._-]+)/);
    if (m) { state.selected = m[1]; return; }
    var p = h.match(/[?&#]p=([A-Za-z0-9._-]+)/);
    state.selected = p ? p[1] : null;
  }
  function writeHash() {
    var target = state.selected ? '#/protocol/' + state.selected : window.location.pathname + window.location.search;
    try { window.history.replaceState(null, '', target); }
    catch (e) { try { window.location.hash = state.selected ? '/protocol/' + state.selected : ''; } catch (e2) {} }
  }

  /* ---------- events ---------- */
  $('q').addEventListener('input', function (e) { state.q = e.target.value; renderTable(); });
  $('category').addEventListener('change', function (e) { state.category = e.target.value; renderTable(); });
  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); renderAll(); });
  });
  $('head-row').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-sort]') : null;
    if (!b) return;
    var k = b.getAttribute('data-sort');
    if (state.sort === k) state.dir = -state.dir;
    else { state.sort = k; state.dir = k === 'name' || k === 'category' ? 1 : -1; }
    renderTable();
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest ? e.target.closest('tr[data-slug]') : null;
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  $('rows').addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-slug]')) {
      e.preventDefault();
      openDetail(e.target.getAttribute('data-slug'));
    }
  });
  $('clear-filters').addEventListener('click', function () {
    state.q = ''; $('q').value = '';
    state.category = 'all'; renderCategories();
    renderTable();
  });
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) closeDetail();
    else if (e.target.closest && e.target.closest('[data-close]')) closeDetail();
  });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  window.addEventListener('hashchange', function () {
    readHash();
    if (state.selected) openDetail(state.selected);
    else if (dialog.open) dialog.close();
  });

  renderMeta();
  renderModel();
  renderCategories();
  renderAll();
  readHash();
  if (state.selected) openDetail(state.selected);
})();
