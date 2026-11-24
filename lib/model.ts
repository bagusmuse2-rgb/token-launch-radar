// Model radar token-launch: snapshot masuk, board berperingkat keluar.
//
// Satu-satunya masukan adalah angka-angka snapshot itu sendiri (TVL, perubahan
// 7 hari, tanggal listing, dan ada/tidaknya token yang tercatat). Tidak ada nama
// protokol yang diperlakukan istimewa: fungsi yang sama menilai setiap baris.
//
//   pre-token  = gecko_id null DAN mcap_usd null (DefiLlama tidak mencatat token)
//   live-token = gecko_id non-null (tokennya sudah diperdagangkan)
//
// Board berisi 200 baris pre-token saja: seluruh watchlist (40), dan 160
// pre-token di luar watchlist dengan TVL tertinggi. Live-token tidak masuk
// board: 24 live-token dengan market cap terbesar dibawa terpisah di array
// `live` (bentuk baris sama seperti board, implied dihitung rumus yang sama)
// agar dashboard bisa menampilkannya di tab Live tanpa mencampuri ranking
// pre-token.
//
// Implied value, untuk setiap baris:
//
//   base      = TVL x BASE_MULTIPLE[kategori]
//   sizeDisc  = 0.70 bila TVL > $1 miliar; 0.85 bila $500 jt s.d. $1 miliar; 1.00 bila di bawahnya
//   growth    = 1 + clip(change_7d, -30, +30) / 100 x 0.25   (null -> 0)
//   maturity  = 0.9 + min(umur_hari, 1095) / 1095 x 0.2
//               (listed_at null, atau tanggal default 2025-05-20 yang meragukan -> 1.0 netral)
//   implied   = max(1, round(TVL x base x sizeDisc x growth x maturity)), dibatasi 1.0 x TVL
//
// Urutan: implied menurun, seri diputus slug menaik. Rank 1..N.

/** Satu protokol persis seperti yang dibawa snapshot (sepuluh field). */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** Dokumen snapshot utuh. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Konstanta model yang bisa dibaca dashboard. */
export interface ModelConstants {
  base_multiples: Record<string, number>;
  base_default: number;
  size_discount_over_1b: number;
  size_discount_500m_1b: number;
  size_threshold_1b: number;
  size_threshold_500m: number;
  growth_weight: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  neutral_maturity: number;
  doubtful_listed_at: string;
}

export const MODEL: ModelConstants = {
  base_multiples: {
    'Risk Curators': 0.15,
    'Onchain Capital Allocator': 0.15,
    RWA: 0.12,
    Yield: 0.12,
    Lending: 0.1,
  },
  base_default: 0.1,
  size_discount_over_1b: 0.7,
  size_discount_500m_1b: 0.85,
  size_threshold_1b: 1_000_000_000,
  size_threshold_500m: 500_000_000,
  growth_weight: 0.25,
  growth_floor: -30,
  growth_cap: 30,
  maturity_floor: 0.9,
  maturity_range: 0.2,
  maturity_days: 1095,
  neutral_maturity: 1.0,
  doubtful_listed_at: '2025-05-20',
};

export const MODEL_VERSION = 'radar-3';

/** Berapa pre-token di luar watchlist yang dibawa board, menurut TVL. */
export const EARLY_ROWS = 160;
/** Berapa live-token yang dibawa array `live`, menurut market cap. */
export const LIVE_ROWS = 24;

/** Kategori yang tidak boleh masuk lewat jalur early: produk bursa, jembatan, dan staking cair. */
const EARLY_EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
]);

/** Nama yang berakhiran penanda versi (spasi + V2 / v2 / 2.0 dsb.) adalah pool dari protokol lain. */
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Satu langkah farm: aksi, biaya, dan waktunya. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** Satu baris board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token' | 'live-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** Semua yang dibutuhkan dashboard, dari snapshot. `board.rows` hanya berisi
 *  pre-token; `live` membawa live-token dengan bentuk baris yang sama. */
export interface RadarData {
  board: { rows: BoardRow[] };
  live: BoardRow[];
  asOf: string;
  floorUsd: number;
  watchlistCount: number;
  source: string;
  model: ModelConstants;
  modelVersion: string;
  boardSize: number;
  earlySize: number;
  liveSize: number;
}

/** Snapshot yang bentuknya tidak bisa dinilai model ini. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** Angka hingga, atau `fallback` bila bukan angka hingga. */
function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Pembanding deterministik: angka menurun, seri diputus slug menaik. */
function byValueThenSlug<T>(value: (x: T) => number, slug: (x: T) => string): (a: T, b: T) => number {
  return (a, b) => value(b) - value(a) || (slug(a) < slug(b) ? -1 : slug(a) > slug(b) ? 1 : 0);
}

