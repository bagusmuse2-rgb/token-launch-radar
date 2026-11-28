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
// pre-token di luar watchlist dengan implied value tertinggi. Live-token tidak masuk
// board: 24 live-token dengan market cap terbesar dibawa terpisah di array
// `live` (bentuk baris sama seperti board, implied dihitung rumus yang sama)
// agar dashboard bisa menampilkannya di tab Live tanpa mencampuri ranking
// pre-token.
//
// Implied value, untuk setiap baris (radar-5):
//
//   base      = TVL x BASE_MULTIPLE[kategori]   (dikalibrasi dari live-token, lihat MODEL)
//   sizeDisc  = 1.00 di bawah $50 jt; 0.612 $50-100 jt; 0.372 $100-500 jt;
//               0.248 $500 jt-$1 M; 0.164 $1-5 M; 0.087 di atas $5 M
//   growth    = 1 + clip(change_7d, -60, +60) / 100 x 0.5   (null -> 0)
//   maturity  = 0.7 + min(umur_hari, 1095) / 1095 x 0.5
//               (listed_at null, atau tanggal default 2025-05-20 yang meragukan -> 1.0 netral)
//   implied   = max(1, round(TVL x base x sizeDisc x growth x maturity)), dibatasi 1.0 x TVL
//
// Kalibrasi base (snapshot 2026-11-14, 758 protokol) — dua langkah, keduanya
// dari 128 live-token bermcap > $0:
//   1. Efek ukuran: log(mcap/TVL) diregresi ke log(TVL) — slope -0,392
//      (rasio jatuh ~2,5x tiap 10x TVL; median mentah per bucket: <$50 jt
//      0,419; $50-100 jt 0,171; $100-500 jt 0,125; $500 jt-$1 M 0,034;
//      $1-5 M 0,029; >$5 M 0,044 — pola yang sama muncul di data segar
//      28 Nov 2026: 0,412; 0,180; 0,133; 0,031; 0,037; 0,039). Slope itu
//      didiskretkan ke enam tier di atas (titik tengah tiap bucket).
//   2. Base per kategori: median RESIDUAL mcap/(TVL x sizeDisc x growth x
//      maturity) per kategori (rasio di-winsorize 0,005-2,0; hanya n>=5),
//      di-shrink ke median residual global 0,320 dengan bobot n/(n+5), lalu
//      dibatasi 0,05-0,60. Langkah residual ini yang memperbaiki radar-4:
//      base radar-4 dikalibrasi dari median mcap/TVL mentah, padahal
//      sizeDisc x growth x maturity yang dikalikan sesudahnya rata-rata
//      ~0,8 — jadi implied sistematis 20% di bawah mcap.
// Residual median per kategori: Lending 0,194 (n=15) · Dexs 0,309 (n=11) ·
// Yield 0,402 (n=9) · Liquid Staking 0,117 (n=9) · CEX 0,645 (n=9) ·
// RWA 0,415 (n=9) · Canonical Bridge 1,279 (n=8) · Basis Trading 1,117
// (n=7) · Bridge 0,667 (n=6). Canonical Bridge dan Basis Trading kena cap
// 0,60 setelah shrink. Kategori n<5 memakai default 0,320 (median residual
// global). Median mcap/TVL mentah per kategori tetap disimpan di
// `live_category_medians` (dan median global mentah 0,169 di
// `global_live_median`) sebagai benchmark mentah untuk modal dashboard;
// median mcap/TVL mentah per bucket TVL disimpan di `live_size_medians`.
//
// Growth dan maturity BUKAN klaim prediktif: pada 128 live-token bermcap > $0,
// korelasi log(mcap/TVL) dengan change_7d adalah 0,004 dan dengan umur 0,063
// — praktis nol. Keduanya adalah prior penilaian yang diminta kriteria
// (model harus memakai momentum 7 hari dan lama tanpa token), jadi bobotnya
// dijaga kecil di samping base dan diskon ukuran.
//
// VALIDASI pada 128 live-token bermcap > $0 (implied dihitung rumus yang sama,
// dibandingkan dengan mcap sebenarnya):
//   radar-3: median implied/mcap 0,453; 29/128 dalam 0,5-2x; 64/128 dalam 0,25-4x
//   radar-4: median implied/mcap 0,804; 40/128 dalam 0,5-2x; 66/128 dalam 0,25-4x
//   radar-5: median implied/mcap 1,050; 40/128 dalam 0,5-2x; 77/128 dalam 0,25-4x;
//            mean |log error| 1,538 (radar-4: 1,639); menang berpasangan atas
//            radar-4 di 72/128 token
//   radar-5 di set segar (120 live-token DefiLlama 28 Nov 2026, TVL>=$5 jt):
//            median 1,122; 40/120 dalam 0,5-2x; 71/120 dalam 0,25-4x;
//            mean |log error| 1,473 (radar-4: 1,569); menang berpasangan 71/120
// Model starter (base datar 0,25, tanpa diskon ukuran) sebagai pembanding:
// median 1,199; 37/128 dalam 0,5-2x. Radar-5 memusatkan median ke ~1,0 dan
// memperbaiki hit 0,25-4x di kedua set tanpa merusak hit 0,5-2x.
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

