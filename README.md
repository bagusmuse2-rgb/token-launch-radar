# Token Launch Radar

Radar token-launch: membaca snapshot protokol DeFiLlama, menilai protokol yang
belum mencatat token dengan implied value dari angka snapshot itu sendiri, lalu
menulis board berperingkat beserta rencana farm tiap protokol.

## Menjalankan

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /tmp/radar-kit/token-radar-01-kit/input/snapshot.json
```

Node 22, standard library saja (tidak ada dependensi). Keluaran di `out/`:

- `board.json` — `{"rows": [...]}`: 200 baris pre-token berperingkat
- `data.js` — `window.RADAR=...` untuk dashboard: `{board: {rows: [...]},
  live: [...], asOf, floorUsd, watchlistCount, ...}` — `live` berisi 24
  live-token teratas menurut market cap, bentuk baris sama seperti board,
  untuk tab Live token di dashboard
- `dashboard/` — salinan dashboard statis (tanpa network)
- `screenshots/` — 3 tangkapan layar dashboard
- `dossier.json` — dossier yang dibaca juri, via `vendor/makefun-board.ts`

Program keluar dengan kode 1 bila board tidak lolos validasi internal atau
screenshot kurang dari 3. Semua run deterministik: tanpa `Date.now()` /
`Math.random()`, setiap sort punya tie-break slug menaik.

## Model (`lib/model.ts`, `MODEL_VERSION = radar-3`)

Pre-token ketat: `gecko_id` null **dan** `mcap_usd` null. Live-token:
`gecko_id` non-null (token sudah diperdagangkan; market cap-nya ditampilkan
apa adanya, terpisah dari implied value model).

Board 200 baris pre-token saja: 40 watchlist + 160 pre-token di luar
watchlist dengan TVL tertinggi (kecuali kategori CEX / Bridge / Canonical
Bridge / Liquid Staking / Liquid Restaking dan nama berakhiran penanda
versi). Live-token tidak masuk board: 24 live-token dengan market cap
terbesar dibawa terpisah di array `live` pada `data.js` (bentuk baris sama
seperti baris board — `token_status: 'live-token'`, `farm_steps`, objek
`model`, dan implied yang dihitung dengan rumus yang sama), diperingkat
1..24 menurut market cap untuk tab Live token di dashboard.

Implied value per baris:

```
base      = TVL x BASE_MULTIPLE[kategori]
  Risk Curators 0.15, Onchain Capital Allocator 0.15,
  RWA 0.12, Yield 0.12, Lending 0.10, lainnya 0.10
sizeDisc  = 0.70 bila TVL > $1 miliar; 0.85 bila $500 jt–$1 miliar; 1.00 bila di bawahnya
growth    = 1 + clip(change_7d, -30, +30)/100 x 0.25   (null -> 0)
maturity  = 0.9 + min(umur_hari, 1095)/1095 x 0.2
            (listed_at null atau 2025-05-20, tanggal default yang meragukan -> 1.0 netral;
             umur dihitung dari listed_at ke as_of 2026-11-14)
implied   = max(1, round(TVL x base x sizeDisc x growth x maturity)), dibatasi 1.0 x TVL
```

Sort: implied menurun, seri diputus slug menaik. Rank 1..N.

Farm plan: 6 langkah per baris, tiap langkah menyebut nama/chain/kategori
protokol dan membawa biaya + waktu (`... Cost: <biaya>. Time: <waktu>.`).
Tier modal dari TVL ($50 / $100 / $150 / $250), lama hold dari umur
(30 / 45 / 60 hari: protokol muda diberi jendela lebih panjang).

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
  (revisi radar-3: board 200 pre-token, array `live` 24 terpisah).
- `dashboard/`: `index.html` + `app.css` + `app.js` sudah ada; `app.js`
  membaca `window.RADAR.board.rows` dan `window.RADAR.live` (dengan fallback
  ke bentuk lama), serta memakai tab Live token dari array `live`.
- `screenshots/`: masih kosong saat ini; run final dilakukan setelah
  screenshot asli selesai.