/**
 * Umur protokol dalam hari, dari listed_at sampai as_of. Null bila tanggal
 * listing tidak ada, tidak valid, atau tanggal default yang meragukan
 * (2025-05-20, tanggal yang dipakai DefiLlama untuk banyak protokol yang
 * tanggal aslinya tidak tercatat): umur seperti itu tidak boleh menaikkan
 * atau menurunkan nilai.
 */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null || listedAt === MODEL.doubtful_listed_at) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

/** Kelipatan dasar dari kategori protokol; kategori lain memakai default. */
export function baseMultipleFor(category: string | null, model: ModelConstants): number {
  if (category !== null && Object.hasOwn(model.base_multiples, category)) {
    return model.base_multiples[category]!;
  }
  return model.base_default;
}

/** Diskon ukuran: protokol raksasa dinilai lebih murah per dolar TVL-nya. */
export function sizeDiscountFor(tvlUsd: number, model: ModelConstants): number {
  if (tvlUsd > model.size_threshold_1b) return model.size_discount_over_1b;
  if (tvlUsd >= model.size_threshold_500m) return model.size_discount_500m_1b;
  return 1;
}

/** Pengali pertumbuhan dari perubahan TVL 7 hari, dijepit ke +/-30%. */
export function growthMultiplierFor(change7d: number | null, model: ModelConstants): { pct: number; multiplier: number } {
  const pct = Math.min(model.growth_cap, Math.max(model.growth_floor, finiteNumber(change7d, 0)));
  return { pct, multiplier: 1 + (pct / 100) * model.growth_weight };
}

/** Pengali kematangan dari umur; umur tak diketahui -> netral 1.0. */
export function maturityMultiplierFor(age: number | null, model: ModelConstants): number {
  if (age === null) return model.neutral_maturity;
  const capped = Math.min(Math.max(age, 0), model.maturity_days);
  return model.maturity_floor + (capped / model.maturity_days) * model.maturity_range;
}

/** Penilaian lengkap satu protokol: implied value beserta pengalinya. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; baseMultiple: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const baseMultiple = baseMultipleFor(protocol.category, model);
  const { pct: growthPct, multiplier: growthMult } = growthMultiplierFor(protocol.change_7d, model);
  const maturityMult = maturityMultiplierFor(age, model);
  const sizeDisc = sizeDiscountFor(protocol.tvl_usd, model);
  const raw = protocol.tvl_usd * baseMultiple * sizeDisc * growthMult * maturityMult;
  const implied = Math.min(protocol.tvl_usd, Math.max(1, Math.round(raw)));
  return { implied, baseMultiple, growthPct, growthMult, maturityMult, age };
}

/** Apakah snapshot mencatat tidak ada token untuk protokol ini. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.mcap_usd === null;
}

/** Apakah protokol boleh masuk lewat jalur early (di luar watchlist). */
export function isEarlyEligible(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EARLY_EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  return true;
}

/** Indeks protokol menurut slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Pembulatan ke 4 desimal untuk angka model yang ditulis ke board. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Chain pertama yang dicatat protokol, atau frasa netral bila tidak ada. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Tier modal satu posisi farm, dari TVL protokol sendiri. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** Lama tahan posisi, dari umur: protokol muda diberi jendela kualifikasi lebih panjang. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Aksi utama farming menurut kategori protokol. Selalu menyebut nama dan chain. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Lend $${capital} of USDC on ${name} (${p.category ?? 'Lending'}) on ${chain} and leave the supply position open.`;
  }
  if (c.includes('dex') || c.includes('yield aggregator') || c.includes('leveraged farm')) {
    return `Add $${capital} of liquidity to the main ${name} pool on ${chain} and leave the position open.`;
  }
  if (c.includes('yield')) {
    return `Deposit $${capital} into the highest-yield ${name} vault on ${chain} and hold the receipt tokens.`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC into ${chain} through ${name} and put the bridged funds to work in its app.`;
  }
  if (c.includes('restak') || c.includes('staking')) {
    return `Stake $${capital} of the chain asset through ${name} on ${chain} and hold the staking receipt.`;
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} (${p.category ?? 'Prediction Market'}) on ${chain} and take one market position.`;
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return `Allocate $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of the yield-bearing asset from ${name} on ${chain} and hold it.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  return `Deposit $${capital} of USDC into ${name} (${p.category ?? 'protocol'}) on ${chain} and keep the position open.`;
}

/** Satu langkah sebagai string tunggal: aksi, lalu biaya dan waktunya. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 597)}...`;
  if (s.length < 20) s = `${s} Keep the ${step.text} position open and re-check the protocol page.`;
  return s;
}

/**
 * Rencana farm enam langkah. Setiap langkah menyebut nama protokol (dan
 * chain/kategorinya bila relevan), membawa biaya dan waktu, dan diturunkan
 * dari catatan protokol sendiri: kategori, chain, TVL, dan umur.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const category = p.category ?? 'protocol';
  const live = !isPreToken(p);
  return [
    {
      text: `Open a fresh wallet used only for ${p.name} on ${chain}, store its seed phrase offline, and fund it with gas for ${chain}.`,
      cost: 'about $3 of gas for the setup',
      time: '10 minutes to prepare',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital plus about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: live
        ? `Do one qualifying action a week on ${p.name} — a deposit, a swap, or a vote — because its token already trades, so only ongoing ${category} activity on ${chain} still earns rewards.`
        : `Do one qualifying action a week on ${p.name} — a deposit, a swap, or a vote — so the wallet stays visibly active in ${category} on ${chain}.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the $${capital} position in ${p.name} for at least ${hold} days so the activity spans more than one snapshot window on ${chain}.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before withdrawing from ${p.name}, open its own points or rewards page from the link the protocol itself publishes and claim only there; never pay anyone to claim for you.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Log the wallet, the dates, and every ${p.name} transaction on ${chain} in a farm log, so the ${category} position can be repeated or unwound cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** Satu baris board lengkap dari satu protokol dan hasil penilaiannya. */
