// Token radar: baca snapshot, nilai 200 protokol pre-token, tulis board + dashboard.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input /tmp/.../input/snapshot.json
//
// Masukan: snapshot.json (atau direktori yang memuatnya; default /input).
// Keluaran (default /output, atau --output / $MAKEFUN_OUTPUT_DIR):
//   board.json     {"rows": [...]} + newline
//   data.js        window.RADAR=<dataset dashboard>
//   dashboard/     salinan dashboard/ repo ini
//   screenshots/   salinan screenshots/ repo ini (wajib >= 3)
//   dossier.json   buildDossier dari vendor/makefun-board.ts
//
// Node 22, standard library saja. Deterministik penuh: tidak ada Date.now(),
// tidak ada Math.random(), dan setiap sort punya tie-break slug menaik.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** Cap gate yang membentuk dossier: cap teks membentuk byte, sisanya menolak. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const MIN_SCREENSHOTS = 3;

/** Nilai --name <value> / --name=<value>, atau fallback. */
function flag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === `--${name}` && i + 1 < argv.length) return argv[i + 1]!;
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return fallback;
}

/** Gagal dengan pesan ke stderr dan exit code yang diminta. */
function fail(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

const inputArg = flag('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
}
const outDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

let snapshot;
try {
  snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
} catch (err) {
  fail(`cannot read snapshot: ${err instanceof Error ? err.message : String(err)}`, 2);
}

const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`, 1);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

/**
 * Salin satu pohon direktori (file reguler saja) ke `to`, melewati nama yang
 * diawali titik dan mengikuti urutan nama yang terurut agar hasilnya deterministik.
 * Mengembalikan nama file yang disalin, relatif terhadap akar sumber.
 */
function copyTree(from: string, to: string, rel = ''): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    const dst = join(to, name);
    const st = statSync(src);
    if (st.isDirectory()) copied.push(...copyTree(src, dst, rel === '' ? name : `${rel}/${name}`));
    else if (st.isFile()) {
      copyFileSync(src, dst);
      copied.push(rel === '' ? name : `${rel}/${name}`);
    }
  }
  return copied;
}

const dashFiles = copyTree(join(here, 'dashboard'), join(outDir, 'dashboard'));
const shots = copyTree(join(here, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < MIN_SCREENSHOTS) {
  fail(
    `screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in ${MIN_SCREENSHOTS}, the board, a detail view and a filtered view`,
    1,
  );
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
  const bytes = statSync(join(outDir, 'screenshots', name)).size;
  if (bytes > SCREENSHOT_CAPS.max_bytes) fail(`screenshots/${name} is ${bytes} bytes, over the ${SCREENSHOT_CAPS.max_bytes} cap`, 1);
}

// Dossier ditulis terakhir: scorer membangun ulang dari /output dan membandingkan byte demi byte.
let dossier: Uint8Array;
try {
  dossier = buildDossier(outDir, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS });
} catch (err) {
  fail(`cannot build dossier: ${err instanceof Error ? err.message : String(err)}`, 1);
}
writeFileSync(join(outDir, 'dossier.json'), dossier);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (all pre-token) and ${radar.live.length} live-token rows in a separate array\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (${dashFiles.length} files), ${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
