# BUILD_LOG — model + program utama (token-radar-01)

Repo: `~/workspace/makefun-token-radar/` (lokal saja; belum di-push, belum di-submit).
Tanggal: 2026-11-24. Bahasa kerja: Indonesia.

## Langkah kerja

1. Baca sumber kit (jangan salin): `/tmp/radar-kit/token-radar-01-kit/RULES.txt`,
   `starter/main.ts`, `starter/lib/model.ts`, `starter/vendor/makefun-board.ts`.
2. Periksa snapshot kit dengan Python: 758 protokol, watchlist 40, `as_of`
   2026-11-14, floor $50.000.000; 600 protokol pre-token ketat (gecko_id null
   DAN mcap_usd null); 11 protokol ber-`listed_at` 2025-05-20 (tanggal default
   meragukan); 113 `listed_at` null; 299 kandidat early (setelah pengecualian
   kategori + nama berversi).
3. Scaffold repo: `LICENSE` MIT (dari starter), `.gitignore`
   (node_modules, out/), `README.md` (cara jalan, model, struktur, status).
4. Salin `vendor/makefun-board.ts` apa adanya dari kit (wajib dari kit;
   diverifikasi identik byte demi byte dengan `diff`).
5. Tulis `lib/model.ts` dari nol (604 baris): model implied value radar-2,
   seleksi board 220 baris, farm steps 6 langkah, validasi `boardIssue`,
   `parseSnapshot`, `dataScript`.
6. Tulis `main.ts` dari nol (121 baris): baca snapshot, validasi, tulis
   board.json + data.js, salin rekursif dashboard/ + screenshots/, cek
   screenshot >= 3, tulis dossier.json via `buildDossier`.
7. Run lokal 1 — dashboard/screenshots masih kosong: exit 1 sesuai
   rancangan (`screenshots/ holds 0 images`), tapi board.json + data.js
   sudah tertulis. Validasi board via Python: 220 baris, 40 watchlist,
   200 pre-token + 20 live-token, rank 1..220 benar, implied menurun,
   farm steps 6/baris @ 137–257 karakter, implied <= TVL.
8. Run lokal 2 — validasi pipeline penuh: buat 3 PNG placeholder sementara
   (1200x800, warna solid, dibuat via script Node di /tmp, BUKAN screenshot
   asli) di `screenshots/`, jalankan main.ts: exit 0, dossier.json tertulis
   (37.477 byte, 3 gambar, teks 18.115 byte). Catatan: saat run ini,
   `dashboard/` sudah berisi `index.html` + `app.css` dari agen dashboard
   yang bekerja paralel di repo yang sama — bukan file saya, tidak saya ubah.
9. Uji determinisme: jalankan ulang ke `out2/`, sha256 board.json, data.js,
   dan dossier.json identik dengan run sebelumnya. `out2/` dihapus.
10. Hapus 3 PNG placeholder dari `screenshots/` (kembalikan ke folder kosong
    sesuai rencana); `out/` (hasil run sukses) dibiarkan sebagai bukti run
    — `out/` ada di `.gitignore`.

## Hasil run (snapshot kit, run 2, exit 0)

- 758 protokol, 40 watchlist, 220 baris (200 pre-token, 20 live-token).
- 5 teratas: 1 OKX $1.988.882.198 (live, CEX) · 2 Lido $1.264.731.066
  (live, Liquid Staking) · 3 Morpho Blue $786.494.320 (pre, Lending) ·
  4 Gate $412.412.753 (live, CEX) · 5 Ethena USDe $371.341.554
  (pre, Basis Trading).
- 5 terbawah: 216 Adrastea Validator $2.070.917 · 217 Anvil $1.292.941
  (live) · 218 FlokiFi Locker $1.075.876 (live) · 219 Nexo $1.034.646
  (live) · 220 Rain $593.169 (live).
- board.json 359.700 byte; data.js 89.876 byte; dossier.json 37.477 byte.

## Revisi radar-3 (2026-11-24, sore) — board pre-token saja + array `live` terpisah

Masalah: board 220 baris lama menempatkan live-token raksasa di rank 1, 2, 4
(OKX, Lido, Gate) karena implied dihitung dari TVL besar mereka — radar yang
buruk untuk juri yang menilai pemisahan pre-token vs live-token.

