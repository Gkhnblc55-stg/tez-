// Nöbetçi için bağımlılıksız yerel sunucu: yalnızca uygulama/ klasörünü, yalnızca bu bilgisayara (127.0.0.1) sunar.
// Çalıştırma: npm start  (veya: node sunucu.js)   Bağlantı noktası: PORT ortam değişkeni, varsayılan 8080.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, 'uygulama');
const HOST = '127.0.0.1';
const START_PORT = Number(process.env.PORT) || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store',
};

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD', ...HEADERS }); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400, HEADERS); return res.end(); }
  if (rel.includes('\0')) { res.writeHead(400, HEADERS); return res.end(); }
  const file = path.resolve(ROOT, '.' + (rel === '/' ? '/index.html' : rel));
  // Yol geçişi (../) ile uygulama klasörünün dışına çıkılamaz
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403, HEADERS); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...HEADERS }); return res.end('Bulunamadı'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, ...HEADERS });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function listen(port, triesLeft) {
  const server = http.createServer(handler);
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && triesLeft > 0) return listen(port + 1, triesLeft - 1);
    console.error('Sunucu başlatılamadı: ' + e.message);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    const url = `http://${HOST}:${port}/`;
    console.log(`Nöbetçi çalışıyor: ${url}  (durdurmak için Ctrl+C)`);
    if (process.argv.includes('--ac')) {
      // Varsayılan tarayıcıda aç (yalnızca Windows, macOS, Linux standart komutları)
      const { spawn } = require('child_process');
      const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
      spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref();
    }
  });
}
listen(START_PORT, 10);
