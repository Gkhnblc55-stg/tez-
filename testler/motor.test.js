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

/* ---------- Çevre devriyesinde dağılım ve görüş ---------- */
const perimIn = (drs, over = {}) => missionIn({ mission: Object.assign({ mode: 'perimeter', continuous: true, opsHours: 3, selection: 'manual' }, over),
  root: { drones: drs.map((d, i) => Object.assign({ name: 'P' + i }, d, { manualParcel: 0, manualHome: 0 })), parcels: [{ name: 'Tarla', pts: parcel }], homes: [{ name: 'K1', ll: [41.1084, 28.1598] }] } });

test('Çevre devriyesi: aynı kalkıştan çıkan dronelar çevreye eşit aralıkla yayılır', () => {
  const r = Engine.planMission(perimIn([quad, quad, quad]));
  const p = r.parcels[0];
  assert.ok(p.spacingCv < 0.15, 'aralık değişkenliği ' + p.spacingCv);
  assert.ok(p.viewMean > 0 && p.viewMean <= 1, 'görüş ' + p.viewMean);
});

test('Çevre devriyesi: farklı hızlı filoda dağıtım aralıkları eşitler, görüşü düşürmez, beklemeyi uzatmaz', () => {
  const r = Engine.planMission(perimIn([quad, Engine.PRESETS.find(x => x.id === 'devriye').spec, Engine.PRESETS[1].spec]));
  const p = r.parcels[0];
  assert.ok(p.spacingCv < p.spacingCvBase / 3, `aralık değişkenliği ${p.spacingCv} / dağıtmasız ${p.spacingCvBase}`);
  assert.ok(p.viewMean >= p.viewBase - 0.01, `dağıtımlı ${p.viewMean} dağıtmasız ${p.viewBase}`);
  assert.ok(p.revisitMaxSec <= p.revisitMaxBase + 1, `en uzun bekleme ${p.revisitMaxSec} / ${p.revisitMaxBase}`);
});

test('Çevre devriyesi: kümelenen filoda (6 drone tek tur) dağıtım anlık görüşü belirgin artırır', () => {
  const r = Engine.planMission(perimIn(Array(6).fill(quad), { continuous: false }));
  const p = r.parcels[0];
  assert.ok(p.viewMean > p.viewBase * 1.5, `dağıtımlı ${p.viewMean} dağıtmasız ${p.viewBase}`);
  assert.ok(p.revisitMaxSec < p.revisitMaxBase * 0.6, `en uzun bekleme ${p.revisitMaxSec} / ${p.revisitMaxBase}`);
});

test('Çevre devriyesi: görüş için irtifa, kabul edilen en kaba GSD ve yasal sınıra kadar yükselir', () => {
  const lo = Engine.planMission(perimIn([quad], { viewGsdCm: 2.5 })), hi = Engine.planMission(perimIn([quad], { viewGsdCm: 5 }));
  assert.ok(hi.drones[0].alt > lo.drones[0].alt && hi.drones[0].alt <= 120, `${lo.drones[0].alt} -> ${hi.drones[0].alt}`);
  assert.ok(hi.parcels[0].viewMean > lo.parcels[0].viewMean, 'görüş artmadı');
});

test('Çevre devriyesi: bir drone batarya değiştirirken kalanlar yeniden eşit yayılır', () => {
  const r = Engine.planMission(perimIn([quad, quad, quad], { opsHours: 4 }));
  const p = r.parcels[0];
  // görevde 2 drone kaldığı anlarda da aralık değişkenliği düşük kalmalı
  assert.ok(p.spacingCvReduced < 0.2, 'eksik filoda aralık değişkenliği ' + p.spacingCvReduced);
});

/* ---------- 7/24 güvenlik devriyesi ---------- */
const ATAKOY =[[40.97689, 28.84113], [40.9774, 28.84799], [40.97575, 28.85184], [40.97367, 28.85074], [40.97201, 28.84909],
  [40.96911, 28.84689], [40.96673, 28.8458], [40.96673, 28.83975], [40.97098, 28.84058]];