Perubahan di `lib/model.ts` (`MODEL_VERSION = radar-3`):
- `buildBoard` tidak lagi memilih 20 live-token: board 200 baris pre-token
  saja (40 watchlist + 160 early dengan TVL tertinggi). Ke-40 watchlist
  snapshot ini semuanya pre-token (dicek via Python), jadi board tidak
  memuat satu pun live-token.
- `liveRows` baru: 24 live-token teratas menurut mcap (gecko_id non-null DAN
  mcap non-null), masing-masing bentuk baris penuh seperti baris board
  (`token_status: 'live-token'`, `farm_steps` 6 langkah, objek `model`,
  implied dari rumus yang sama), diperingkat 1..24 menurut market cap.
  Helper `toBoardRow` dipakai bersama board dan live agar bentuknya identik.
- `RadarData`/`data.js` baru: `window.RADAR = {board: {rows: [...]}, live:
  [...], asOf, floorUsd, watchlistCount, source, model, modelVersion,
  boardSize, earlySize, liveSize}`. Baris board di data.js kini juga bentuk
  penuh (sebelumnya ringkas tanpa farm_steps/model), jadi modal detail
  dashboard bisa menampilkan farm plan dan breakdown untuk baris board.
  `dashboard/app.js` (agen lain) sudah membaca bentuk ini — `DATA.board.rows`,
  `DATA.live`, `DATA.asOf`, `DATA.floorUsd`, `DATA.watchlistCount` — dengan
  fallback ke bentuk lama, jadi tidak perlu diubah.
- `boardIssue` kini menolak board yang memuat baris non-pre-token.
- `main.ts`: ringkasan stdout menyebut board pre-token + array live terpisah.
- `README.md` diperbarui (board 200, array live, radar-3, struktur data.js).

Validasi run lokal (snapshot kit, 2 run ke /tmp/radar-run-a dan
/tmp/radar-run-b, keduanya exit 1 sesuai rancangan karena `screenshots/`
kosong — board.json + data.js sudah tertulis sebelum cek screenshot):
- sha256 board.json identik antar-run
  (ac67a87d…), sha256 data.js identik (a726eee4…).
- 200 baris, 40 watchlist ter-cover, 160 early, rank 1..200 benar, implied
  menurun, implied <= TVL, farm steps 6/baris @ 20–600 karakter.
- `live`: 24 baris, semua live-token, mcap menurun, rank 1..24, tanpa irisan
  slug dengan board; implied live + board dicocokkan ulang dengan rumus via
  Python (semua cocok).
- data.js lolos `node -e` (window.RADAR terbaca: board 200, live 24).

Hasil run baru (radar-3):
- 5 teratas: 1 Morpho Blue $786.494.320 (pre, Lending) · 2 Ethena USDe
  $371.341.554 (pre, Basis Trading) · 3 SparkLend $327.745.013 (pre,
  Lending) · 4 Spark Liquidity Layer $302.540.690 (pre, Onchain Capital
  Allocator) · 5 Steakhouse Financial $287.582.332 (pre, Risk Curators).
- 5 terbawah: 196 XION Finance $2.159.816 · 197 GMX Solana $2.132.949 ·
  198 Rhea Dex $2.128.247 · 199 Phoenix Perp $2.108.158 · 200 Adrastea
  Validator $2.070.917.
- 5 teratas live (mcap): 1 Rain $2.646.363.290 · 2 OKX $1.969.858.392 ·
  3 Aave V2 $1.723.499.485 · 4 Mantle Bridge $1.332.654.362 · 5 Bitway Earn
  $1.208.793.873. OKX/Lido/Gate sudah tidak ada di board.
- board.json 324.320 byte; data.js 367.103 byte (membesar karena baris board
  kini bentuk penuh).

## Run final + screenshot asli (2026-11-24, malam) — SEMUA GATE LOLOS

Screenshot (asli, bukan placeholder):
- Lingkungan VM awalnya tanpa browser: tidak ada chromium/chrome/firefox,
  tidak ada playwright/puppeteer. `npx playwright install chromium` gagal
  mengunduh (download failure, code=1, Chrome for Testing 159.0.8154.6).
  Solusi: unduh `google-chrome-stable_current_amd64.deb` langsung dari
  dl.google.com (152.741.120 byte) lalu `dpkg -i` + `apt-get install -f`;
  Chrome 158.0.8127.88 terinstal. Render via Playwright (npm, /tmp/shot)
  dengan `executablePath: /usr/bin/google-chrome-stable`,
  `args: ['--no-sandbox']` (jalan sebagai root), viewport 1440x900,
  dari `file://…/out/dashboard/index.html` (data.js hasil run).
