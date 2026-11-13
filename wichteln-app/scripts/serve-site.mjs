#!/usr/bin/env node
/**
 * Kleiner statischer Server für die ganze Website (Platzhalterseite + /wichteln/).
 * Nur zum lokalen Ausprobieren und für die Playwright-Tests, nicht für den Betrieb.
 *
 *   node scripts/serve-site.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.argv[2] ?? 4320);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path.endsWith('/')) path += 'index.html';
  if (path.includes('..')) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(join(root, path));
    const gzip = /gzip/.test(req.headers['accept-encoding'] ?? '');
    res.writeHead(200, {
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      ...(gzip ? { 'content-encoding': 'gzip' } : {}),
      'cache-control': 'no-cache',
    });
    res.end(gzip ? gzipSync(body) : body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404');
  }
}).listen(port, () => console.log(`Website auf http://localhost:${port}/ (Wurzel: ${root})`));