const devriye = Engine.PRESETS.find(p => p.id === 'devriye').spec;
const secIn = (sec = {}, over = {}) => Object.assign({
  parcels: [{ name: 'Ataköy', pts: ATAKOY }], homes: [{ name: 'K1', ll: [40.9700, 28.8420] }], pois: [], obstacles: [{ lat: 40.9700, lon: 28.8430, h: 30 }],
  drones: [0, 1, 2, 3].map(i => Object.assign({ name: 'K' + i }, quad)).concat([0, 1].map(i => Object.assign({ name: 'D' + i }, devriye))),
  env: { windSpeed: 5, windFrom: 30, tempC: 18, elevMSL: 10, alpha: 0.14, terrainVar: 3 },
  mission: Object.assign(baseInput().mission, { mode: 'security', weight: 30 }),
  costs: baseInput().costs,
  security: Object.assign({ onStation: 2, reserve: 1, mtbfH: 150, mttrH: 2, chargers: 3, maxStations: 4, hours: 24, runs: 8, seed: 7, groundKmh: 25, marginMin: 3, critPct: 40 }, sec),
}, over);
const insideLL = (ll, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[0] > ll[0]) !== (b[0] > ll[0]) && ll[1] < (b[1] - a[1]) * (ll[0] - a[0]) / (b[0] - a[0]) + a[1]) c = !c; } return c; };

test('Güvenlik: istasyon sayısı drone ve şarj yuvasına göre, en az iki (yedeklilik), hepsi alan içinde', () => {
  const r = Engine.planMission(secIn());
  assert.strictEqual(r.mode, 'security');
  assert.ok(r.stations.length >= Math.max(2, Math.ceil(6 / 3)), 'istasyon ' + r.stations.length);
  r.stations.forEach(s => assert.ok(insideLL(s.ll, ATAKOY), 'istasyon dışarıda'));
  assert.ok(insideLL(r.repair.ll, ATAKOY), 'tamir dışarıda');
  assert.strictEqual(r.stations.reduce((a, s) => a + s.drones.length, 0), 6);
});

test('Güvenlik: aynı tohumla simülasyon aynı sonucu verir', () => {
  const a = Engine.planMission(secIn()), b = Engine.planMission(secIn());
  assert.strictEqual(a.rep.coverage, b.rep.coverage);
  assert.strictEqual(a.rep.failures, b.rep.failures);
});

test('Güvenlik: arıza yokken ve filo yeterliyken kapsama %99 üstü, boşluk yok denecek kadar az', () => {
  const r = Engine.planMission(secIn({ mtbfH: 1e9 }));
  assert.ok(r.rep.coverage >= 0.99 && r.rep.coverage <= 1, 'kapsama ' + r.rep.coverage);
  r.configs.forEach(c => assert.ok(c.covMean <= 1 && c.covP10 <= 1, 'yapılandırma kapsaması %100 üstü'));
  assert.ok(r.rep.maxGapSec <= 120, 'boşluk ' + r.rep.maxGapSec);
  assert.strictEqual(r.rep.failures, 0);
});

test('Güvenlik: arızalar rastgele oluşur, tamir edilip göreve döner, güvenlik yedeklerle korunur', () => {
  const r = Engine.planMission(secIn({ mtbfH: 6 }));
  assert.ok(r.rep.failures > 0, 'arıza yok');
  const kinds = new Set(r.drones.flatMap(d => d.timeline.map(s => s.k)));
  ['fail', 'repair'].forEach(k => assert.ok(kinds.has(k), k + ' olayı yok'));
  assert.ok(r.rep.coverage > 0.85, 'kapsama ' + r.rep.coverage);
  assert.ok(r.rep.reserveAvail >= 0 && r.rep.reserveAvail <= 1);
});

test('Güvenlik: seçilen yapılandırma en kötü senaryo kapsamasında en iyisidir', () => {
  const r = Engine.planMission(secIn());
  const best = Math.max(...r.configs.map(c => c.covP10));
  const chosen = r.configs.find(c => c.chosen);
  assert.ok(chosen, 'seçim yok');
  assert.ok(chosen.covP10 >= best - 0.0025, `seçilen ${chosen.covP10} en iyi ${best}`);
});

test('Güvenlik: drone yetersizse gereken sayı önerilir ve kritik uyarı verilir', () => {
  const r = Engine.planMission(secIn({ onStation: 3, reserve: 1 }, { drones: [Object.assign({ name: 'Tek' }, quad)] }));
  assert.ok(r.fleet.needed > r.fleet.owned, JSON.stringify(r.fleet));
  assert.ok(r.warnings.some(w => w.level === 'crit'));
});