- `screenshots/1-board.png`: 1440x900 PNG, 186.135 byte (182 KiB) — board
  tab Pre-token, 200 of 200 shown, rank 1 Morpho Blue $786.5M.
- `screenshots/2-detail.png`: 1440x900 PNG, 175.962 byte (172 KiB) — detail
  via hash `#/protocol/morpho-blue`, modal "RANK 1 OF 200", TVL $10.41B.
- `screenshots/3-filtered.png`: 1440x900 PNG, 187.117 byte (183 KiB) —
  filter kategori "Risk Curators" via `<select id="category">`,
  "22 of 200 shown", teratas Steakhouse Financial rank 5 $287.6M.
- Ketiganya dicek visual: board ter-render penuh (statistik, model, tabel),
  modal detail terbuka, filter aktif. Total 549.214 byte, jauh di bawah
  batas 512 KiB/gambar.
- Catatan: sempat dicoba detail Steakhouse Financial sebagai alternatif
  (rantai lebih sedikit sehingga Model Breakdown muat di viewport) — tidak
  dipakai karena modalnya menampilkan peringatan yang menyesatkan (lihat
  "Masalah yang belum selesai").

Run final (snapshot kit, `out/` lama radar-2 dihapus dulu):
- Run 1 ke `out/`: exit 0. `758 protocols, 40 on the watchlist, 200 rows
  scored (all pre-token) and 24 live-token rows in a separate array`.
- Run 2 ke `/tmp/radar-final-b`: exit 0.
- sha256 identik antar-run:
  board.json `ac67a87de8ba4e3110df5e3e2b024d621008cbe3392548575982c056ec79dd36`
  data.js `a726eee49c8ab4cc03c0bf0e92d5124ba1c1a34377050db32d221a7deb63af69`
  dossier.json `77c091627533c9098f270945506a538bc4753f6c11f920bfa4efac2d03703488`
  (sama dengan sha board/data dari validasi radar-3 sebelumnya).
- board.json 324.320 byte; data.js 367.103 byte; dossier.json 772.020 byte.

Verifikasi semua gate (script di /tmp/verify-final.py +
/tmp/shot/recompute-dossier.mts, bukan di repo) — SEMUA LOLOS:
- dashboard_files: 3 file (index.html + app.css + app.js), 37.932 byte
  (<=4 MiB), tanpa http:// atau https:// di file dashboard.
- board_file: 200 baris, 0 slug tak dikenal snapshot, 0 nama kosong,
  0 rank/implied buruk (implied bulat positif, <= 100 triliun).
- sorted_by_value: rank tepat 1..200, implied tak naik seiring rank,
  200 nilai unik, top $786.494.320, bottom $2.070.917.
- coverage: 40/40 watchlist tercakup.
- farm_steps: 0 baris buruk, 6 langkah/baris, panjang 137–257 karakter.
- screenshots: 3 gambar, nama valid, PNG utuh (PIL load OK), 1440x900,
  172–183 KiB (<=512 KiB), sisi panjang 1440, sisi pendek 900.
- dossier_matches: hitung ulang buildDossier atas out/ menghasilkan byte
  identik dengan dossier.json (772.020 byte, <=1,5 MiB), schema
  makefun/dossier/v1, 3 gambar.
- Total sumber dashboard 37.932 byte (< 64 KB).

## Perbaikan bug tampilan dashboard (2026-11-24, malam) — SELESAI

Dua bug tampilan di `dashboard/app.js` (board/model tidak diubah — sha256
board.json dan data.js tetap `ac67a87d…` / `a726eee4…` seperti run final):

1. `breakdown()` tidak mengalikan size discount → modal detail menampilkan
   peringatan menyesatkan "differs from the board; the data may be stale."
   Perbaikan: helper baru `sizeDiscount(tvl)` membaca `DATA.model`
   (`size_discount_over_1b` 0,7 / `size_threshold_1b` $1B;
   `size_discount_500m_1b` 0,85 / `size_threshold_500m` $500jt; 1 di
   bawahnya) dan `recomputed` kini `min(tvl, max(1, round(tvl × base ×
   sizeDisc × growth × maturity)))` — sama persis dengan `impliedValue` di
   `lib/model.ts`. Modal juga menampilkan baris baru "Size discount — TVL
   over $1B × 0.7" (atau "$500M–$1B × 0.85" / "under $500M × 1").
   Angka sebelum/sesudah (hitung ulang modal dari pengali baris yang
   dibulatkan 4 desimal, jadi ada sisa pembulatan kecil — dalam toleransi
   0,1% modal):
   - Steakhouse Financial: sebelum $410.825.190 vs board $287.582.332 →
     sesudah $287.577.633 (selisih −$4.699, 0,0016%) → "matches the board
     (within rounding)". Hitung ulang penuh dari input mentah (Python,
     pengali eksak) cocok persis $287.582.332 untuk semua 200 baris board.
   - Morpho Blue: sebelum $1.123.482.091 vs board $786.494.320 → sesudah
     $786.437.464 (selisih −$56.856, 0,0072%) → "matches the board".
