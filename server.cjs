const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4174);
http.createServer((req, res) => {
  let filename;
  try { const url = new URL(req.url, 'http://localhost'); filename = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); }
  catch { res.writeHead(400); return res.end('Bad request'); }
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filename, (error, body) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    res.setHeader('Content-Type', filename.endsWith('.png') ? 'image/png' : filename.endsWith('.webmanifest') ? 'application/manifest+json' : filename.endsWith('.css') ? 'text/css; charset=utf-8' : filename.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.end(body);
  });
}).listen(port, '127.0.0.1', () => console.log(`Sheetwise: http://127.0.0.1:${port}/`));
