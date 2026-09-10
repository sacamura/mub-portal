/* Máriás Portál – helyi fejlesztői webszerver (csak teszteléshez, nem kell feltölteni)
   Indítás:  node _szerver.mjs        (alapértelmezett port: 5500)
             node _szerver.mjs 8080   (más port)
   Leállítás: Ctrl+C
   Miért kell: a Firebase Authentication csak engedélyezett webcímről enged bejelentkezést,
   a file:// nem az. A localhost viszont alapból engedélyezett. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.argv[2] || 5500);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(String(req.url || '/').split('?')[0].split('#')[0]); }
  catch { p = '/'; }
  if (p === '/' || p === '') p = '/index.html';

  const full = path.resolve(ROOT, '.' + path.posix.normalize(p));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Tiltott útvonal');
  }

  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Nincs ilyen fájl: ' + p);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate'
    });
    res.end(data);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('A ' + PORT + ' port már foglalt. Indítsd másképp:  node _szerver.mjs 5501');
  } else {
    console.error('Szerverhiba: ' + e.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('Máriás Portál – helyi szerver fut, mappa: ' + ROOT);
  console.log('  http://localhost:' + PORT);
  console.log('  http://127.0.0.1:' + PORT);
  console.log('Admin bejelentkezés: http://localhost:' + PORT + '/#admin');
  console.log('Leállítás: Ctrl+C');
});