/** Satu tingkat diskon ukuran: TVL >= min_tvl memakai discount. */
export interface SizeTier {
  min_tvl: number;
  discount: number;
}

/** Median rasio mcap/TVL live-token untuk satu kategori (kalibrasi). */
export interface CategoryBenchmark {
  n: number;
  median: number;
}

/** Median rasio mcap/TVL mentah live-token untuk satu bucket TVL. */
export interface SizeBucketBenchmark {
  min_tvl: number;
  median: number;
  n: number;
}

/** Konstanta model yang bisa dibaca dashboard. */
export interface ModelConstants {
  base_multiples: Record<string, number>;
  base_default: number;
  size_tiers: SizeTier[];
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  neutral_maturity: number;
  doubtful_listed_at: string;
  global_live_median: number;
  global_live_n: number;
  live_category_medians: Record<string, CategoryBenchmark>;
  /** Median mcap/TVL mentah per bucket TVL (benchmark ukuran di modal). */
  live_size_medians: SizeBucketBenchmark[];
}

export const MODEL: ModelConstants = {
  // Base per kategori (n>=5 saja), hasil shrink median RESIDUAL
  // mcap/(TVL x sizeDisc x growth x maturity) ke median residual global
  // 0,320 — bobot n/(n+5) — lalu clamp 0,05-0,60:
  //   Basis Trading 0,600 (n=7, residual 1,117 -> kena cap) ·
  //   Canonical Bridge 0,600 (n=8, residual 1,279 -> kena cap) ·
  //   CEX 0,529 (n=9, residual 0,645) · Bridge 0,510 (n=6, residual 0,667)
  //   RWA 0,381 (n=9, residual 0,415) · Yield 0,373 (n=9, residual 0,402)
  //   Dexs 0,312 (n=11, residual 0,309) · Lending 0,226 (n=15, residual 0,194)
  //   Liquid Staking 0,190 (n=9, residual 0,117)
  base_multiples: {
    'Basis Trading': 0.6,
    'Canonical Bridge': 0.6,
    CEX: 0.529,
    Bridge: 0.51,
    RWA: 0.381,
    Yield: 0.373,
    Dexs: 0.312,
    Lending: 0.226,
    'Liquid Staking': 0.19,
  },
  base_default: 0.32,
  // Diskon ukuran bertingkat, dari yang terkecil ke yang terbesar. Tier
  // tertinggi dulu saat dicocokkan (sizeDiscountFor memakai yang pertama cocok).
  // Enam tier dari fit power-law log(mcap/TVL) ~ log(TVL), slope -0,392:
  // titik tengah tiap bucket TVL (lihat live_size_medians).
  size_tiers: [
    { min_tvl: 5_000_000_000, discount: 0.087 },
    { min_tvl: 1_000_000_000, discount: 0.164 },
    { min_tvl: 500_000_000, discount: 0.248 },
    { min_tvl: 100_000_000, discount: 0.372 },
    { min_tvl: 50_000_000, discount: 0.612 },
  ],
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 60,
  maturity_floor: 0.7,
  maturity_range: 0.5,
  maturity_days: 1095,
  neutral_maturity: 1.0,
  doubtful_listed_at: '2025-05-20',
  global_live_median: 0.169,
  global_live_n: 144,
  // Median rasio mcap/TVL live-token per kategori (n>=5), winsorized
  // 0,005-2,0 — dipakai dashboard sebagai benchmark di modal detail.
  live_category_medians: {
    Lending: { n: 15, median: 0.132 },
    Yield: { n: 13, median: 0.121 },
    'Liquid Staking': { n: 11, median: 0.034 },
    Dexs: { n: 11, median: 0.342 },
    CEX: { n: 11, median: 0.062 },
    RWA: { n: 9, median: 0.275 },
    'Canonical Bridge': { n: 8, median: 0.746 },
    'Basis Trading': { n: 8, median: 0.482 },
    Bridge: { n: 8, median: 0.088 },
    'Yield Aggregator': { n: 5, median: 0.05 },
  },
  // Median rasio mcap/TVL mentah per bucket TVL (128 live-token bermcap > $0,
  // winsorized 0,005-2,0) — benchmark ukuran di modal detail: protokol besar
  // diperdagangkan jauh lebih murah per dolar TVL daripada yang kecil.
  // Pola yang sama di data segar 28 Nov 2026 (0,412; 0,180; 0,133; 0,031;
  // 0,037; 0,039).
  live_size_medians: [
    { min_tvl: 0, median: 0.419, n: 76 },
    { min_tvl: 50_000_000, median: 0.171, n: 20 },
    { min_tvl: 100_000_000, median: 0.125, n: 15 },
    { min_tvl: 500_000_000, median: 0.034, n: 3 },
    { min_tvl: 1_000_000_000, median: 0.029, n: 10 },
    { min_tvl: 5_000_000_000, median: 0.044, n: 4 },
  ],
};

