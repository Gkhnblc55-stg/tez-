// Planlayıcının hesap motorunu (index.html içindeki <script id="motor">) node ile test eder.
// Çalıştırma: npm test  (veya: node testler/motor.test.js)
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'uygulama', 'index.html'), 'utf8');
const m = html.match(/<script id="motor">([\s\S]*?)<\/script>/);
assert.ok(m, 'motor betiği bulunamadı');
const Engine = new Function(m[1] + '\nreturn Engine;')();

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  HATA ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} beklenen ${b} ± ${tol}, gelen ${a}`);

const quad = Engine.PRESETS[0].spec;
const fixed = Engine.PRESETS.find(p => p.spec.type === 'fixed').spec;

test('ISA hava yoğunluğu deniz seviyesinde 1.225', () => near(Engine.airDensity(0, 15), 1.225, 0.005));
test('Yoğunluk irtifa ile azalır', () => assert.ok(Engine.airDensity(1500, 15) < Engine.airDensity(0, 15)));

test('GSD hedefinden irtifa: 84° FOV, 5280 px, 2 cm/px ≈ 94 m', () => {
  near(Engine.altitudeForGsd(2, 84, 5280), 0.02 * 5280 / (2 * Math.tan(42 * Math.PI / 180)), 0.01);
});

test('Kompakt quad askı gücü 70-130 W aralığında', () => {
  const p = Engine.power(quad, 0, 1.225);
  assert.ok(p > 70 && p < 130, 'P_hover=' + p);
});

test('Çok rotorlu güç eğrisi kova şeklinde: en düşük güç 0 ile vMax arasında', () => {
  const s = Engine.characteristicSpeeds(quad, 1.225);
  assert.ok(s.vEndurance > 2 && s.vEndurance < quad.vMax - 2, 'vEnd=' + s.vEndurance);
  assert.ok(s.vRange > s.vEndurance, 'menzil hızı dayanım hızından büyük olmalı');
  assert.ok(Engine.power(quad, s.vEndurance, 1.225) < Engine.power(quad, 0, 1.225));
});

test('Sabit kanat menzil hızı tutunma hızının üstünde', () => {
  const s = Engine.characteristicSpeeds(fixed, 1.225);
  assert.ok(s.vRange >= fixed.vStall * 1.1, 'vRange=' + s.vRange);
});

test('Kare alanı şerit taraması tüm alanı kapsar', () => {
  const sq = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const lanes = Engine.lanesInBand(sq, 0, 100, 20);
  assert.strictEqual(lanes.length, 5);
  lanes.forEach(l => near(Math.abs(l[1][0] - l[0][0]), 100, 0.01, 'şerit boyu'));
  // biçerdöver düzeni: yönler sırayla değişir
  assert.ok(Math.sign(lanes[0][1][0] - lanes[0][0][0]) !== Math.sign(lanes[1][1][0] - lanes[1][0][0]));
});

test('Alan bölme ağırlıklarla orantılı', () => {
  const sq = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const cuts = Engine.splitBands(sq, [1, 3]);
  near(cuts[1], 25, 0.5);
});

test('Rüzgârda yer hızı: karşı rüzgâr yavaşlatır, arka rüzgâr hızlandırır', () => {
  const head = Engine.groundSpeed([1, 0], [-5, 0], 10);
  const tail = Engine.groundSpeed([1, 0], [5, 0], 10);
  near(head, 5, 1e-6); near(tail, 15, 1e-6);
});

test('2-opt tur uzunluğunu kısaltır', () => {
  const pts = [[0, 0], [10, 10], [10, 0], [0, 10], [5, 12], [12, 5]];
  const order = Engine.tour([0, -5], pts);
  const len = o => { let s = 0, p = [0, -5]; o.forEach(i => { s += Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]); p = pts[i]; }); return s + Math.hypot(p[0], p[1] + 5); };
  assert.ok(len(order) <= len([0, 1, 2, 3, 4, 5]));
  assert.strictEqual(new Set(order).size, pts.length);
});

const parcel = [[41.1130, 28.1570], [41.1138, 28.1640], [41.1110, 28.1668], [41.1078, 28.1645], [41.1085, 28.1580]];
const baseInput = (over = {}) => Object.assign({
  parcel, home: [41.1082, 28.1600], pois: [], obstacles: [{ lat: 41.11, lon: 28.16, h: 20 }],
  drones: [Object.assign({ name: 'A' }, quad), Object.assign({ name: 'B' }, quad)],
  env: { windSpeed: 4, windFrom: 30, tempC: 18, elevMSL: 60, alpha: 0.14, terrainVar: 5 },
  mission: { mode: 'coverage', gsdCm: 2.5, frontOverlap: 75, sideOverlap: 65, angleMode: 'auto', angle: 0, weight: 30,
    layering: true, layerSep: 10, clearance: 15, maxAlt: 120, reservePct: 25, swapMin: 4, inspectSec: 10, opsHours: 12, repeatMin: 60 },
  costs: { elecPrice: 3.2, fuelPrice: 52, batteryPrice: 9000, batteryCycles: 300, chargerEff: 85 },
}, over);

test('Kapsama planı: her drone rota üretir, irtifalar katmanlı ve yasal sınırda', () => {
  const r = Engine.plan(baseInput());
  assert.strictEqual(r.drones.length, 2);
  const alts = r.drones.map(d => d.alt).sort((a, b) => a - b);
  assert.ok(alts[1] - alts[0] >= 10 - 1e-6, 'katman ayrımı ' + alts);
  alts.forEach(a => assert.ok(a <= 120 && a >= 40, 'irtifa ' + a));
  r.drones.forEach(d => { assert.ok(d.timeline.length > 4); assert.ok(d.energyWh > 0 && d.timeSec > 0); });
  assert.ok(r.totals.areaHa > 30 && r.totals.areaHa < 50, 'alan ' + r.totals.areaHa);
});

test('Optimize plan, saf plana göre enerji tasarrufu sağlar', () => {
  const r = Engine.plan(baseInput());
  assert.ok(r.baseline.energyWh > r.totals.energyWh, `opt ${r.totals.energyWh} saf ${r.baseline.energyWh}`);
});

test('Batarya yetmezse sorti bölünür ve eve dönüş eklenir', () => {
  const small = Object.assign({}, quad, { name: 'K', capacityWh: 20 });
  const r = Engine.plan(baseInput({ drones: [small] }));
  assert.ok(r.drones[0].sorties >= 2, 'sorti ' + r.drones[0].sorties);
  r.drones[0].timeline.forEach(s => assert.ok(s.bat >= 0, 'batarya negatif'));
});

test('Çevre devriyesi ve ilgi noktası modları çalışır', () => {
  const p = Engine.plan(baseInput({ mission: Object.assign(baseInput().mission, { mode: 'perimeter' }) }));
  assert.ok(p.totals.revisitSec > 0);
  const q = Engine.plan(baseInput({ pois: [[41.112, 28.16], [41.109, 28.165], [41.111, 28.158]],
    mission: Object.assign(baseInput().mission, { mode: 'poi' }) }));
  assert.ok(q.drones.some(d => d.timeline.length > 3));
});

test('Güçlü rüzgâr limit uyarısı üretir', () => {
  const r = Engine.plan(baseInput({ env: Object.assign(baseInput().env, { windSpeed: 16 }) }));
  assert.ok(r.warnings.some(w => w.level === 'crit'));
});

/* ---------- Büyük arsa ve uzak kalkış (donma hatası) ---------- */
const c0 = [41.1108, 28.1621];
const scaled = (s) => parcel.map(p => [c0[0] + (p[0] - c0[0]) * s, c0[1] + (p[1] - c0[1]) * s]);

test('Büyük arsa (yaklaşık 16.000 ha) planı 400 ms altında hesaplanır', () => {
  const t = Date.now();
  const r = Engine.plan(baseInput({ parcel: scaled(20) }));
  const ms = Date.now() - t;
  assert.ok(ms < 400, 'süre ' + ms + ' ms');
  assert.ok(r.totals.areaHa > 10000);
});

test('Kalkış noktası menzil dışındaysa sonsuz batarya değişimi yerine ulaşılamaz uyarısı verir', () => {
  const r = Engine.plan(baseInput({ home: [41.33, 28.45] }));
  r.drones.forEach(d => assert.ok(d.sorties <= 3, 'sorti ' + d.sorties));
  assert.ok(r.warnings.some(w => w.level === 'crit' && /menzil|ulaş/i.test(w.msg)), JSON.stringify(r.warnings));
});

/* ---------- Çoklu arsa, kalkış noktası ve otomatik seçim ---------- */
const parcelB = [[41.1200, 28.1880], [41.1206, 28.1925], [41.1180, 28.1930], [41.1176, 28.1886]];
const missionIn = (over = {}) => ({
  parcels: [{ name: 'Tarla', pts: parcel }, { name: 'Bahçe', pts: parcelB }],
  homes: [{ name: 'K1', ll: [41.1084, 28.1598] }, { name: 'K2', ll: [41.1190, 28.1905] }],
  pois: [], obstacles: [],
  drones: [Object.assign({ name: 'A' }, quad), Object.assign({ name: 'B' }, quad), Object.assign({ name: 'C' }, Engine.PRESETS[1].spec)],
  env: { windSpeed: 4, windFrom: 30, tempC: 18, elevMSL: 60, alpha: 0.14, terrainVar: 5 },
  mission: Object.assign(baseInput().mission, { selection: 'auto', continuous: false }, over.mission || {}),
  costs: baseInput().costs,
  ...(over.root || {}),
});

test('Otomatik seçim her arsaya en az bir drone atar ve kalkış noktası seçer', () => {
  const r = Engine.planMission(missionIn());
  assert.strictEqual(r.parcels.length, 2);
  r.parcels.forEach(p => assert.ok(p.drones.length >= 1, p.name + ' boş'));
  r.drones.filter(d => d.used).forEach(d => assert.ok(d.homeIdx >= 0 && d.parcelIdx.length >= 1));
  const servingB = r.drones.filter(d => d.used && d.parcelIdx.includes(1) && d.parcelIdx.length === 1);
  servingB.forEach(d => assert.strictEqual(d.homeIdx, 1, d.name + ' Bahçe için yakın kalkışı seçmeli'));
});

test('Rüzgâr sınırını aşan drone seçilmez ve nedeni yazılır', () => {
  const weak = Object.assign({ name: 'Zayıf' }, quad, { maxWind: 3 });
  const r = Engine.planMission(missionIn({ root: { drones: [weak, Object.assign({ name: 'A' }, quad), Object.assign({ name: 'B' }, quad)] } }));
  const z = r.drones.find(d => d.name === 'Zayıf');
  assert.strictEqual(z.used, false);
  assert.ok(/rüzgâr/i.test(z.reason), z.reason);
});

test('Enerji önceliği, süre önceliğinden fazla drone kullanmaz', () => {
  const e = Engine.planMission(missionIn({ mission: { weight: 0 } })).drones.filter(d => d.used).length;
  const t = Engine.planMission(missionIn({ mission: { weight: 100 } })).drones.filter(d => d.used).length;
  assert.ok(e <= t, `enerji ${e} süre ${t}`);
});

test('Elle seçimde kullanıcının arsa ve kalkış ataması korunur', () => {
  const ds = missionIn().drones.map((d, i) => Object.assign({}, d, { manualParcel: i === 2 ? -1 : i, manualHome: i }));
  ds[2].manualHome = 0;
  const r = Engine.planMission(missionIn({ mission: { selection: 'manual' }, root: { drones: ds } }));
  assert.deepStrictEqual(r.drones.map(d => d.used), [true, true, false]);
  assert.deepStrictEqual(r.drones[1].parcelIdx, [1]);
  assert.strictEqual(r.drones[1].homeIdx, 1);
});

test('Ayrı arsa ve ayrı kalkıştaki dronelar katman için birbirini yukarı itmez', () => {
  const ds = [Object.assign({ name: 'A' }, quad, { manualParcel: 0, manualHome: 0 }), Object.assign({ name: 'B' }, quad, { manualParcel: 1, manualHome: 1 })];
  const r = Engine.planMission(missionIn({ mission: { selection: 'manual' }, root: { drones: ds } }));
  assert.strictEqual(r.drones[0].alt, r.drones[1].alt);
  const same = ds.map(d => Object.assign({}, d, { manualParcel: 0, manualHome: 0 }));
  const r2 = Engine.planMission(missionIn({ mission: { selection: 'manual' }, root: { drones: same } }));
  assert.ok(Math.abs(r2.drones[0].alt - r2.drones[1].alt) >= 10);
});

/* ---------- Sürekli gözlem ---------- */
test('Sürekli gözlemde döngüler gözlem süresi boyunca tekrarlanır', () => {
  const r = Engine.planMission(missionIn({ mission: { continuous: true, opsHours: 3, repeatMin: 30 } }));
  const tl = r.drones.filter(d => d.used).map(d => d.timeline[d.timeline.length - 1].t);
  assert.ok(Math.max(...tl) >= 2.5 * 3600, 'son zaman ' + Math.max(...tl));
  r.parcels.forEach(p => {
    assert.ok(p.cycles >= 3, p.name + ' döngü ' + p.cycles);
    assert.ok(p.revisitAvgSec > 0 && p.revisitAvgSec < 45 * 60, p.name + ' tekrar ' + p.revisitAvgSec);
  });
});

test('Tek batarya ve uzun şarjda bekleme süresi hesaplanır', () => {
  const one = Object.assign({ name: 'Tek' }, quad, { capacityWh: 25, batteries: 1, chargeMin: 90 });
  const r = Engine.planMission(missionIn({ mission: { continuous: true, opsHours: 4, repeatMin: 0, selection: 'manual' },
    root: { drones: [Object.assign(one, { manualParcel: 0, manualHome: 0 })], parcels: [{ name: 'Tarla', pts: parcel }] } }));
  assert.ok(r.drones[0].waitSec > 0, 'bekleme ' + r.drones[0].waitSec);
});

test('Sürekli devriyede boşluk kalmaması için seçim ek drone kullanır', () => {
  const cont = Engine.planMission(missionIn({ mission: { mode: 'perimeter', continuous: true, opsHours: 4, weight: 30 } }));
  const once = Engine.planMission(missionIn({ mission: { mode: 'perimeter', continuous: false, opsHours: 4, weight: 30 } }));
  const n = (r) => r.drones.filter(d => d.used).length;
  assert.ok(n(cont) > n(once), `sürekli ${n(cont)} tek ${n(once)}`);
});

test('İki eş drone kademeli devriyede arsayı boş bırakmaz (köşe dönüşleri görev sayılır)', () => {
  const ds = [0, 1].map(i => Object.assign({ name: 'D' + i }, quad, { manualParcel: 0, manualHome: 0 }));
  const r = Engine.planMission(missionIn({ mission: { mode: 'perimeter', continuous: true, opsHours: 4, selection: 'manual' },
    root: { drones: ds, parcels: [{ name: 'Bahçe', pts: parcelB }], homes: [{ name: 'K2', ll: [41.1190, 28.1905] }] } }));
  assert.ok(r.parcels[0].gapSec <= 5 * 60, 'boşluk ' + r.parcels[0].gapSec);
});

test('Sürekli çevre devriyesinde görevdeki drone ortalaması ve ziyaret aralığı verilir', () => {
  const r = Engine.planMission(missionIn({ mission: { mode: 'perimeter', continuous: true, opsHours: 2 } }));
  r.parcels.forEach(p => { assert.ok(p.onStationMean > 0, p.name); assert.ok(p.revisitAvgSec > 0, p.name); assert.ok(p.series.length > 10); });
});

console.log(`\n${passed} test geçti`);
