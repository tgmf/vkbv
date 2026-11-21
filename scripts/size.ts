// Prints the gzipped size of the built JavaScript and fails above the graybox budget (spec 07 §4).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 400;
const dir = join(import.meta.dirname, '..', 'dist', 'assets');

let total = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const kb = gzipSync(readFileSync(join(dir, file))).length / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(8)} kB  ${file}`);
}
console.log(`${total.toFixed(1).padStart(8)} kB  total gzipped JS (budget ${BUDGET_KB} kB)`);
if (total > BUDGET_KB) {
  console.error('Over the JavaScript size budget.');
  process.exit(1);
}