2. `renderModel()` memeriksa `MODEL.base_multiple` yang tidak ada di
   `DATA.model` radar-3, sehingga rumus tetap teks generik. Perbaikan:
   pakai `MODEL.base_default` (0,1) untuk rumus dan `m-base`, dengan
   `base_multiples` per kategori dicantumkan. Rumus kini:
   `implied = round( tvl_usd × 0.1 × size discount (0.7 over $1B, 0.85
   $500M–$1B, 1 below) × (1 + clamp(change_7d, -30, 30) / 100 × 0.25) ×
   (0.9 + min(age_days, 1095) / 1095 × 0.2) ) — base by category: Lending
   0.1, Onchain Capital Allocator 0.15, RWA 0.12, Risk Curators 0.15, Yield
   0.12; other categories use the default 0.1.`
   (`m-base` kini 0,1, bukan lagi base baris rank 1.)

Screenshot:
- `screenshots/2-detail.png` di-render ulang (Playwright + Chrome stabil,
  1440×900, hash `#/protocol/steakhouse-financial`): 192.452 byte (188 KiB),
  dicek visual — modal "RANK 5 OF 200" dengan Model Breakdown lengkap
  (termasuk baris size discount × 0.7) dan "matches the board".
- `1-board.png` (186.135 byte) dan `3-filtered.png` (187.117 byte) TIDAK
  di-render ulang; sha256 keduanya tidak berubah.

Run (snapshot kit, setelah perbaikan; `out/` lama dihapus dulu):
- Run 1 ke `out/`: exit 0. Run 2 ke `/tmp/radar-fix-b`: exit 0.
- sha256 identik antar-run: board.json `ac67a87d…`, data.js `a726eee4…`,
  dossier.json `e1efd2787f0d036ed3688430d0b991990d61ab83ed3a53278f8f02e0a4be15e5`
  (dossier berubah dari run final karena 2-detail.png baru — wajar).
- `out/` di-render ulang sekali lagi setelah screenshot baru agar dossier
  di dalamnya dibangun dari screenshot yang sama.

Verifikasi semua gate — SEMUA LOLOS:
- board 200 baris, rank 1..200, implied menurun, implied ≤ TVL dan > 0.
- coverage 40/40 watchlist; farm_steps 0 baris buruk (6 langkah/baris).
- recompute model penuh (Python, dari input mentah) cocok untuk semua 200
  baris board.
- screenshots: 3 gambar PNG 1440×900, 182–188 KiB (≤512 KiB).
- dossier.json 795.864 byte (≤1,5 MiB); dossier_matches: hitung ulang
  buildDossier atas out/ byte-identik (`cmp` lolos).
- dashboard tanpa http:// atau https://; total sumber dashboard 39.757 byte
  (<64 KB).

## Masalah yang belum selesai

- Catatan desain lama (live-token raksasa menduduki rank 1, 2, 4) sudah
  terselesaikan oleh revisi radar-3 di atas: board kini 200 pre-token saja
  dan live-token dipisah ke array `live`.
- (Tidak ada lagi: kedua bug tampilan di atas sudah diperbaiki dan
  terverifikasi pada run ini.)

## Revisi radar-4 (2026-11-24, malam) — kalibrasi ulang, seleksi early by implied, farm plan per kategori/chain, filter dashboard

Perubahan di `lib/model.ts` (`MODEL_VERSION = radar-4`):
- Kalibrasi base dari rasio mcap/TVL 144 live-token (winsorize 0,005–2,0;
  median per kategori n>=5, shrink ke median global 0,169 bobot n/(n+5),
  clamp 0,05–0,40; default 0,169): Basis Trading 0,362, Canonical Bridge
  0,400 (kena cap), Dexs 0,288, RWA 0,237, Lending 0,142, Yield 0,134,
  Bridge 0,119, Yield Aggregator 0,110 (median mentah 0,050; shrink
  menariknya ke atas), CEX 0,095, Liquid Staking 0,076. Kategori n<5
  tetap default. Median kategori + n disimpan di `live_category_medians`
  untuk benchmark dashboard.
