// Minimal static file server used to preview a build exactly as a dumb host
// (Live Server, GitHub Pages, S3) would serve it.
//
//   node .tools/serve-out.mjs [port] [root]
//
//   port  default 3200
//   root  default <cwd>/out
//
// Two behaviours matter for this project:
//   1. extensionless URLs fall back to `<path>.html`, which is what the
//      `build:preview` flat export needs for cross-page navigation;
//   2. a directory request serves its index.html.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const PORT = Number(process.argv[2] ?? 3200);
const ROOT = resolve(process.argv[3] ?? join(process.cwd(), 'out'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

/** Keeps every request inside ROOT, even with `..` in the URL. */
function resolveSafe(pathname) {
  const candidate = resolve(join(ROOT, normalize(decodeURIComponent(pathname))));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null;
  return candidate;
}

async function pickFile(pathname) {
  const base = resolveSafe(pathname);
  if (!base) return null;

  try {
    const info = await stat(base);
    if (info.isDirectory()) return join(base, 'index.html');
    return base;
  } catch {
    // Extensionless URL -> try `<path>.html`.
    return `${base}.html`;
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const file = await pickFile(url.pathname);

  if (!file) {
    response.writeHead(403, { 'content-type': 'text/plain' });
    response.end('forbidden');
    return;
  }

  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`serving ${ROOT}`);
  console.log(`  -> http://127.0.0.1:${PORT}/`);
});
