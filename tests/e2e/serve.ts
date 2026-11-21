// Minimal static server for dist/, mounted at a sub-path: npx tsx tests/e2e/serve.ts <port> <subPath>
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const [port = '4318', subPath = '/'] = process.argv.slice(2);
const DIST = join(import.meta.dirname, '..', '..', 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
  if (!url.startsWith(subPath)) {
    res.writeHead(404).end();
    return;
  }
  const rel = normalize(url.slice(subPath.length) || 'index.html');
  readFile(join(DIST, rel.endsWith('/') || rel === '.' ? 'index.html' : rel)).then(
    (body) =>
      res
        .writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' })
        .end(body),
    () => res.writeHead(404).end(),
  );
}).listen(Number(port));
