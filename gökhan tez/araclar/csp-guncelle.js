// index.html içindeki satır içi betiklerin SHA-256 özetlerini Content-Security-Policy'ye yazar.
// index.html'deki betiklerden biri değişince yeniden çalıştırın: npm run csp  (veya: node araclar/csp-guncelle.js)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const file = path.join(__dirname, '..', 'uygulama', 'index.html');
let html = fs.readFileSync(file, 'utf8');
const hashes = [...html.matchAll(/<script id="[^"]+">([\s\S]*?)<\/script>/g)]
  .map((m) => `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
if (!hashes.length) throw new Error('Satır içi betik bulunamadı');
html = html.replace(/script-src https:\/\/unpkg\.com[^;]*;/, `script-src https://unpkg.com ${hashes.join(' ')};`);
fs.writeFileSync(file, html);
console.log(`CSP güncellendi: ${hashes.length} betik özeti`);