test('Güvenlik: varsayılan plan (6 drone, 24 saat, 8 deneme, tüm yapılandırmalar) 3 saniyenin altında', () => {
  const t = Date.now(); Engine.planMission(secIn()); const ms = Date.now() - t;
  assert.ok(ms < 3000, ms + ' ms');
});

/* ---------- Dış drone tehdidi: tespit ve önleme ---------- */
const ALL_SC = ['direct', 'lowalt', 'swarm', 'multi', 'decoy', 'loiter', 'fixedwing'];
const defIn = (def = {}, sec = {}) => secIn(Object.assign({ runs: 4 }, sec), {
  defense: Object.assign({ enabled: true, scenarios: ALL_SC, radars: 1, rfs: 1, eos: 2, acoustics: 2, jammers: 1, interceptors: 3,
    patrolAssist: true, runs: 20, seed: 11, autonomousPct: 30, reactionSec: 15 }, def),
});
const sc = (r, id) => r.defense.scenarios.find(s => s.id === id);

test('Savunma: kapalıyken sonuçta savunma bölümü yok', () => {
  const r = Engine.planMission(secIn({ runs: 4 }));
  assert.strictEqual(r.defense, undefined);
});

test('Savunma: sensörler istenen sayıda ve alan içinde yerleşir, 36 yönlü kör sektör analizi verilir', () => {
  const r = Engine.planMission(defIn());
  const n = (t) => r.defense.sensors.filter(s => s.type === t).length;
  assert.deepStrictEqual([n('radar'), n('rf'), n('eo'), n('acoustic')], [1, 1, 2, 2]);
  r.defense.sensors.concat(r.defense.jammers).forEach(s => assert.ok(insideLL(s.ll, ATAKOY), s.type + ' dışarıda'));
  assert.strictEqual(r.defense.sectors.length, 36);
  assert.strictEqual(r.defense.scenarios.length, ALL_SC.length);
});

test('Savunma: aynı tohumla aynı sonuç', () => {
  const a = Engine.planMission(defIn()), b = Engine.planMission(defIn());
  assert.deepStrictEqual(a.defense.scenarios.map(s => [s.detectRate, s.leakRate]), b.defense.scenarios.map(s => [s.detectRate, s.leakRate]));
});

test('Savunma: sensörler tekil tehdidi yüksek olasılıkla ve çok daha erken tespit eder (sensörsüzde yalnız devriye kamerası görür)', () => {
  const full = sc(Engine.planMission(defIn({ scenarios: ['direct'] })), 'direct');
  const none = sc(Engine.planMission(defIn({ scenarios: ['direct'], radars: 0, rfs: 0, eos: 0, acoustics: 0 })), 'direct');
  assert.ok(full.detectRate >= 0.9, 'tespit ' + full.detectRate);
  assert.ok(full.detectDistM > 1.5 * none.detectDistM, `tespit mesafesi sensörlü ${full.detectDistM} / sensörsüz ${none.detectDistM}`);
  assert.ok(none.firstBy.patrol > 0.99, 'sensörsüzde ilk tespit devriye kamerasıyla olmalı');
  assert.ok(full.warnSec > none.warnSec, 'erken uyarı sensörle artmalı');
});

test('Savunma: alçak irtifa tehdidi radarla daha geç (daha yakında) tespit edilir', () => {
  const r = Engine.planMission(defIn({ scenarios: ['direct', 'lowalt'], rfs: 0, eos: 0, acoustics: 0, patrolAssist: false, autonomousPct: 0 }));
  assert.ok(sc(r, 'lowalt').detectDistM < sc(r, 'direct').detectDistM, `alçak ${sc(r, 'lowalt').detectDistM} / normal ${sc(r, 'direct').detectDistM}`);
});

test('Savunma: otonom tehditleri RF dedektör göremez, karıştırıcı etkisizleştiremez', () => {
  const r = Engine.planMission(defIn({ scenarios: ['direct'], autonomousPct: 100, radars: 0, eos: 0, acoustics: 0, patrolAssist: false, interceptors: 0 }));
  const s = sc(r, 'direct');
  assert.strictEqual(s.seenBy.rf, 0, 'RF dedektör otonom tehdidi görmemeli');
  assert.strictEqual(s.byEffector.jammer, 0);
});