- Diskon ukuran bertingkat baru (tier pertama yang cocok menang): 1,00 di
  bawah $100 jt; 0,80 $100–500 jt; 0,65 $500 jt–$1 M; 0,50 $1–5 M; 0,35 di
  atas $5 M. Dari median rasio per bucket TVL (<$50 jt 0,307; $50–100 jt
  0,149; $100–500 jt 0,082; $500 jt–$1 M 0,034; $1–5 M 0,030; >$5 M 0,044),
  dibuat lebih dangkal dari rasio mentah karena base kategori sudah menyerap
  sebagian efek ukuran; tier lebih curam (0,70/0,55/0,40/0,30) justru
  menurunkan hit 0,5–2x dari 40 ke 38, jadi tier konservatif dipakai.
- Growth 0,25→0,5, clip -30/+30→-60/+60; maturity 0,9+0,2→0,7+0,5.
  Didokumentasikan di model.ts + dashboard sebagai prior kriteria, bukan
  klaim prediktif: korelasi log(mcap/TVL) vs change_7d = 0,004 dan vs umur =
  0,063 pada 128 live-token bermcap > $0.
- Seleksi early by implied: semua kandidat early yang eligible dinilai
  dulu, 160 teratas by implied (seri slug menaik). Dari 6 protokol yang
  bocor di radar-3 (seleksi by TVL), hanya Neutral Trade yang masuk di
  radar-4 (early rank 159, board rank 199); Gain (171), UltraYield Vaults
  (202), Agua (205), NEMO Trading (210), Perena Vaults (212) jatuh di bawah
  cut 160 — bukan kebocoran lagi, melainkan cut yang bekerja di bawah model
  baru (dasar board naik karena default 0,10→0,169; bottom board $2,07 jt→
  $3,58 jt).
- Farm plan: cabang actionFor baru untuk Basis Trading (delta-neutral +
  hedge, sebut stablecoin), Anchor BTC/Restaked BTC/Decentralized BTC,
  Chain, Payments/Card, Options, Liquidity Manager, CeDeFi, plus
  Stablecoin Issuer/Wrapper, Dual-Token, Algo-Stables, CDP Manager,
  Indexes, Governance, OTC, Collateral Markets, Farm — langkah 2 generik
  "Deposit $X of USDC into ..." turun dari 34/200 menjadi 0/200 (2 yang
  tersisa dihitung detektor lama ternyata cabang CeDeFi yang spesifik).
  Gas per chain pertama (Ethereum $5–$15, Bitcoin $1–$5, Solana
  $0,01–$0,10, lainnya $0,10–$1); langkah 3 (mingguan) dan 5 (klaim)
  dibedakan per kategori (weeklyFor/claimFor); chain kedua disebut di
  langkah 4 (97/97 baris multi-chain); tier modal tambah $75 (TVL
  $25–100 jt). Langkah 141–340 karakter.
- `RadarData` tambah `watchlist: string[]` (40 slug) untuk toggle dashboard.

Validasi live-token (dihitung dari implementasi TS `impliedValue`, n=128
live bermcap > $0; 15 bermcap 0 + 1 bermcap -1 dikeluarkan karena rasio
terhadap mcap<=0 tidak bermakna):
- radar-3: median implied/mcap 0,453; 29/128 dalam 0,5–2x; 64/128 dalam 0,25–4x
- radar-4: median implied/mcap 0,804; 40/128 dalam 0,5–2x; 66/128 dalam 0,25–4x
- Replikasi Python independen cocok persis; hitung ulang model Python atas
  board cocok 200/200 baris.

Perubahan dashboard (`index.html`, `app.js`, `app.css`; total 46.689 byte,
sisa 18.847 byte ke cap teks dossier 65.536):
- Filter `<select>` chain + toggle "Watchlist only" (dari `watchlist` di
  data.js; terverifikasi: 40 of 200 shown).
- Bug stat-watch diperbaiki: dihitung dari slug board yang ada di watchlist
  ("40 / 40", bukan tautologi); meta "Rows" kini 200 (PRE.length), bukan 224.
