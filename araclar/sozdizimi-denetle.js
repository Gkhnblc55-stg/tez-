// index.html içindeki satır içi betiklerin sözdizimini denetler.
// Çalıştırma: npm run denetle  (veya: node araclar/sozdizimi-denetle.js)
'use strict';
const fs = require('fs');
const path = require('path');

const h = fs.readFileSync(path.join(__dirname, '..', 'uygulama', 'index.html'), 'utf8');
for (const id of ['motor', 'arayuz']) {
  const m = h.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'));
  if (!m) { console.log(id, 'BULUNAMADI'); process.exitCode = 1; continue; }
  try { new Function(m[1]); console.log(id, 'sözdizimi ok'); } catch (e) { console.log(id, 'HATA', e.message); process.exitCode = 1; }
}