test('Savunma: sürü saldırısında önleyici sayısı arttıkça sızma azalır', () => {
  const few = sc(Engine.planMission(defIn({ scenarios: ['swarm'], interceptors: 0, jammers: 0 })), 'swarm');
  const many = sc(Engine.planMission(defIn({ scenarios: ['swarm'], interceptors: 8, jammers: 0 })), 'swarm');
  assert.ok(many.leakRate < few.leakRate, `8 önleyici ${many.leakRate} / 0 önleyici ${few.leakRate}`);
});

test('Savunma: yem dronlu saldırıda asıl tehdidin sızma oranı tekil saldırıdan düşük değildir', () => {
  const r = Engine.planMission(defIn({ scenarios: ['direct', 'decoy'], interceptors: 2, jammers: 0 }));
  assert.ok(sc(r, 'decoy').mainLeakRate >= sc(r, 'direct').leakRate, `yem ${sc(r, 'decoy').mainLeakRate} / tekil ${sc(r, 'direct').leakRate}`);
});

test('Savunma: her senaryo için oynatılabilir temsilî saldırı ve olay kaydı üretilir', () => {
  const r = Engine.planMission(defIn());
  r.defense.scenarios.forEach(s => {
    assert.ok(s.rep && s.rep.threats.length >= 1 && s.rep.threats[0].timeline.length > 2, s.id + ' temsilî yok');
    assert.ok(s.rep.t0 >= 0 && s.rep.t0 < r.windowSec, s.id + ' başlangıç zamanı');
    assert.ok(s.rep.events.some(e => /TESPİT|SIZMA/.test(e.msg)), s.id + ' olay yok');
  });
});

test('Savunma: önleyici sayısına göre duyarlılık analizi verilir', () => {
  const r = Engine.planMission(defIn());
  assert.ok(r.defense.sensitivity.length >= 3);
  const f = r.defense.sensitivity;
  assert.ok(f[f.length - 1].leakRate <= f[0].leakRate, 'daha çok önleyiciyle sızma artmamalı');
});

test('Savunma: tüm senaryolar dahil ek hesap 2,5 saniyenin altında', () => {
  const t0 = Date.now(); Engine.planMission(secIn({ runs: 4 })); const base = Date.now() - t0;
  const t1 = Date.now(); Engine.planMission(defIn()); const withDef = Date.now() - t1;
  assert.ok(withDef - base < 2500, `ek süre ${withDef - base} ms`);
});

// İsteğe bağlı saldırılar: rastgele saldırı, saldırı planı, aynı anda farklı yönler
const defR = Engine.planMission(defIn({ scenarios: ['direct', 'swarm', 'multi', 'decoy'] }));
const GEO = JSON.parse(JSON.stringify(defR.defense.geo || {}));
const PAT = JSON.parse(JSON.stringify(defR.drones.filter((d) => d.timeline && d.timeline.length).map((d) => ({ name: d.name, timeline: d.timeline.map((s) => ({ t: s.t, x: s.x, y: s.y, z: s.z })) }))));
const bearingOf = (p) => ((Math.atan2(p.x - GEO.C[0], p.y - GEO.C[1]) * 180 / Math.PI) + 360) % 360;
const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

test('Saldırı: savunma sonucu saldırı benzetimi için geometri verir', () => {
  assert.ok(GEO && GEO.sensors.length && GEO.bases.length && GEO.assets.length && GEO.origin && GEO.spawnR > 0);
});

test('Saldırı: rastgele saldırı aynı tohumla aynıdır, 1-3 dalga farklı yönlerden gelir', () => {
  assert.deepStrictEqual(Engine.randomAttack(42, ['direct', 'swarm']), Engine.randomAttack(42, ['direct', 'swarm']));
  let multi = 0;
  for (let s = 1; s <= 40; s++) {
    const a = Engine.randomAttack(s, ['direct', 'swarm']);
    assert.ok(a.waves.length >= 1 && a.waves.length <= 3);
    a.waves.forEach((w) => assert.ok(['direct', 'swarm'].includes(w.scenario)));
    for (let i = 0; i < a.waves.length; i++) for (let j = i + 1; j < a.waves.length; j++) assert.ok(angDiff(a.waves[i].bearing, a.waves[j].bearing) >= 60, 'yönler en az 60° ayrık');
    if (a.waves.length > 1) multi++;
  }
  assert.ok(multi >= 10, 'çok yönlü rastgele saldırılar da üretilmeli');
});

