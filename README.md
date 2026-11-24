# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/bagusmuse2-rgb/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/bagusmuse2-rgb/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Radar token-launch: membaca snapshot protokol DeFiLlama, menilai protokol yang
belum mencatat token dengan implied value dari angka snapshot itu sendiri, lalu
menulis board berperingkat beserta rencana farm tiap protokol. Entri untuk
[bounty "Build the best token launch radar" di make.fun](https://make.fun/bounty/token-radar-01).

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-kit>/input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

---

Node 22, standard library saja (tidak ada dependensi). Keluaran di `out/`:

- `board.json` — `{"rows": [...]}`: 200 baris pre-token berperingkat
- `data.js` — `window.RADAR=...` untuk dashboard: `{board: {rows: [...]},
  live: [...], asOf, floorUsd, watchlistCount, watchlist: [...], ...}` —
  `live` berisi 24 live-token teratas menurut market cap, bentuk baris sama
  seperti board, untuk tab Live token di dashboard; `watchlist` berisi 40
  slug watchlist untuk toggle "Watchlist only"
- `dashboard/` — salinan dashboard statis (tanpa network)
- `screenshots/` — 3 tangkapan layar dashboard
- `dossier.json` — dossier yang dibaca juri, via `vendor/makefun-board.ts`

Program keluar dengan kode 1 bila board tidak lolos validasi internal atau
screenshot kurang dari 3. Semua run deterministik: tanpa `Date.now()` /
`Math.random()`, setiap sort punya tie-break slug menaik.

## Model (`lib/model.ts`, `MODEL_VERSION = radar-4`)

Pre-token ketat: `gecko_id` null **dan** `mcap_usd` null. Live-token:
`gecko_id` non-null (token sudah diperdagangkan; market cap-nya ditampilkan
apa adanya, terpisah dari implied value model).

Board 200 baris pre-token saja: 40 watchlist + 160 pre-token di luar
watchlist dengan **implied value tertinggi** (dinilai dulu semuanya, lalu
diambil 160 teratas; seri diputus slug menaik) — bukan lagi TVL tertinggi
(kecuali kategori CEX / Bridge / Canonical Bridge / Liquid Staking / Liquid
Restaking dan nama berakhiran penanda versi). Live-token tidak masuk board:
24 live-token dengan market cap terbesar dibawa terpisah di array `live` pada
`data.js` (bentuk baris sama seperti baris board — `token_status:
'live-token'`, `farm_steps`, objek `model`, dan implied yang dihitung dengan
rumus yang sama), diperingkat 1..24 menurut market cap untuk tab Live token
di dashboard.

Implied value per baris — base dikalibrasi dari rasio mcap/TVL live-token
snapshot ini (144 live-token, rasio di-winsorize ke 0,005–2,0; median per
kategori hanya untuk n>=5, di-shrink ke median global 0,169 dengan bobot
n/(n+5), lalu dibatasi 0,05–0,40; kategori n<5 memakai default 0,169):

```
base      = TVL x BASE_MULTIPLE[kategori]
  Basis Trading 0.362, Canonical Bridge 0.400, Dexs 0.288, RWA 0.237,
  Lending 0.142, Yield 0.134, Bridge 0.119, Yield Aggregator 0.110,
  CEX 0.095, Liquid Staking 0.076, lainnya 0.169
sizeDisc  = 1.00 di bawah $100 jt; 0.80 $100–500 jt; 0.65 $500 jt–$1 M;
            0.50 $1–5 M; 0.35 di atas $5 M
growth    = 1 + clip(change_7d, -60, +60)/100 x 0.5   (null -> 0)
maturity  = 0.7 + min(umur_hari, 1095)/1095 x 0.5
            (listed_at null atau 2025-05-20, tanggal default yang meragukan -> 1.0 netral;
             umur dihitung dari listed_at ke as_of 2026-11-14)
implied   = max(1, round(TVL x base x sizeDisc x growth x maturity)), dibatasi 1.0 x TVL
```

Growth dan maturity adalah prior penilaian yang diminta kriteria, bukan
klaim prediktif: pada 128 live-token bermcap > $0, korelasi log(mcap/TVL)
dengan change_7d adalah 0,004 dan dengan umur 0,063 — praktis nol.

Validasi pada 128 live-token bermcap > $0 (implied rumus yang sama vs mcap
sebenarnya): radar-4 median implied/mcap 0,804, 40/128 dalam 0,5–2x,
66/128 dalam 0,25–4x (radar-3: median 0,453, 29/128, 64/128).

Sort: implied menurun, seri diputus slug menaik. Rank 1..N.

Farm plan: 6 langkah per baris, tiap langkah menyebut nama/chain/kategori
protokol dan membawa biaya + waktu (`... Cost: <biaya>. Time: <waktu>.`).
Aksi utama, langkah mingguan, dan langkah klaim dibedakan per kategori
(mis. Basis Trading: posisi delta-neutral + lindung nilai, cek funding rate
mingguan; Anchor BTC: setor BTC; Chain: bridge ke chain itu; Payments:
bayar lewat protokol). Gas mengikuti chain pertama (Ethereum $5–$15,
Bitcoin $1–$5, Solana $0,01–$0,10, L2/BNB dan lainnya $0,10–$1).
Tier modal dari TVL ($50 / $75 / $100 / $150 / $250), lama hold dari umur
(30 / 45 / 60 hari: protokol muda diberi jendela lebih panjang). Bila
multi-chain, chain kedua disebut di langkah tahan.

Dashboard: filter chain + toggle "Watchlist only", tab All menonaktifkan
sort value (implied pre-token dan market cap live tidak sebanding) dan rank
live tampil sebagai L1–L24; modal detail menampilkan rasio implied/TVL
baris ini vs median mcap/TVL live kategori yang sama.

## Validasi internal (`boardIssue` di `lib/model.ts`)

Cakupan 40 watchlist, board hanya berisi pre-token, rank 1..N, implied
tidak naik seiring rank, tidak semua implied sama, implied positif dan tidak
melebihi TVL, farm steps 3–12 dengan tiap langkah 20–600 karakter.

## Struktur

```
main.ts                  entrypoint (baca snapshot -> tulis /output)
lib/model.ts             model implied value, seleksi board, farm steps, validasi
vendor/makefun-board.ts  library dossier make.fun (disalin apa adanya dari kit)
dashboard/               halaman statis: index.html + app.css + app.js
screenshots/             1-board.png, 2-detail.png, 3-filtered.png
```

## Status

- `main.ts` + `lib/model.ts`: selesai, tervalidasi lokal dengan snapshot kit
  (revisi radar-4: base terkalibrasi live-token, diskon ukuran bertingkat,
  seleksi early by implied, farm plan per kategori/chain; validasi live-token
  median implied/mcap 0,804, 40/128 dalam 0,5–2x).
- `dashboard/`: `index.html` + `app.css` + `app.js` sudah ada; `app.js`
  membaca `window.RADAR.board.rows` dan `window.RADAR.live` (dengan fallback
  ke bentuk lama), serta memakai tab Live token dari array `live`; filter
  chain + toggle "Watchlist only", benchmark kategori di modal detail.
- `screenshots/`: 1-board.png, 2-detail.png (Ethena USDe, rank 1),
  3-filtered.png (filter chain Solana, 35 of 200) sudah ada, di-render ulang
  untuk radar-4.