export const MODEL_VERSION = 'radar-5';

/** Berapa pre-token di luar watchlist yang dibawa board, menurut implied value. */
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
  watchlist: string[];
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

/** Diskon ukuran bertingkat: tier pertama (TVL terbesar) yang cocok menang; di bawah tier terendah tidak ada diskon. */
export function sizeDiscountFor(tvlUsd: number, model: ModelConstants): number {
  for (const tier of model.size_tiers) {
    if (tvlUsd >= tier.min_tvl) return tier.discount;
  }
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

/** Chain kedua protokol, bila multi-chain — disebut di rencana bila relevan. */
function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/**
 * Kisaran biaya gas satu transaksi di chain pertama. Bukan presisi palsu:
 * Ethereum mainnet mahal (dolar), L2 dan BNB Chain murah (sen sampai $1),
 * Solana paling murah (sen), Bitcoin di antaranya. Chain lain yang tidak
 * bernama di sini memakai kisaran L2/alt-L1 yang umum ($0.10-$1).
 */
function gasRangeFor(chain: string): string {
  if (chain === 'Ethereum') return '$5-$15';
  if (chain === 'Solana') return '$0.01-$0.10';
  if (chain === 'Bitcoin') return '$1-$5';
  return '$0.10-$1';
}

/** Tier modal satu posisi farm, dari TVL protokol sendiri. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 25_000_000) return 75;
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
  if (c.includes('basis trading')) {
    return `Open a delta-neutral position on ${name} on ${chain}: deposit $${capital} of USDC as collateral, hold the yield-bearing position, and hedge the price exposure with a short of the same size, so funding-rate yield — not price moves — is what the position earns.`;
  }
  if (c.includes('anchor btc') || c.includes('restaked btc') || c.includes('decentralized btc')) {
    return `Deposit $${capital} worth of BTC through ${name} on ${chain} and hold the BTC-backed receipt token it issues.`;
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Lend $${capital} of USDC on ${name} (${p.category ?? 'Lending'}) on ${chain} and leave the supply position open.`;
  }
  if (c.includes('dex') || c.includes('yield aggregator') || c.includes('leveraged farm')) {
    return `Add $${capital} of liquidity to the main ${name} pool on ${chain} and leave the position open.`;
  }
  if (c.includes('liquidity manager')) {
    return `Deposit $${capital} into a managed ${name} vault on ${chain} and hold the vault shares while it rebalances the range for you.`;
  }
  if (c.includes('yield') || c.includes('farm')) {
    return `Deposit $${capital} into the highest-yield ${name} vault on ${chain} and hold the receipt tokens.`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC into ${chain} through ${name} and put the bridged funds to work in its app.`;
  }
  if (c.includes('chain') && !c.includes('cross')) {
    return `Bridge $${capital} of USDC onto ${name} (${chain}) and use it in the chain's own flagship app, keeping the position open.`;
  }
  if (c.includes('restak') || c.includes('staking')) {
    return `Stake $${capital} of the chain asset through ${name} on ${chain} and hold the staking receipt.`;
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  }
  if (c.includes('options')) {
    return `Deposit $${capital} of USDC as collateral on ${name} on ${chain} and open one small hedged options position.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} (${p.category ?? 'Prediction Market'}) on ${chain} and take one market position.`;
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return `Allocate $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
  }
  if (c.includes('stablecoin issuer') || c.includes('stablecoin wrapper') || c.includes('dual-token') || c.includes('algo-stable')) {
    return `Mint $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of the yield-bearing asset from ${name} on ${chain} and hold it.`;
  }
  if (c.includes('payments') || c.includes('card issuer')) {
    return `Route $${capital} of USDC through ${name} on ${chain} as a real payment and keep the transaction receipt.`;
  }
  if (c.includes('indexes')) {
    return `Buy $${capital} of the ${name} index token on ${chain} and hold it.`;
  }
  if (c.includes('governance')) {
    return `Lock or delegate $${capital} of the governance asset through ${name} on ${chain} and cast one vote.`;
  }
  if (c.includes('otc')) {
    return `Fill a $${capital} trade through the ${name} OTC desk on ${chain} and keep the settlement receipt.`;
  }
  if (c.includes('cedefi')) {
    return `Deposit $${capital} of USDC into ${name} on ${chain}, hold the CeDeFi receipt, and read the custodian terms before depositing.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  return `Deposit $${capital} of USDC into ${name} (${p.category ?? 'protocol'}) on ${chain} and keep the position open.`;
}

/** Aksi mingguan agar wallet tetap terlihat aktif — beda tiap kelompok kategori. */
function weeklyFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('basis trading')) {
    return `Check the funding rate on ${name} once a week and rebalance the hedge if the rate flips, so the delta-neutral position on ${chain} stays hedged.`;
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Check the supply rate on ${name} once a week and top the position up if the rate falls, so the ${chain} lending position stays active.`;
  }
  if (c.includes('dex') || c.includes('liquidity manager') || c.includes('yield aggregator')) {
    return `Check the pool APR on ${name} once a week and move the position if a better pool opens on ${chain}.`;
  }
  if (c.includes('yield') || c.includes('farm')) {
    return `Check the vault yield on ${name} once a week and move to a better vault on ${chain} if this one dries up.`;
  }
  if (c.includes('bridge') || (c.includes('chain') && !c.includes('cross'))) {
    return `Do one small swap or transfer on ${name} each week so the wallet keeps a fresh ${chain} transaction history.`;
  }
  if (c.includes('restak') || c.includes('staking')) {
    return `Check the staking rewards on ${name} once a week and restake or claim them on ${chain}.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Check the margin health on ${name} once a week and trim the position if it drifts toward liquidation on ${chain}.`;
  }
  if (c.includes('payments') || c.includes('card issuer')) {
    return `Make one small real payment through ${name} each week so the ${chain} payment history stays fresh.`;
  }
  if (c.includes('prediction')) {
    return `Take one small market position on ${name} each week so the wallet stays active on ${chain}.`;
  }
  if (c.includes('rwa') || c.includes('stable')) {
    return `Check the yield accrual and redemption terms on ${name} once a week so the ${chain} position is never locked by surprise.`;
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return `Check the vault allocation on ${name} once a week and reallocate if the curator moves funds on ${chain}.`;
  }
  if (c.includes('insurance')) {
    return `Check the cover on ${name} once a week and renew it before it lapses on ${chain}.`;
  }
  if (c.includes('governance')) {
    return `Vote on one live proposal on ${name} each week so the ${chain} governance record stays active.`;
  }
  return `Do one qualifying action a week on ${name} — a deposit, a swap, or a vote — so the wallet stays visibly active in ${p.category ?? 'protocol'} on ${chain}.`;
}

/** Cara memeriksa dan mengklaim — beda tiap kelompok kategori. */
function claimFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('basis trading')) {
    return `Before withdrawing from ${name}, open its own points page from the link the protocol itself publishes, check the funding PnL of the hedge, and claim only there; never pay anyone to claim for you.`;
  }
  if (c.includes('payments') || c.includes('card issuer')) {
    return `Before withdrawing from ${name}, open its own rewards page from the link the protocol itself publishes and claim only there; never pay anyone to claim for you.`;
  }
  if (c.includes('restak') || c.includes('staking')) {
    return `Before withdrawing from ${name}, open its own staking rewards page from the link the protocol itself publishes, claim the accrued rewards, and unstake only there; never pay anyone to claim for you.`;
  }
  if (c.includes('rwa')) {
    return `Before withdrawing from ${name}, open its own points or rewards page from the link the protocol itself publishes, check the redemption window, and claim only there; never pay anyone to claim for you.`;
  }
  return `Before withdrawing from ${name}, open its own points or rewards page from the link the protocol itself publishes and claim only there; never pay anyone to claim for you.`;
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
 * dari catatan protokol sendiri: kategori, chain, TVL, dan umur. Biaya gas
 * mengikuti chain pertama (Ethereum mahal, L2/BNB murah, Solana paling
 * murah); langkah mingguan dan langkah klaim dibedakan per kategori; bila
 * protokol multi-chain, chain keduanya disebut di langkah tahan.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasRangeFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const category = p.category ?? 'protocol';
  const live = !isPreToken(p);
  const second = secondChainOf(p);
  const holdText =
    `Hold the $${capital} position in ${p.name} for at least ${hold} days so the activity spans more than one snapshot window on ${chain}.` +
    (second !== null ? ` The protocol is also live on ${second}; the same wallet active there counts as separate activity.` : '');
  return [
    {
      text: `Open a fresh wallet used only for ${p.name} on ${chain}, store its seed phrase offline, and fund it with gas for ${chain}.`,
      cost: `about ${gas} of gas for the setup`,
      time: '10 minutes to prepare',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital plus about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: live
        ? `${weeklyFor(p, chain)} Its token already trades, so only ongoing ${category} activity on ${chain} still earns rewards.`
        : weeklyFor(p, chain),
      cost: `about ${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: holdText,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: claimFor(p),
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
 * 1..200. Early dipilih BERDASARKAN implied value, bukan TVL: semua kandidat
 * early yang eligible dinilai dulu dengan impliedValue(), lalu 160 teratas
 * diambil (seri diputus slug menaik). Di snapshot ini seluruh watchlist (40)
 * adalah pre-token, jadi board tidak memuat satu pun live-token.
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
    .map((p) => ({ p, v: impliedValue(p, snapshot.as_of, model) }))
    .sort(byValueThenSlug((s) => s.v.implied, (s) => s.p.slug))
    .slice(0, EARLY_ROWS)
    .map((s) => s.p);
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
    watchlist: [...snapshot.watchlist],
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