test('Saldırı: planlanan iki dalga aynı anda karşı yönlerden gelir', () => {
  const r = Engine.simulateAttacks(GEO, [{ t0: 3600, seed: 5, waves: [{ scenario: 'direct', bearing: 0, delaySec: 0 }, { scenario: 'direct', bearing: 180, delaySec: 0 }] }], PAT);
  assert.strictEqual(r.threats.length, 2);
  const [a, b] = r.threats;
  near(bearingOf(a.timeline[0]), 0, 25, 'ilk dalga kuzeyden');
  near(angDiff(bearingOf(b.timeline[0]), 180), 0, 25, 'ikinci dalga güneyden');
  assert.ok(r.threats.every((th) => th.timeline[0].t >= 3600 && th.timeline[0].t <= 3605), 'iki dalga da aynı anda başlar');
  assert.ok(r.events.length && r.events.every((e) => e.t >= 3600));
  assert.strictEqual(r.attacks.length, 1);
  assert.strictEqual(r.attacks[0].threats, 2);
  assert.strictEqual(r.attacks[0].neutral + r.attacks[0].leak + r.attacks[0].other, 2);
});

test('Saldırı: dalga sayısı, gecikme ve otonomluk ayarı uygulanır', () => {
  const r = Engine.simulateAttacks(GEO, [{ t0: 600, seed: 9, waves: [
    { scenario: 'swarm', bearing: 90, count: 4, delaySec: 0, auto: 'yes' },
    { scenario: 'multi', bearing: 0, count: 5, delaySec: 60, auto: 'no' }] }], PAT);
  const sw = r.threats.filter((t) => t.wave === 0), mu = r.threats.filter((t) => t.wave === 1);
  assert.strictEqual(sw.length, 4); assert.strictEqual(mu.length, 5);
  assert.ok(sw.every((t) => t.auto) && mu.every((t) => !t.auto));
  assert.ok(mu.every((t) => t.timeline[0].t >= 660), 'gecikmeli dalga 60 sn sonra');
  const bs = mu.map((t) => bearingOf(t.timeline[0])).sort((p, q) => p - q);
  for (let i = 1; i < bs.length; i++) near(bs[i] - bs[i - 1], 72, 35, 'çok yönlü dalga eşit aralıklı');
});

test('Saldırı: sonradan eklenen saldırı önceki saldırının geçmişini değiştirmez', () => {
  const A = { t0: 1200, seed: 3, waves: [{ scenario: 'swarm', bearing: 45, count: 6 }] };
  const B = { t0: 1300, seed: 4, waves: [{ scenario: 'direct', bearing: 225 }] };
  const one = Engine.simulateAttacks(GEO, [A], PAT), two = Engine.simulateAttacks(GEO, [A, B], PAT);
  const before = (r) => r.events.filter((e) => e.t < 1300).map((e) => e.t + e.msg);
  assert.deepStrictEqual(before(two), before(one));
  assert.strictEqual(two.attacks.length, 2);
  assert.ok(two.threats.some((t) => t.attack === 1));
});

test('Saldırı: önleyiciler saldırılar arasında ortaktır', () => {
  const g1 = Object.assign({}, GEO, { DF: Object.assign({}, GEO.DF, { interceptors: 1, jammers: 0 }), jammers: [] });
  const A = { t0: 0, seed: 1, waves: [{ scenario: 'direct', bearing: 0, auto: 'yes' }] };
  const B = { t0: 0, seed: 2, waves: [{ scenario: 'direct', bearing: 180, auto: 'yes' }] };
  const r = Engine.simulateAttacks(g1, [A, B], PAT);
  assert.strictEqual(r.interceptors.length, 1, 'tek önleyici iki saldırıya da hizmet eder');
});

test('Saldırı: saatler arayla planlanan saldırılar hızlı hesaplanır', () => {
  const t = Date.now();
  const r = Engine.simulateAttacks(GEO, [{ t0: 0, seed: 1, waves: [{ scenario: 'direct' }] }, { t0: 6 * 3600, seed: 2, waves: [{ scenario: 'random' }] }], PAT);
  assert.ok(Date.now() - t < 1500, `süre ${Date.now() - t} ms`);
  assert.ok(r.threats.filter((x) => x.attack === 1).every((x) => x.timeline[0].t >= 6 * 3600));
});

console.log(`\n${passed} test geçti`);
