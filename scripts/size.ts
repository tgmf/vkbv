// Prints the gzipped size of the built JavaScript and fails above the graybox budget (spec 07 §4), and
// the size of `dist/` as a zip (the itch.io upload, M8: under 5 MB). The zip size is computed as a zip
// file would store it: each file deflated, plus its local and central headers and the end record.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deflateRawSync, gzipSync } from 'node:zlib';

const BUDGET_KB = 400;
const ZIP_BUDGET_MB = 5;
const dist = join(import.meta.dirname, '..', 'dist');
const dir = join(dist, 'assets');

let total = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const kb = gzipSync(readFileSync(join(dir, file))).length / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(8)} kB  ${file}`);
}
console.log(`${total.toFixed(1).padStart(8)} kB  total gzipped JS (budget ${BUDGET_KB} kB)`);

const files = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
let zip = 22; // end of central directory
for (const p of files(dist)) {
  const name = Buffer.byteLength(relative(dist, p).replaceAll('\\', '/'));
  const data = readFileSync(p);
  zip += 30 + name + Math.min(data.length, deflateRawSync(data, { level: 9 }).length) + 46 + name;
}
const mb = zip / 1024 / 1024;
console.log(`${mb.toFixed(2).padStart(8)} MB  dist/ as a zip (budget ${ZIP_BUDGET_MB} MB)`);

if (total > BUDGET_KB) {
  console.error('Over the JavaScript size budget.');
  process.exit(1);
}
if (mb > ZIP_BUDGET_MB) {
  console.error('dist/ zipped is over its budget.');
  process.exit(1);
}