function toBoardRow(p: SnapshotProtocol, v: ReturnType<typeof impliedValue>, rank: number): BoardRow {
  return {
    rank,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: isPreToken(p) ? 'pre-token' : 'live-token',
    age_days: v.age,
    implied_value_usd: v.implied,
    model: {
      base_multiple: v.baseMultiple,
      growth_pct: v.growthPct,
      growth_multiplier: round4(v.growthMult),
      maturity_multiplier: round4(v.maturityMult),
      age_days: v.age,
    },
    farm_steps: farmSteps(p, v.age).map(stepText),
  };
}

/**
 * Board 200 baris pre-token saja: watchlist + early, dinilai dan berperingkat
 * 1..200. Di snapshot ini seluruh watchlist (40) adalah pre-token, jadi board
 * tidak memuat satu pun live-token.
 */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isEarlyEligible(p))
    .sort(byValueThenSlug((p) => p.tvl_usd, (p) => p.slug))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, model) }));
  scored.sort(byValueThenSlug((s) => s.v.implied, (s) => s.p.slug));
  return scored.map((s, i) => toBoardRow(s.p, s.v, i + 1));
}

/**
 * Live-token 24 baris untuk tab Live di dashboard, menurut market cap
 * (gecko_id non-null DAN mcap non-null). Bentuk barisnya sama seperti baris
 * board — token_status 'live-token', farm_steps, objek model, dan implied
 * yang dihitung dengan rumus yang sama — dan diperingkat 1..24 menurut
 * market cap, terpisah dari ranking pre-token board.
 */
export function liveRows(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const live = snapshot.protocols
    .filter((p) => p.gecko_id !== null && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS);
  return live.map((p, i) => toBoardRow(p, impliedValue(p, snapshot.as_of, model), i + 1));
}

/** Semua yang dibutuhkan dashboard, dari snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    board: { rows: board },
    live,
    asOf: snapshot.as_of,
    floorUsd: snapshot.floor_usd,
    watchlistCount: snapshot.watchlist.length,
    source: snapshot.source,
    model,
    modelVersion: MODEL_VERSION,
    boardSize: board.length,
    earlySize: early,
    liveSize: live.length,
  };
  return { board, radar };
}

/** Snapshot dari teks file, ditolak bila bentuknya bukan yang dinilai model ini. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || p.slug.length === 0 || typeof p.name !== 'string' || p.name.length === 0) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug or a name`);
    }
    if (typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd) || p.tvl_usd < 0) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  const seen = new Set<string>();
  for (const p of protocols) {
    if (seen.has(p.slug)) throw new SnapshotError(`snapshot.json repeats slug ${p.slug}`);
    seen.add(p.slug);
  }
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/**
 * Alasan board tidak lolos gate, atau null bila lolos: cakupan watchlist,
 * board hanya pre-token, rank 1..N, implied tidak naik seiring rank, tidak
 * semua sama, farm steps, dan implied positif.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows, under the gate's 100`;
  const slugs = new Set<string>();
  for (const r of board) {
    if (slugs.has(r.slug)) return `the board repeats slug ${r.slug}`;
    slugs.add(r.slug);
  }
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `the board invents slug ${r.slug}`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  for (const r of board) {
    if (r.token_status !== 'pre-token') return `the board holds ${r.slug}, a ${r.token_status} row: the board is pre-token only`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd > r.tvl_usd) return `${r.slug} has implied value above its TVL`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** data.js: seluruh dataset dashboard sebagai satu script, tanpa fetch dan tanpa network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