- Tab All: kolom value berlabel "Implied / mcap" dan tombol sort-nya
  dinonaktifkan (implied vs market cap tidak sebanding; sort value dialihkan
  ke TVL saat pindah ke tab All); rank live tampil "L1"–"L24", bukan "—".
- Modal detail: rasio implied/TVL (pre) atau mcap/TVL (live) baris ini vs
  median mcap/TVL live kategori yang sama (`live_category_medians`, fallback
  median global 0,169, n=144) — terverifikasi di modal Ethena (0,21x vs
  median Basis Trading 0,48x, n=8) dan di satu baris live.
- `renderModel()` memakai `size_tiers` (fallback ke field radar-3 untuk
  data.js lama); paragraf kalibrasi baru menjelaskan metode + validasi +
  korelasi ~nol growth/maturity. Rumus kini:
  `implied = round( tvl_usd × 0.169 × size discount (1 below $100M, 0.35
  over $5B, 0.5 over $1B, 0.65 over $500M, 0.8 over $100M) × (1 +
  clamp(change_7d, -60, +60) / 100 × 0.5) × (0.7 + min(age_days, 1095) /
  1095 × 0.5) ) — base by category: ...`.

Screenshot (Chrome 158 diinstal ulang via .deb dl.google.com — VM baru
tanpa browser; Playwright via playwright-core + executablePath
/usr/bin/google-chrome-stable, viewport 1440x900, dari file://…/out/):
- `screenshots/1-board.png`: 1440x900, 204.300 byte (199 KiB) — board
  Pre-token, "200 of 200 shown", rank 1 Ethena USDe $1,03B, stat 40/40,
  Rows 200, filter Chain + Watchlist only terlihat.
- `screenshots/2-detail.png`: 1440x900, 257.666 byte (251 KiB) — modal
  `#/protocol/ethena-usde`, di-scroll ke farm plan: benchmark kategori
  (0,21x vs 0,48x), "Recomputed $1.03B — matches the board", farm plan
  delta-neutral + gas Ethereum $5–$15.
- `screenshots/3-filtered.png`: 1440x900, 195.973 byte (191 KiB) — filter
  Chain "Solana", "35 of 200 shown".
- Mobile dicek di viewport 390x844 (tidak dikirim): tanpa overflow
  horizontal (0 px), statistik 2 kolom, model steps menumpuk rapi.

Run final (snapshot kit, `out/` dihapus dulu, 2 run):
- Run 1 ke `out/`, run 2 ke `/tmp/radar4-final-b`: keduanya exit 0.
- sha256 identik antar-run: board.json
  `3995eca548c0cae21078180736aa8e87787cd8a3190d645323458d9d7bf07c0e`,
  data.js `0ab78d1d65a30f62e213a7e8dd430f9f9cac65c07ef9be7221e473c4f43b79a0`,
  dossier.json `cca9daa5f21678baf426bd9747c6a3f8e7492b33974bd45a664f2dd94c5ff3b1`.
- 5 teratas baru: 1 Ethena USDe $1.025.501.900 (Basis Trading) · 2 Morpho
  Blue $595.879.313 (Lending) · 3 SparkLend $351.008.238 · 4 Sky Lending
  $301.483.393 · 5 Spark Liquidity Layer $234.985.986. 5 terbawah: 196–200
  di $3,58–3,60 jt (BounceBit Prime, Neutral Trade, Y10K Capital).

Verifikasi semua gate — SEMUA LOLOS:
- dashboard_files: 3 file, 46.689 byte (<=4 MiB), tanpa http:// atau https://.
- board_file: 200 baris, 0 slug tak dikenal, 0 nama kosong, implied bulat positif.
- sorted_by_value: rank 1..200, implied menurun, 200 nilai unik, top $1.025.501.900, bottom $3.575.712.
- coverage: 40/40 watchlist.
- farm_steps: 0 baris buruk, 6 langkah/baris, panjang 141–340 karakter.
- screenshots: 3 gambar PNG 1440x900, 191–251 KiB (<=512 KiB).
- dossier_matches: hitung ulang buildDossier atas out/ byte-identik (`cmp` lolos).
- dossier.json 925.930 byte (<=1,5 MiB); dashboard <64 KB (46.689 byte).
- Perilaku dashboard diuji via Playwright (tanpa error halaman): sort value
  nonaktif di tab All, rank live L-prefix, watchlist-only 40/200, benchmark
  di modal live, search, clear-filters mereset chain + watchlist-only.
