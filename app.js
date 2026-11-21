import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const SITE = window.SITE, W = window.WIND, E = window.EPCW, N = W.N, T = W.T;
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const fmt = (v, d = 0) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
const fdate = d => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(' г.', '');
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.round(m % 60)).padStart(2, '0');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches, PHONE = matchMedia('(max-width:760px)').matches;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(1000), pick = n => Math.floor(R() * n);
const wName = i => SITE.wtg[i][0], COMP = ['С', 'ССВ', 'СВ', 'ВСВ', 'В', 'ВЮВ', 'ЮВ', 'ЮЮВ', 'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ', 'З', 'ЗСЗ', 'СЗ', 'ССЗ'], compass = d => COMP[Math.round(d / 22.5) % 16];

/* ═════════ состояние и модель эксплуатации ═════════ */
const NETS = { normal: ['Все линии в работе', {}], kentau: ['Отключена ВЛ на Кентау', { line: 2 }], jambyl: ['Отключена одна ВЛ на Жамбыл', { line: 0 }], trafo: ['Отключён трансформатор Т2', { tr: 1 }], cap: ['Ограничение оператора 600 МВт', { lim: 600 }] };
const STRATS = { agc: 'АРЧМ: регулирование частоты', smooth: 'Сглаживание выдачи', shift: 'Сдвиг на вечерний пик', firm: 'Ровный суточный график', idle: 'Резерв, без циклов' };
const S = { stage: 'ops', min: 780, day: 'normal', net: 'normal', strat: 'smooth', bday: 600, mode: 'real', bmode: 'stat', sel: null, playing: false, orders: [], fixed: 0, econ: {} };
// условные отказы: 0 работает, 3 авария, 4 обслуживание, 5 ограничение мощности
const fault = new Uint8Array(N), faultText = {}, derate = new Float32Array(N).fill(1), tripped = new Uint8Array(W.NF);
[['Перегрев подшипника генератора', 3], ['Отказ привода поворота лопасти', 3], ['Ошибка преобразователя частоты', 3], ['Плановое обслуживание', 4], ['Плановое обслуживание', 4]].forEach(([t, c]) => { let i; do i = pick(N); while (fault[i]); fault[i] = c; faultText[i] = t; });
[['Рассогласование по ветру 9°', 0.91], ['Малошумный режим', 0.8]].forEach(([t, k]) => { let i; do i = pick(N); while (fault[i]); fault[i] = 5; faultText[i] = t; derate[i] = k; });
tripped[pick(W.NF)] = 1;
/* расчёт и факт: часть ВЭУ работает, но даёт меньше расчёта по кривой мощности — причина видна только в сравнении */
const perf = new Float32Array(N).fill(1), perfText = {}, eExp = new Float32Array(N), eAct = new Float32Array(N);
[['Загрязнение передней кромки лопастей', .93], ['Рассогласование гондолы по ветру 6°', .95], ['Угол лопастей сбит после замены датчика', .9], ['Обледенение анемометра: занижен ветер', .88], ['Износ передней кромки лопастей', .94], ['Старая кривая в контроллере после обновления', .86]].forEach(([t, k]) => { let i; do i = pick(N); while (fault[i] || perf[i] < 1); perf[i] = k; perfText[i] = t; });
for (let i = 0; i < N; i++) if (perf[i] === 1) perf[i] = 0.982 + R() * 0.018;
/* предиктивная диагностика: суточные средние за 60 суток, порог и прогноз даты его достижения по тренду последних трёх недель */
const DIAG = [['Главный подшипник', 'Вибрация', 'мм/с', 2.4, 4.5, 7.1, 5.3, null, 'Осмотр и анализ смазки на ближайшем окне по ветру, подшипник — в заказ'], ['Редуктор', 'Температура масла', '°C', 58, 70, 80, 74, 'gear', 'Проверить маслоохладитель и фильтр, взять пробу масла'],
  ['Генератор', 'Температура подшипника', '°C', 66, 85, 95, 89, 'gen', 'Проверить смазку и центровку, замена подшипника — в плановое окно'], ['Редуктор', 'Вибрация быстроходного вала', 'мм/с', 2.9, 5.6, 9.0, 6.4, null, 'Эндоскопия зубчатой пары, контроль зазоров'], ['Генератор', 'Вибрация', 'мм/с', 2.0, 4.5, 7.1, 4.9, null, 'Проверить центровку муфты и крепление']]
  .map(([comp, par, unit, base, warn, alarm, cur, key, rec], n) => { let i; do i = pick(N); while (fault[i] || perf[i] < 0.97); const q = rng(700 + n), ser = []; for (let d = 0; d < 60; d++) { const k = d / 59; ser.push(base + (cur - base) * Math.pow(k, 1.7 + n * .15) + (q() - .5) * (alarm - base) * .05); } ser[59] = cur;
    let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let d = 39; d < 60; d++) { sx += d; sy += ser[d]; sxx += d * d; sxy += d * ser[d]; } const slope = (21 * sxy - sx * sy) / (21 * sxx - sx * sx), days = Math.max(3, Math.round((alarm - cur) / Math.max(1e-6, slope)));
    return { i, comp, par, unit, base, warn, alarm, cur, key, rec, ser, slope, days, date: new Date(Date.now() + days * 864e5).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) }; }).sort((a, b) => a.days - b.days);
const diagOf = new Map(DIAG.map(d => [d.i, d])), SCADA = { rows: [], paused: false };
/* метеомачты и датчики: положение условное, показания считаются из того же поля ветра, что и мощность ВЭУ */
const MET = (() => { const xs = SITE.wtg.map(w => w[1]), zs = SITE.wtg.map(w => w[2]), far = (fx, fz) => { let b = 0, bv = -1e12; for (let i = 0; i < N; i++) { const q = xs[i] * fx + zs[i] * fz; if (q > bv) { bv = q; b = i; } } return b; }, a = far(-1, -.3), b = far(.6, 1), c = far(1, -.6);
  return [{ id: 'М1', name: 'Метеомачта М1', kind: 'mast', x: xs[a] - 420, z: zs[a] - 260, note: 'западный край, ' + SITE.wtg[a][0] }, { id: 'М2', name: 'Метеомачта М2', kind: 'mast', x: SITE.ss[0] - 900, z: SITE.ss[1] - 700, note: 'центр площадки' }, { id: 'М3', name: 'Метеомачта М3', kind: 'mast', x: xs[b] + 380, z: zs[b] + 300, note: 'юго-восточный край, ' + SITE.wtg[b][0] },
    { id: 'Л1', name: 'Лидар Л1', kind: 'lidar', x: xs[c] + 350, z: zs[c] - 200, note: 'профиль ветра 40–200 м' }, { id: 'ПС', name: 'Метеостанция ПС', kind: 'ws', x: SITE.ss[0] - 120, z: SITE.ss[1] + 110, note: 'подстанция 220/35 кВ' }]; })();
const vf = new Float32Array(N), v = new Float32Array(N), def = new Float32Array(N), pw = new Float32Array(N), pExp = new Float32Array(N), rho = new Float32Array(N), run = new Uint8Array(N), st = new Uint8Array(N), rpm = new Float32Array(N), built = new Uint8Array(N).fill(1);
let live = {}, hMean = 1100;
function compute(min) {
  const w = W.windAt(min, S.day);
  for (let i = 0; i < N; i++) {
    vf[i] = w.v * W.speedUp(W.elev[i], hMean) * (1 + 0.05 * Math.sin(min / 9 + i * 1.7) + 0.03 * Math.sin(min / 2.3 + i * 0.9)); rho[i] = W.density(W.elev[i] + T.hub, w.temp);
    run[i] = built[i] && fault[i] !== 3 && fault[i] !== 4 && !tripped[W.feeder[i]] && vf[i] >= T.cutIn && vf[i] < T.cutOut ? 1 : 0;
  }
  W.wake(w.dir, vf, rho, run, v, def);
  let free = 0, waked = 0, act = 0;
  for (let i = 0; i < N; i++) {
    const ok = built[i] ? W.power(v[i], rho[i]) : 0; pExp[i] = ok; free += built[i] ? W.power(vf[i], rho[i]) : 0; waked += ok;
    pw[i] = run[i] ? Math.min(T.rated, ok * derate[i] * perf[i]) : 0; act += pw[i];
    st[i] = !built[i] ? 9 : tripped[W.feeder[i]] ? 6 : fault[i] === 3 ? 3 : fault[i] === 4 ? 4 : v[i] >= T.cutOut ? 2 : v[i] < T.cutIn ? 1 : fault[i] === 5 ? 5 : 0;
    rpm[i] = run[i] ? W.rpm(v[i]) : 0.15;
  }
  const c = W.collect(pw, tripped, NETS[S.net][1].tr ?? -1);
  return { w, free, waked, act, mv: c.mvLoss, tr: c.trLoss, hv: c.hv, trLoad: c.trLoad, fP: c.fP, over: c.over };
}
let curve = [], windHv = [], windC = [], bess = [], soc = [], curt = [], eDay = 0, bCap = W.BESS.capacity(1);
function buildCurve() {
  windHv = []; windC = []; eExp.fill(0); eAct.fill(0); for (let m = 0; m <= 1440; m += 10) { const r = compute(m); windHv.push(r.hv / 1000); windC.push(r.w.v); if (m < 1440) for (let i = 0; i < N; i++) { eExp[i] += pExp[i] / 6; eAct[i] += pw[i] / 6; } }      // кВт·ч за сутки: расчёт по кривой мощности и следам против факта
  // накопитель: 300 МВт, полезная ёмкость первого года; излишек сверх ограничения сети сначала идёт в заряд, остаток срезается
  const B = W.BESS, lim = NETS[S.net][1].lim ?? 1000, n = windHv.length, mean = windHv.reduce((a, b) => a + b, 0) / n, ec = Math.sqrt(B.rte), dt = 1 / 6; bCap = B.capacity(1);
  curve = []; bess = []; soc = []; curt = []; let e = bCap * 0.5;
  for (let k = 0; k < n; k++) { const w = windHv[k], h = k / 6; let p = 0;
    if (S.strat === 'smooth') { let ma = 0, c = 0; for (let j = Math.max(0, k - 9); j <= Math.min(n - 1, k + 9); j++) { ma += windHv[j]; c++; } p = w - ma / c; }
    else if (S.strat === 'shift') p = h < 7 ? Math.min(w, 110) : h >= 18 && h < 22 ? -150 : 0;
    else if (S.strat === 'firm') p = w - mean;
    if (w - p > lim) p = w - lim;
    p = Math.max(-B.mw, Math.min(B.mw, p, w));
    if (p > 0) { p = Math.max(0, Math.min(p, (bCap * 0.98 - e) / (ec * dt))); e += p * ec * dt; } else { p = Math.min(0, Math.max(p, -(e - bCap * 0.03) * ec / dt)); e += p / ec * dt; }
    let g = w - p, cu = 0; if (g > lim) { cu = g - lim; g = lim; }
    curve.push(g); bess.push(p); soc.push(e / bCap); curt.push(cu); }
  eDay = curve.reduce((s, x, i) => i ? s + (x + curve[i - 1]) / 12 : 0, 0);
}
const energyUntil = min => { let e = 0; const n = Math.floor(min / 10); for (let i = 1; i <= n; i++) e += (curve[i] + curve[i - 1]) / 12; return e; };

/* ═════════ сцена ═════════ */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xb9c4d2, 20000, 130000);
const camera = new THREE.PerspectiveCamera(36, 1, 5, 200000); camera.position.set(-22000, 16000, 30000);
let composer = null;   // мягкое свечение ярких участков; на телефоне выключено
try { if (!PHONE) { composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 })); composer.addPass(new RenderPass(scene, camera)); composer.addPass(new UnrealBloomPass(new THREE.Vector2(4, 4), 0.2, 0.6, 0.96)); composer.addPass(new OutputPass()); } } catch (e) { console.warn('composer', e); composer = null; }
const controls = new OrbitControls(camera, canvas);
Object.assign(controls, { enableDamping: true, dampingFactor: .08, maxPolarAngle: 87 * RAD, minDistance: 60, maxDistance: 60000, zoomToCursor: true });
const sky = new Sky(); sky.scale.setScalar(150000); Object.assign(sky.material.uniforms.turbidity, { value: 4 }); sky.material.uniforms.rayleigh.value = 1.2; sky.material.uniforms.mieCoefficient.value = .004; sky.material.uniforms.mieDirectionalG.value = .82; scene.add(sky);
/* облака: тот же шум, что у теней на земле, поэтому тень лежит под своим облаком */
const cloudMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, uniforms: { uOff: { value: new THREE.Vector2() }, uCloud: { value: .3 }, uBright: { value: 1 }, uCam: { value: new THREE.Vector3() } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform vec2 uOff; uniform float uCloud, uBright; uniform vec3 uCam; varying vec3 vW;
    float hsh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float nz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x),mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*nz(p);p*=2.03;a*=.5;}return s;}
    void main(){ float n = fbm(vW.xz*0.00016+uOff), a = smoothstep(0.47,0.70,n), d = length(vW.xz-uCam.xz);
      a *= (1.0 - smoothstep(50000.0, 150000.0, d)) * min(1.0, uCloud * 3.2); if (a < 0.01) discard;
      float sh = 0.72 + 0.28 * smoothstep(0.5, 0.85, fbm(vW.xz*0.0005+uOff*3.0)); gl_FragColor = vec4(vec3(uBright * sh), a * 0.9); }` });
const clouds = new THREE.Mesh(new THREE.PlaneGeometry(320000, 320000).rotateX(-Math.PI / 2), cloudMat); clouds.position.y = 3600; clouds.renderOrder = 2; clouds.frustumCulled = false; scene.add(clouds);
const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(); let envRT = null, envDirty = true, envTimer = 0;
const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x8a7a5c, 1); scene.add(hemi);
const sunL = new THREE.DirectionalLight(0xfff1dc, 3); sunL.castShadow = true; sunL.shadow.mapSize.set(PHONE ? 2048 : 4096, PHONE ? 2048 : 4096); sunL.shadow.bias = -0.0005; sunL.shadow.normalBias = 1.5; scene.add(sunL, sunL.target);
function sunAt(min) { const doy = S.stage === 'build' ? 200 : 172, H = (min / 60 + (69.8 - 75) / 15 - 12) * 15 * RAD, dec = 23.44 * RAD * Math.sin(2 * Math.PI * (284 + doy) / 365), lat = 43.35 * RAD;
  const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H); return new THREE.Vector3(-Math.cos(dec) * Math.sin(H), up, -(Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(H))); }
function applySun(min) {
  const d = sunAt(min), el = Math.asin(d.y) * DEG; sky.material.uniforms.sunPosition.value.copy(d);
  const k = THREE.MathUtils.smoothstep(el, -3, 9), low = THREE.MathUtils.smoothstep(el, 0, 22);
  sunL.intensity = 3.4 * k; sunL.color.setRGB(1, .72 + .26 * low, .5 + .44 * low); sunL.userData.dir = d.y > 0.03 ? d : new THREE.Vector3(d.x, 0.03, d.z).normalize();
  hemi.intensity = .1 + .95 * k; hemi.color.setRGB(.55 + .3 * k, .66 + .22 * k, 1); hemi.groundColor.setRGB(.5 * k + .05, .44 * k + .05, .33 * k + .06);
  scene.fog.color.set(0x0b1019).lerp(new THREE.Color(0xd2a383), k).lerp(new THREE.Color(0xbcc7d4), low); renderer.toneMappingExposure = .27 + .17 * k; CLOUD.uCloud.value = .34 * k; cloudMat.uniforms.uBright.value = .25 + 2.3 * k; cloudMat.uniforms.uCloud.value = .34; envDirty = true; live.night = el < 0; live.el = el;
}
function refreshEnv() { envScene.add(sky); const rt = pmrem.fromScene(envScene, 0, 1, 200000); scene.add(sky); if (envRT) envRT.dispose(); envRT = rt; scene.environment = rt.texture; scene.environmentIntensity = .25 + .75 * THREE.MathUtils.smoothstep(live.el ?? 40, -4, 10); }

/* рельеф: сетка высот, заполняется из открытых тайлов высот; подложка — спутниковый снимок */
const TX0 = -11000, TX1 = 11500, TZ0 = -13500, TZ1 = 13500, STEP = innerWidth <= 760 ? 75 : 40, DEMZ = innerWidth <= 760 ? 12 : 13, NX = Math.round((TX1 - TX0) / STEP) + 1, NZ = Math.round((TZ1 - TZ0) / STEP) + 1;
const hAbs = new Float32Array(NX * NZ); let E0 = 1000;
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const x = TX0 + i * STEP, z = TZ0 + j * STEP; hAbs[j * NX + i] = 1100 + 55 * Math.sin(x / 2600 + 1) * Math.cos(z / 3100) + 30 * Math.sin(x / 900 + z / 1300) - z * 0.012; }
function ground(x, z) { const fx = Math.max(0, Math.min(NX - 1.001, (x - TX0) / STEP)), fz = Math.max(0, Math.min(NZ - 1.001, (z - TZ0) / STEP)), i = fx | 0, j = fz | 0, a = fx - i, b = fz - j, k = j * NX + i;
  return (hAbs[k] * (1 - a) * (1 - b) + hAbs[k + 1] * a * (1 - b) + hAbs[k + NX] * (1 - a) * b + hAbs[k + NX + 1] * a * b) - E0; }
const M = SITE.meta, lonOf = x => M.lon0 + x / M.kx, latOf = z => M.lat0 - z / M.kz;
const tX = (lon, zm) => (lon + 180) / 360 * 2 ** zm, tY = (lat, zm) => (1 - Math.log(Math.tan(lat * RAD) + 1 / Math.cos(lat * RAD)) / Math.PI) / 2 * 2 ** zm;
const terGeo = new THREE.PlaneGeometry(TX1 - TX0, TZ1 - TZ0, NX - 1, NZ - 1); terGeo.rotateX(-Math.PI / 2); terGeo.translate((TX0 + TX1) / 2, 0, (TZ0 + TZ1) / 2);
const terMat = new THREE.MeshStandardMaterial({ color: 0xb9ac8a, roughness: 1, metalness: 0 }), terrain = new THREE.Mesh(terGeo, terMat); terrain.receiveShadow = true; scene.add(terrain);
const CLOUD = { uOff: { value: new THREE.Vector2() }, uCloud: { value: 0.3 } };
terMat.onBeforeCompile = sh => { Object.assign(sh.uniforms, CLOUD);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWxz;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWxz = position.xz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
    uniform vec2 uOff; uniform float uCloud; varying vec2 vWxz;
    float hsh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float nz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x),mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*nz(p);p*=2.03;a*=.5;}return s;}`)
    .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 1.0 - uCloud*smoothstep(0.47,0.68,fbm(vWxz*0.00016+uOff));'); };
function applyHeights() {
  let mn = 1e9, sm = 0; for (let k = 0; k < hAbs.length; k++) { if (hAbs[k] < mn) mn = hAbs[k]; } E0 = mn;
  const p = terGeo.attributes.position; for (let k = 0; k < p.count; k++) p.setY(k, hAbs[k] - E0); p.needsUpdate = true; terGeo.computeVertexNormals(); terGeo.computeBoundingSphere();
  for (let i = 0; i < N; i++) { W.elev[i] = ground(W.X[i], W.Z[i]) + E0; sm += W.elev[i]; } hMean = sm / N; W.resetAep();
}
async function mosaic(zm, url, onTile) {
  const x0 = Math.floor(tX(lonOf(TX0), zm)), x1 = Math.floor(tX(lonOf(TX1), zm)), y0 = Math.floor(tY(latOf(TZ0), zm)), y1 = Math.floor(tY(latOf(TZ1), zm));
  const cv = document.createElement('canvas'); cv.width = (x1 - x0 + 1) * 256; cv.height = (y1 - y0 + 1) * 256; const g = cv.getContext('2d', { willReadFrequently: true }); let ok = 0, bad = 0; const jobs = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) jobs.push(new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { g.drawImage(im, (x - x0) * 256, (y - y0) * 256); ok++; onTile && onTile(); res(); }; im.onerror = () => { bad++; res(); }; im.src = url(zm, x, y); }));
  await Promise.all(jobs); return { cv, g, x0, y0, zm, ok, bad };
}
async function loadTerrain() {
  const status = $('#status'); status.textContent = 'Загружаю рельеф и спутниковый снимок…';
  let demOk = false, imgOk = false;
  try { const d = await mosaic(DEMZ, (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`);
    if (d.ok && !d.bad) { const px = d.g.getImageData(0, 0, d.cv.width, d.cv.height).data, wd = d.cv.width, ht = d.cv.height;
      const smp = (x, z) => { const fx = Math.max(0, Math.min(wd - 1.001, (tX(lonOf(x), DEMZ) - d.x0) * 256)), fy = Math.max(0, Math.min(ht - 1.001, (tY(latOf(z), DEMZ) - d.y0) * 256)), i = fx | 0, j = fy | 0, a = fx - i, b = fy - j;
        const h = k => px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768, k = (j * wd + i) * 4; return h(k) * (1 - a) * (1 - b) + h(k + 4) * a * (1 - b) + h(k + wd * 4) * (1 - a) * b + h(k + wd * 4 + 4) * a * b; };
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) hAbs[j * NX + i] = smp(TX0 + i * STEP, TZ0 + j * STEP);
      demOk = true; applyHeights(); layout(); buildCurve(); refresh(); } } catch (e) { console.warn('DEM', e); }
  try { const zm = PHONE ? 13 : 14; let tex = null, last = 0; const uv = terGeo.attributes.uv;
    const d = await mosaic(zm, (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, () => { if (tex && performance.now() - last > 400) { tex.needsUpdate = true; last = performance.now(); } });
    if (d.ok > d.bad) { for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) uv.setXY(j * NX + i, (tX(lonOf(TX0 + i * STEP), zm) - d.x0) * 256 / d.cv.width, 1 - (tY(latOf(TZ0 + j * STEP), zm) - d.y0) * 256 / d.cv.height);
      uv.needsUpdate = true; tex = new THREE.CanvasTexture(d.cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; terMat.map = tex; terMat.userData.img = true; terTone(); terMat.needsUpdate = true; imgOk = true; } } catch (e) { console.warn('imagery', e); }
  S.terrain = { demOk, imgOk }; status.textContent = demOk && imgOk ? '' : 'Картографический сервис недоступен: рельеф и подложка условные'; setSrc();
}

/* вспомогательная геометрия: линии и ленты, уложенные на рельеф */
function drape(flat, step, lift) { const o = []; for (let i = 0; i + 3 < flat.length; i += 2) { const ax = flat[i], az = flat[i + 1], bx = flat[i + 2], bz = flat[i + 3], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = i ? 1 : 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; o.push(x, ground(x, z) + lift, z); } } return o; }
function lineOf(polys, step, lift, mat) { const seg = []; for (const f of polys) { const p = drape(f, step, lift); for (let i = 0; i + 5 < p.length; i += 3) seg.push(p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3)); return new THREE.LineSegments(g, mat); }
function ribbonOf(polys, wdt, lift, mat) { const pos = [], idx = []; for (const f of polys) { const p = drape(f, 30, lift), n = p.length / 3, b = pos.length / 3;
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1) * 3, c = Math.min(n - 1, i + 1) * 3; let dx = p[c] - p[a], dz = p[c + 2] - p[a + 2]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      pos.push(p[i * 3] - dz * wdt / 2, p[i * 3 + 1], p[i * 3 + 2] + dx * wdt / 2, p[i * 3] + dz * wdt / 2, p[i * 3 + 1], p[i * 3 + 2] - dx * wdt / 2); if (i) { const k = b + i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); } } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m; }

/* ВЭУ: башни, гондолы, лопасти — экземпляры одной геометрии */
const white = new THREE.MeshStandardMaterial({ color: 0xe4e7ea, roughness: .5, metalness: .1 }), grey = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: .7, metalness: .4 }), dark = new THREE.MeshStandardMaterial({ color: 0x3b424d, roughness: .7, metalness: .3 }), concrete = new THREE.MeshStandardMaterial({ color: 0x8f8b80, roughness: 1 });
const towers = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.1, 3.5, T.hub, 14).translate(0, T.hub / 2, 0), white, N); towers.castShadow = true;
const nacGeo = new THREE.CapsuleGeometry(2.6, 10.5, 6, 16).rotateX(Math.PI / 2).translate(0, .3, -2.2), nacelles = new THREE.InstancedMesh(nacGeo, white, N); nacelles.castShadow = true;
const hubs = new THREE.InstancedMesh(new THREE.SphereGeometry(2.9, 18, 12).scale(1, 1, 1.7).translate(0, 0, 6.6), white, N);
function bladeGeometry(L) {            // сечения от комля к законцовке: хорда, толщина и крутка
  const NS = 22, NC = 10, pos = [], idx = [];
  for (let k = 0; k <= NS; k++) { const r = k / NS, y = 2 + r * L, q = Math.max(0, (r - .22) / .78);
    const chord = r < .04 ? 2.6 : r < .22 ? 2.6 + 2.1 * (r - .04) / .18 : 4.7 - 4.0 * Math.pow(q, .85), thick = r < .04 ? 2.6 : r < .22 ? 2.6 - 1.4 * (r - .04) / .18 : 1.2 * Math.pow(1 - q, 1.3) + .12, tw = (16 * (1 - r) * (1 - r) - 2) * RAD;
    for (let c = 0; c < NC; c++) { const a = c / NC * Math.PI * 2, ex = Math.cos(a) * chord / 2 - (r > .04 ? chord * .15 : 0), ez = Math.sin(a) * thick / 2; pos.push(ex * Math.cos(tw) - ez * Math.sin(tw), y, ex * Math.sin(tw) + ez * Math.cos(tw) + 7.4); } }
  for (let k = 0; k < NS; k++) for (let c = 0; c < NC; c++) { const a = k * NC + c, b = k * NC + (c + 1) % NC; idx.push(a, a + NC, b, b, a + NC, b + NC); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; }
const bladeMat = white.clone(); bladeMat.side = THREE.DoubleSide;
const blades = new THREE.InstancedMesh(bladeGeometry(T.D / 2 - 2), bladeMat, N * 3); blades.castShadow = true;
const founds = new THREE.InstancedMesh(new THREE.CylinderGeometry(11.5, 12.5, 1.2, 24), concrete, N); founds.receiveShadow = true;
const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(70, .5, 42), new THREE.MeshStandardMaterial({ color: 0xa79a80, roughness: 1 }), N); pads.receiveShadow = true;
const pickMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(55, 55, T.hub + 95, 8).translate(0, (T.hub + 95) / 2, 0), white, N); pickMesh.visible = false;
const cranes = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 150, 3).translate(0, 75, 0), new THREE.MeshStandardMaterial({ color: 0xf5b544, roughness: .6 }), 4);
const dotGeo = new THREE.BufferGeometry(), dotPos = new Float32Array(N * 3), dotCol = new Float32Array(N * 3); dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3)); dotGeo.setAttribute('color', new THREE.BufferAttribute(dotCol, 3));
const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#05070b'; g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 22, 0, 7); g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();   // круглая метка с тёмной обводкой
const dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ size: PHONE ? 10 : 13, sizeAttenuation: false, vertexColors: true, toneMapped: false, depthTest: false, map: dotTex, alphaTest: .5 })); dots.renderOrder = 4; dots.frustumCulled = false;
scene.add(towers, nacelles, hubs, blades, founds, pads, pickMesh, cranes, dots);
const baseY = new Float32Array(N), padDir = new Float32Array(N), rot = new Float32Array(N), towerK = new Float32Array(N).fill(1), nacOn = new Uint8Array(N).fill(1), bladeN = new Uint8Array(N).fill(3), foundK = new Float32Array(N).fill(1), padOn = new Uint8Array(N).fill(1);
{ const pts = []; SITE.roads.forEach(f => { for (let i = 0; i < f.length; i += 2) pts.push([f[i], f[i + 1]]); });   // площадка стоит со стороны ближайшей дороги
  for (let i = 0; i < N; i++) { let bd = 1e9, b = null; for (const p of pts) { const d = (p[0] - W.X[i]) ** 2 + (p[1] - W.Z[i]) ** 2; if (d < bd && d > 400) { bd = d; b = p; } } padDir[i] = Math.atan2(b[0] - W.X[i], b[1] - W.Z[i]); rot[i] = R() * 6.28; } }
const dm = new THREE.Object3D(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0), qY = new THREE.Quaternion(), qS = new THREE.Quaternion(), AX_Y = new THREE.Vector3(0, 1, 0), AX_Z = new THREE.Vector3(0, 0, 1);
let yaw = 0, ssY = 0, xrI = -1;
function poseStatic() {
  for (let i = 0; i < N; i++) { const x = W.X[i], z = W.Z[i], y = baseY[i];
    dm.rotation.set(0, 0, 0); dm.scale.set(1, Math.max(towerK[i], 0), 1); dm.position.set(x, y, z); dm.updateMatrix(); towerK[i] > 0 ? towers.setMatrixAt(i, dm.matrix) : towers.setMatrixAt(i, ZERO); pickMesh.setMatrixAt(i, dm.matrix.clone().scale(new THREE.Vector3(1, 1 / Math.max(towerK[i], 1e-3), 1)));
    dm.scale.set(1, 1, 1); dm.position.set(x, y + .2, z); dm.updateMatrix(); foundK[i] > 0 ? founds.setMatrixAt(i, dm.matrix) : founds.setMatrixAt(i, ZERO);
    dm.rotation.set(0, padDir[i], 0); dm.position.set(x + Math.sin(padDir[i]) * 48, y + .15, z + Math.cos(padDir[i]) * 48); dm.updateMatrix(); padOn[i] ? pads.setMatrixAt(i, dm.matrix) : pads.setMatrixAt(i, ZERO);
    dotPos[i * 3] = x; dotPos[i * 3 + 1] = y + (nacOn[i] ? T.hub + 8 : 14 + towerK[i] * T.hub); dotPos[i * 3 + 2] = z; }
  towers.instanceMatrix.needsUpdate = founds.instanceMatrix.needsUpdate = pads.instanceMatrix.needsUpdate = pickMesh.instanceMatrix.needsUpdate = true; dotGeo.attributes.position.needsUpdate = true; pickMesh.computeBoundingSphere();
}
function poseRotors(dt) {
  qY.setFromAxisAngle(AX_Y, yaw);
  for (let i = 0; i < N; i++) {
    if (i === xrI) { nacelles.setMatrixAt(i, ZERO); } 
    if (!nacOn[i]) { nacelles.setMatrixAt(i, ZERO); hubs.setMatrixAt(i, ZERO); for (let k = 0; k < 3; k++) blades.setMatrixAt(i * 3 + k, ZERO); continue; }
    dm.position.set(W.X[i], baseY[i] + T.hub + 1.5, W.Z[i]); dm.quaternion.copy(qY); dm.scale.set(1, 1, 1); dm.updateMatrix(); if (i !== xrI) nacelles.setMatrixAt(i, dm.matrix); hubs.setMatrixAt(i, dm.matrix);
    rot[i] += rpm[i] * 0.10472 * dt;
    for (let k = 0; k < 3; k++) { if (k >= bladeN[i]) { blades.setMatrixAt(i * 3 + k, ZERO); continue; } qS.setFromAxisAngle(AX_Z, rot[i] + k * 2.0944); dm.quaternion.copy(qY).multiply(qS); dm.updateMatrix(); blades.setMatrixAt(i * 3 + k, dm.matrix); }
  }
  dm.quaternion.identity(); nacelles.instanceMatrix.needsUpdate = hubs.instanceMatrix.needsUpdate = blades.instanceMatrix.needsUpdate = true;
}

/* объекты, зависящие от рельефа: дороги, траншеи, зоны, подстанция, ВЛ */
const dyn = new THREE.Group(); scene.add(dyn); let trenchG, zoneG, feederG, labelsSS = null, ohlG;
const TR_COL = { B1: 0x39e75f, B2: 0xff5a4a, B3: 0x4d8dff, B4: 0xff9b2e }, TR_NAME = { B1: 'одна цепь', B2: 'две цепи', B3: 'три цепи', B4: 'четыре цепи' };
const feederCol = f => new THREE.Color().setHSL((f * 0.618) % 1, .7, .58);
function box(w, h, d, mat, x, y, z, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }
function layout() {
  dyn.clear(); for (let i = 0; i < N; i++) baseY[i] = ground(W.X[i], W.Z[i]);
  if (SITE.access) dyn.add(ribbonOf(SITE.access, 3, 0.7, new THREE.MeshStandardMaterial({ color: 0xd6ccb6, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));
  dyn.add(ribbonOf(SITE.roads, 9, 0.6, new THREE.MeshStandardMaterial({ color: 0xc9bea6, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));
  trenchG = new THREE.Group(); for (const k of ['B1', 'B2', 'B3', 'B4']) trenchG.add(lineOf(SITE.trench[k], 60, 2.5, new THREE.LineBasicMaterial({ color: TR_COL[k], toneMapped: false }))); dyn.add(trenchG);
  zoneG = new THREE.Group(); const ZC = { arch: 0xc77dff, bio: 0x4ade80, anthrax: 0xff5a4a }; for (const kind of ['arch', 'bio', 'anthrax']) zoneG.add(lineOf(SITE.zones.filter(q => q[0] === kind).map(q => q.slice(1)), 80, 6, new THREE.LineBasicMaterial({ color: ZC[kind], toneMapped: false }))); dyn.add(zoneG);
  feederG = new THREE.Group(); { const seg = [], col = []; W.feeders.forEach((m, f) => { const c = feederCol(f); for (let k = 0; k < m.length; k++) { const a = m[k], bx = k + 1 < m.length ? W.X[m[k + 1]] : SITE.ss[0], bz = k + 1 < m.length ? W.Z[m[k + 1]] : SITE.ss[1];
        seg.push(W.X[a], baseY[a] + T.hub + 8, W.Z[a], bx, ground(bx, bz) + (k + 1 < m.length ? T.hub + 8 : 30), bz); col.push(c.r, c.g, c.b, c.r, c.g, c.b); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); feederG.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: .9 }))); } dyn.add(feederG);
  // подстанция 220/35 кВ по ведомости HV-AIS и площадка СНЭ по чертежу 104218-EL-DW-100; взаимное расположение условное
  const sx = SITE.ss[0], sz = SITE.ss[1]; let sy = -1e9; for (const [ax, az] of [[-175, -120], [580, -120], [580, 120], [-175, 120], [200, 0]]) sy = Math.max(sy, ground(sx + ax, sz + az)); const ss = new THREE.Group(); ss.position.set(sx, sy, sz); dyn.add(ss);
  box(776, 60, 256, concrete, 201, -59.4, 0, ss);
  for (let k = 0; k < 14; k++) { const x = -130 + k * 20; for (const z of [-106, -80, -54]) { box(.8, 15, .8, grey, x - 7, 0, z, ss); box(.8, 15, .8, grey, x + 7, 0, z, ss); box(15, .8, .8, grey, x, 14.5, z, ss); } box(1.6, 5.5, 1.6, dark, x, 0, -93, ss); box(1, 4.5, 1, grey, x, 0, -67, ss); }
  for (const z of [-99, -86, -73]) box(276, .5, .5, grey, 0, 10, z, ss);
  for (let k = 0; k < 6; k++) { const x = -115 + k * 46; box(12, 8.5, 7.5, dark, x, 0, -30, ss); box(15, 6, 2.6, grey, x, 1, -37, ss); box(15, 6, 2.6, grey, x, 1, -23, ss); for (const o of [-3.5, 0, 3.5]) box(.8, 5, .8, white, x + o, 8.5, -30, ss); if (k < 5) box(.8, 10, 17, concrete, x + 23, 0, -30, ss);
    box(34, 6.5, 13, white, x, 0, 2, ss); box(35, .5, 14, dark, x, 6.5, 2, ss); }
  { const sv = new THREE.InstancedMesh(new THREE.BoxGeometry(12.2, 2.9, 2.6), white, 20), co = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.6, 1.6, 3.4, 14), grey, 20); sv.castShadow = true;
    for (let k = 0; k < 20; k++) { dm.rotation.set(0, 0, 0); dm.scale.set(1, 1, 1); dm.position.set(-125 + (k % 10) * 27, 2, 32 + Math.floor(k / 10) * 24); dm.updateMatrix(); sv.setMatrixAt(k, dm.matrix); dm.position.x += 9.5; dm.position.y = 2.2; dm.updateMatrix(); co.setMatrixAt(k, dm.matrix); } ss.add(sv, co); }
  box(38, 8, 16, white, -140, 0, 96, ss); box(39, .5, 17, dark, -140, 8, 96, ss); box(46, 9, 22, new THREE.MeshStandardMaterial({ color: 0x8fa0b3, roughness: .6, metalness: .4 }), -82, 0, 93, ss);
  const BX = 190, asphalt = new THREE.MeshStandardMaterial({ color: 0x5a5d61, roughness: 1 });
  for (const z of [-66, 0, 66]) box(372, .25, 6, asphalt, BX + 187.8, .05, z, ss); for (const x of [6, 143.7, 281.4, 369.6]) box(6, .25, 138, asphalt, BX + x, .05, 0, ss);
  { const NE = W.BESS.encl, NS = W.BESS.mvs, en = new THREE.InstancedMesh(new THREE.BoxGeometry(6.06, 2.9, 2.44), white, NE), sk = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 2.6, 2.4), dark, NS); en.castShadow = sk.castShadow = true; let ne = 0, ns = 0; dm.rotation.set(0, 0, 0); dm.scale.set(1, 1, 1);
    for (const zc of [-33, 33]) for (const x0 of [9, 146.71]) for (let c = 0; c < 9; c++) { const x = BX + x0 + 10.3 + c * 13.63;
        for (const dz of [-22, -9, 9, 22]) if (ne < NE) { dm.position.set(x, 1.9, zc + dz); dm.updateMatrix(); en.setMatrixAt(ne++, dm.matrix); }
        for (const dz of [-15.5, 15.5]) if (ns < NS) { dm.position.set(x, 1.75, zc + dz); dm.updateMatrix(); sk.setMatrixAt(ns++, dm.matrix); } }
    ss.add(en, sk);
    const seg = [], rect = (x0, z0, x1, z1, y) => seg.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
    for (const zc of [-33, 33]) for (const h of [0, 1]) rect(BX + 284.4 + h * 42, zc - 27, BX + 284.4 + h * 42 + 40, zc + 27, .6);     // четыре площадки под дозаполнение
    for (const y of [1, 2, 3]) { rect(BX - 3, -73, BX + 378.6, 73, y); rect(-172, -118, 152, 118, y); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3)); ss.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x7d8490 }))); box(6, 3, 4, white, BX + 12, 0, 80, ss); }
  // три двухцепные ВЛ 220 кВ: две на юго-восток к ПС Жамбыл, одна на запад к ПС Кентау (направления условные)
  ohlG = new THREE.Group(); dyn.add(ohlG); const tw = [], wires = [];
  [[112, -40], [112, 40], [283, 0]].forEach(([brg, off]) => { const dx = Math.sin(brg * RAD), dz = -Math.cos(brg * RAD), px = -dz * off, pz = dx * off; let prev = null;
    for (let k = 0; k < 60; k++) { const x = sx + dx * (160 + k * 380) + px, z = sz + dz * (160 + k * 380) + pz; if (x < TX0 + 300 || x > TX1 - 300 || z < TZ0 + 300 || z > TZ1 - 300) break; const y = ground(x, z); tw.push([x, y, z, brg]);
      if (prev) for (const s of [-1, 1]) for (const h of [24, 31, 38]) { const ox = -dz * s * (9 - (h - 24) * .2), oz = dx * s * (9 - (h - 24) * .2), mx = (prev[0] + x) / 2 + ox, mz = (prev[2] + z) / 2 + oz;
          wires.push(prev[0] + ox, prev[1] + h, prev[2] + oz, mx, (prev[1] + y) / 2 + h - 9, mz, mx, (prev[1] + y) / 2 + h - 9, mz, x + ox, y + h, z + oz); }
      prev = [x, y, z]; } });
  const tm = new THREE.InstancedMesh(new THREE.CylinderGeometry(.9, 4.2, 44, 4).translate(0, 22, 0), grey, tw.length), am = new THREE.InstancedMesh(new THREE.BoxGeometry(20, .8, .8), grey, tw.length * 3); tm.castShadow = true;
  tw.forEach(([x, y, z, b], i) => { dm.scale.set(1, 1, 1); dm.rotation.set(0, -b * RAD + Math.PI / 4, 0); dm.position.set(x, y, z); dm.updateMatrix(); tm.setMatrixAt(i, dm.matrix); [24, 31, 38].forEach((h, k) => { dm.rotation.set(0, -b * RAD, 0); dm.position.set(x, y + h, z); dm.scale.set(1 - k * .12, 1, 1); dm.updateMatrix(); am.setMatrixAt(i * 3 + k, dm.matrix); }); });
  dm.scale.set(1, 1, 1); ohlG.add(tm, am); { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); ohlG.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2c3138, transparent: true, opacity: .8 }))); }
  if (labels.ss) { labels.ss.p.set(sx - 10, sy + 40, sz - 30); labels.bess.p.set(sx + 378, sy + 30, sz); } ssY = sy; poseStatic(); layers();
  opsObjects();
}

/* поле ветра: частицы летят со скоростью потока в своей точке — быстрее над возвышениями, медленнее в следах ВЭУ */
const NPART = PHONE ? 700 : 2400, TL = 12, pHead = new Float32Array(NPART * 3), trail = new Float32Array(NPART * TL * 3), tcol = new Float32Array(NPART * TL * 3), pBase = new Float32Array(NPART * 3);
const flowGeo = new THREE.BufferGeometry(); flowGeo.setAttribute('position', new THREE.BufferAttribute(trail, 3)); flowGeo.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
{ const ix = []; for (let k = 0; k < NPART; k++) for (let j = 0; j < TL - 1; j++) ix.push(k * TL + j, k * TL + j + 1); flowGeo.setIndex(ix); }
const streaks = new THREE.LineSegments(flowGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); streaks.frustumCulled = false; scene.add(streaks);
const wS = new Float32Array(N), wC = new Float32Array(N), wK = new Float32Array(N); let fX = 0, fZ = 1, flowAcc = 0;
function windField() { const w = live.w; fX = -Math.sin(w.dir * RAD); fZ = Math.cos(w.dir * RAD); for (let i = 0; i < N; i++) { wS[i] = W.X[i] * fX + W.Z[i] * fZ; wC[i] = W.X[i] * fZ - W.Z[i] * fX; wK[i] = run[i] ? 1 - Math.sqrt(1 - W.ct(v[i], rho[i])) : 0; } }
function fieldAt(x, z, h) {            // отношение местной скорости к скорости набегающего потока
  const sp = x * fX + z * fZ, cp = x * fZ - z * fX; let s2 = 0;
  if (h < 230) for (let i = 0; i < N; i++) { const dx = sp - wS[i]; if (dx < 15 || dx > 7500 || wK[i] === 0) continue; const rw = T.D / 2 + T.kWake * dx, dy = cp - wC[i]; if (dy < rw && dy > -rw) { const d = wK[i] * (T.D / 2 / rw) * (T.D / 2 / rw); s2 += d * d; } }
  return W.speedUp(ground(x, z) + E0, hMean) * (1 - Math.min(.6, Math.sqrt(s2)));
}
function spawn(k, anywhere) { const along = anywhere ? Math.random() : Math.random() * .08, across = Math.random(), L = 30000;      // новые частицы входят с наветренной стороны
  let x = (across - .5) * L * fZ - (along - .5) * -L * fX, z = -(across - .5) * L * fX + (along - .5) * L * fZ; if (x < TX0 + 50 || x > TX1 - 50 || z < TZ0 + 50 || z > TZ1 - 50) { x = TX0 + 50 + Math.random() * (TX1 - TX0 - 100); z = TZ0 + 50 + Math.random() * (TZ1 - TZ0 - 100); }
  pHead[k * 3] = x; pHead[k * 3 + 1] = z; pHead[k * 3 + 2] = 35 + Math.random() * 185; const y = ground(x, z) + pHead[k * 3 + 2]; for (let j = 0; j < TL; j++) { trail[(k * TL + j) * 3] = x; trail[(k * TL + j) * 3 + 1] = y; trail[(k * TL + j) * 3 + 2] = z; } }
for (let k = 0; k < NPART; k++) spawn(k, true);
function flow(dt) { const w = live.w; if (!w || !streaks.visible) return; flowAcc += dt; const shift = flowAcc > .16; if (shift) flowAcc = 0; const gain = S.mode === 'wake' ? 1 : .55;
  for (let k = 0; k < NPART; k++) { let x = pHead[k * 3], z = pHead[k * 3 + 1]; const h = pHead[k * 3 + 2], r = fieldAt(x, z, h), u = w.v * r * 20 * dt;
    x += fX * u; z += fZ * u; if (x < TX0 || x > TX1 || z < TZ0 || z > TZ1) { spawn(k, false); continue; } pHead[k * 3] = x; pHead[k * 3 + 1] = z; const o = k * TL * 3;
    if (shift) { trail.copyWithin(o + 3, o, o + (TL - 1) * 3); const c = r < .93 ? [1, .5, .16] : r > 1.035 ? [.45, .95, 1] : [.8, .88, 1]; pBase[k * 3] = c[0]; pBase[k * 3 + 1] = c[1]; pBase[k * 3 + 2] = c[2];
      for (let j = 0; j < TL; j++) { const a = Math.pow(1 - j / (TL - 1), 1.6) * gain * (r < .93 ? 1.25 : .75); tcol[o + j * 3] = pBase[k * 3] * a; tcol[o + j * 3 + 1] = pBase[k * 3 + 1] * a; tcol[o + j * 3 + 2] = pBase[k * 3 + 2] * a; } }
    trail[o] = x; trail[o + 1] = ground(x, z) + h; trail[o + 2] = z; }
  flowGeo.attributes.position.needsUpdate = true; if (shift) flowGeo.attributes.color.needsUpdate = true; }
// следы за роторами: полупрозрачные клинья по ширине модели Йенсена
const plumeGeo = new THREE.BufferGeometry(); plumeGeo.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, 1.4, 0, 1, -1.4, 0, 1], 3)); plumeGeo.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], 3)); plumeGeo.setIndex([0, 2, 1, 0, 3, 2]);
const plumes = new THREE.InstancedMesh(plumeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), N); plumes.frustumCulled = false; plumes.visible = false; scene.add(plumes);
function posePlumes() { const c = new THREE.Color(); for (let i = 0; i < N; i++) { if (wK[i] === 0) { plumes.setMatrixAt(i, ZERO); continue; } dm.position.set(W.X[i], baseY[i] + T.hub, W.Z[i]); dm.rotation.set(0, Math.atan2(fX, fZ), 0); dm.scale.set(T.D, 1, 12 * T.D); dm.updateMatrix(); plumes.setMatrixAt(i, dm.matrix); const a = wK[i] / .55; plumes.setColorAt(i, c.setRGB(.55 * a, .8 * a, 1 * a)); }
  dm.scale.set(1, 1, 1); dm.rotation.set(0, 0, 0); plumes.instanceMatrix.needsUpdate = true; if (plumes.instanceColor) plumes.instanceColor.needsUpdate = true; }

/* вид внутрь гондолы выбранной ВЭУ: вал, подшипник, редуктор, генератор, преобразователь, трансформатор */
const xr = new THREE.Group(); xr.visible = false; scene.add(xr); const xrParts = {};
{ xr.add(new THREE.Mesh(nacGeo, new THREE.MeshPhysicalMaterial({ color: 0xbfe0ff, transparent: true, opacity: .16, roughness: .15, metalness: 0, depthWrite: false })));
  const part = (id, geo, x, y, z) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x62d6a0, roughness: .5, metalness: .4, emissive: 0x000000 })); m.position.set(x, y, z); xr.add(m); xrParts[id] = m; };
  part('shaft', new THREE.CylinderGeometry(.5, .5, 5.2, 14).rotateX(Math.PI / 2), 0, .2, 3.2); part('bear', new THREE.CylinderGeometry(1.15, 1.15, .9, 20).rotateX(Math.PI / 2), 0, .2, 4.4);
  part('gear', new THREE.BoxGeometry(3, 3, 3.2), 0, .2, .2); part('gen', new THREE.CylinderGeometry(1.4, 1.4, 3.1, 20).rotateX(Math.PI / 2), 0, .2, -3.3);
  part('conv', new THREE.BoxGeometry(1.4, 2.4, 2.2), -1.25, 0, -6.4); part('trf', new THREE.BoxGeometry(1.6, 2.2, 2.2), 1.2, 0, -6.4); part('yaw', new THREE.CylinderGeometry(2.3, 2.3, .5, 24), 0, -2.3, 0); }
const XR_TAG = [['bear', 'Главный подшипник', [0, 3.6, 4.4]], ['gear', 'Редуктор', [0, 4.6, .2]], ['gen', 'Генератор', [0, 3.6, -3.3]], ['conv', 'Преобразователь', [0, 3.2, -6.6]]];
function temps(i) { const ld = pw[i] / T.rated, a = live.w.temp, ft = st[i] === 3 ? (faultText[i] || '') : '';
  return { bear: a + 18 + 30 * ld + (/подшипник/.test(ft) ? 52 : 0), gear: a + 25 + 35 * ld, gen: a + 20 + 55 * ld + (/подшипник/.test(ft) ? 20 : 0), conv: a + 15 + 28 * ld + (/преобразовател/.test(ft) ? 48 : 0), trf: a + 22 + 40 * ld, shaft: a + 8 + 10 * ld, yaw: a + 5, ...(dg => dg && dg.key ? { [dg.key]: dg.cur } : {})(diagOf.get(i)) }; }
function poseXray() { Object.keys(labels).filter(k => k[0] === 'x').forEach(k => { labels[k].el.remove(); delete labels[k]; });
  const on = S.stage === 'ops' && S.sel && S.sel.level === 'wtg'; xrI = on ? S.sel.i : -1; xr.visible = on; if (!on) return; const i = xrI, t = temps(i);
  xr.position.set(W.X[i], baseY[i] + T.hub + 1.5, W.Z[i]); xr.rotation.set(0, yaw, 0); xr.updateMatrixWorld(true);
  for (const k in xrParts) { const c = R_wake((t[k] - 25) / 85); xrParts[k].material.color.setRGB(c[0], c[1], c[2]); xrParts[k].material.emissive.setRGB(c[0] * .25, c[1] * .25, c[2] * .25); }
  XR_TAG.forEach(([k, name, off], n) => { addLabel('x' + n, xr.localToWorld(new THREE.Vector3(...off)), `<b>${name}</b><span>${fmt(t[k])} °C</span>`, t[k] > 95 ? 'alert' : '', null, null); labels['x' + n].near = 220; }); }

/* ═════════ раскраска и слои ═════════ */
const ramp = stops => t => { t = Math.max(0, Math.min(1, t)) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i, a = stops[i], b = stops[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; };
const hex = h => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255], RP = [0x25324d, 0x8a5a1c, 0xf5b544, 0xfff4cf].map(hex), RW = [0x62d6a0, 0xf5b544, 0xf0784a, 0xe5352f].map(hex), R_power = ramp(RP), R_wake = ramp(RW), RF = [0x62d6a0, 0xf5b544, 0xe5352f].map(hex), R_pf = ramp(RF);
const ST_COL = { 0: 0xffffff, 1: 0x8d95a8, 2: 0xb38cff, 3: 0xff5a4a, 4: 0x5b9bea, 5: 0xf5b544, 6: 0xff5a4a, 9: 0x4a443a }, ST_NAME = { 0: 'Работает', 1: 'Ждёт ветра', 2: 'Остановлена: буря', 3: 'Авария', 4: 'Обслуживание', 5: 'Ограничена', 6: 'Отключён фидер', 9: 'Не построена' };
const STAGE_COL = [0x4a443a, 0xa58a5e, 0xc9bea6, 0xb9c2cf, 0xf5b544, 0x5b9bea, 0x7fd4ff, 0x62d6a0];
function paintDots() {
  for (let i = 0; i < N; i++) { let c;
    if (S.stage === 'build') { const b = bState[i]; c = hex(S.bmode === 'stat' ? STAGE_COL[b.stage] : S.bmode === 'pf' ? (b.late > 45 ? 0xe5352f : b.late > 14 ? 0xf0784a : b.late > 0 ? 0xf5b544 : b.due && b.stage > 0 ? 0x62d6a0 : 0x4a443a) : (qcOpen.has(i) ? (qcOpen.get(i).sev === 'bad' ? 0xe5352f : 0xf5b544) : 0x4a443a)); }
    else if (S.mode === 'power') c = R_power(pw[i] / T.rated); else if (S.mode === 'wake') c = R_wake(def[i] / 0.22); else if (S.mode === 'elec') { const k = feederCol(W.feeder[i]); c = [k.r, k.g, k.b]; } else if (S.mode === 'pf') c = eExp[i] < 50 ? hex(0x6b7486) : R_pf(1 - (eAct[i] / eExp[i] - .85) / .14); else if (S.mode === 'diag') c = hex(diagOf.has(i) ? 0xf5b544 : 0x5d6677); else c = hex(ST_COL[st[i]]);
    if (S.sel && S.stage !== 'cost') { const on = S.sel.level === 'wtg' ? S.sel.i === i : S.sel.level === 'feeder' ? W.feeder[i] === S.sel.f : true; if (!on) c = c.map(x => x * .35); else if (S.sel.level === 'wtg' || S.sel.level === 'feeder') c = c.map(x => Math.min(1, x * 1.25 + .15)); }
    dotCol.set(c, i * 3); }
  dotGeo.attributes.color.needsUpdate = true;
}
function layers() { if (!trenchG) return; const o = S.stage === 'ops'; trenchG.visible = o && S.mode === 'elec'; feederG.visible = o && S.mode === 'elec'; zoneG.visible = o && S.mode === 'zones'; streaks.visible = S.stage !== 'build' && (S.mode === 'wake' || S.mode === 'real' || S.mode === 'power') && !reduceMotion; plumes.visible = o && S.mode === 'wake'; sldEl.style.display = o && S.mode === 'sld' ? '' : 'none'; if (o && S.mode === 'sld') renderSLD(); cranes.visible = S.stage === 'build'; if (diagG) diagG.visible = o; if (metG) metG.visible = o; }

/* ═════════ мелкая графика ═════════ */
function spark(vals, upto, dots) { const w = 150, h = 38, n = vals.length, mx = Math.max(...vals, 1e-6), pts = vals.map((x, i) => [+(i / (n - 1) * w).toFixed(1), +(h - 3 - x / mx * (h - 8)).toFixed(1)]), cut = Math.max(1, Math.min(n - 1, Math.round(upto * (n - 1)))), line = pts.slice(0, cut + 1).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}"><polyline points="${pts.join(' ')}" fill="none" stroke="rgba(255,255,255,.22)" ${dots ? 'stroke-width="1.6" stroke-dasharray="0.1 4" stroke-linecap="round"' : 'stroke-width="1"'}/><polygon points="0,${h} ${line} ${pts[cut][0]},${h}" fill="url(#gA)"/><polyline points="${line}" fill="none" stroke="#f5b544" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${pts[cut][0]}" cy="${pts[cut][1]}" r="2.8" fill="#fff"/></svg>`; }
function gauge(p, text, sub) { p = Math.max(0, Math.min(100, p)); return `<svg class="gauge" viewBox="0 0 100 64"><path d="M10 54A40 40 0 0 1 90 54" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="7" stroke-linecap="round"/><path d="M10 54A40 40 0 0 1 90 54" fill="none" stroke="#f5b544" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="${p} 100"/><text x="50" y="49" text-anchor="middle" class="gt">${text}</text>${sub ? `<text x="50" y="61" text-anchor="middle" class="gs">${sub}</text>` : ''}</svg>`; }
function ring(parts, center, sub) { const tot = parts.reduce((s, p) => s + p[1], 0) || 1; let off = 0; const arcs = parts.map(p => { const len = p[1] / tot * 100, a = `<circle cx="50" cy="50" r="40" fill="none" stroke="${p[2]}" stroke-width="9" pathLength="100" stroke-dasharray="${Math.max(0, len - 1.2)} ${100 - Math.max(0, len - 1.2)}" stroke-dashoffset="${-off}" stroke-linecap="round"/>`; off += len; return a; }).join('');
  return `<div class="ring"><div class="c"><svg viewBox="0 0 100 100" style="transform:rotate(-90deg);display:block"><circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="9"/>${arcs}</svg><b>${center}</b>${sub ? `<small>${sub}</small>` : ''}</div><ul>${parts.map(p => `<li><span><i style="background:${p[2]}"></i>${p[0]}</span><b>${fmt(p[1] / tot * 100, 1)} %</b></li>`).join('')}</ul></div>`; }
function rose(dir) { const mx = Math.max(...W.ROSE.map(r => r[1])), bars = W.ROSE.map(([d, f]) => { const r0 = 12, r1 = 12 + f / mx * 62, a0 = (d - 12) * RAD, a1 = (d + 12) * RAD, P = (r, a) => `${(100 + r * Math.sin(a)).toFixed(1)},${(100 - r * Math.cos(a)).toFixed(1)}`;
    return `<path d="M${P(r0, a0)}L${P(r1, a0)}A${r1} ${r1} 0 0 1 ${P(r1, a1)}L${P(r0, a1)}Z" fill="#f5b544" fill-opacity="${.35 + .65 * f / mx}"/>`; }).join('');
  return `<svg class="rose" viewBox="0 0 200 200"><circle cx="100" cy="100" r="74" fill="none" stroke="rgba(255,255,255,.12)"/><circle cx="100" cy="100" r="43" fill="none" stroke="rgba(255,255,255,.08)"/>${bars}${['С', 'В', 'Ю', 'З'].map((t, k) => `<text x="${100 + 88 * Math.sin(k * 90 * RAD)}" y="${104 - 88 * Math.cos(k * 90 * RAD)}" text-anchor="middle" style="font:10px var(--body);fill:var(--muted)">${t}</text>`).join('')}${dir != null ? `<line x1="100" y1="100" x2="${100 + 80 * Math.sin(dir * RAD)}" y2="${100 - 80 * Math.cos(dir * RAD)}" stroke="#fff" stroke-width="1.5"/>` : ''}</svg>`; }
const pwf = kw => kw < 1000 ? fmt(kw) + ' кВт' : fmt(kw / 1000, kw < 1e5 ? 2 : 1) + ' МВт';

/* ═════════ эксплуатация ═════════ */
function events() {
  const ev = [];
  tripped.forEach((t, f) => { if (t) ev.push({ sev: 'bad', key: 'feeder:' + f, title: `Фидер ${f + 1} отключён`, sub: 'Сработала защита от замыкания на землю, 33 кВ', sel: { level: 'feeder', f }, loss: W.feeders[f].reduce((s, i) => s + pExp[i], 0), fix: () => tripped[f] = 0 }); });
  for (let i = 0; i < N; i++) if (fault[i] && !tripped[W.feeder[i]]) ev.push({ sev: fault[i] === 3 ? 'bad' : 'warn', key: 'wtg:' + i, title: `${wName(i)}: ${fault[i] === 3 ? 'авария' : fault[i] === 4 ? 'обслуживание' : 'ограничение'}`, sub: faultText[i], sel: { level: 'wtg', i }, loss: Math.max(0, pExp[i] - pw[i]), fix: () => { fault[i] = 0; derate[i] = 1; } });
  return ev.sort((a, b) => b.loss - a.loss);
}
const WO = ['Допуск', 'Диагностика', 'Ремонт', 'Проверка']; let evCache = [];
/* частота сети и отклик накопителя, шаг 1 с: первичное регулирование по статизму 2 % с мёртвой зоной ±20 мГц
   и вторичное — отработка команды центрального регулятора в диапазоне ±100 МВт. Сигнал частоты смоделирован. */
const AGC = { f: 50, cmd: 0, act: 0, prim: 0, acc: 0, ev: 25, err: 0, hf: new Float32Array(180).fill(50), hc: new Float32Array(180), ha: new Float32Array(180) };
function agcStep() {
  const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15; AGC.ev -= 1;
  if (AGC.ev <= 0) { AGC.f -= (Math.random() < .7 ? 1 : -1) * (0.07 + Math.random() * 0.1); AGC.ev = 45 + Math.random() * 70; }
  AGC.f += -(AGC.f - 50) * 0.06 + g() * 0.006; const df = AGC.f - 50, on = S.strat === 'agc' && S.stage === 'ops';
  AGC.prim = Math.abs(df) > 0.02 ? -(df - Math.sign(df) * 0.02) * W.BESS.mw / (0.02 * 50) : 0;
  AGC.cmd = Math.max(-100, Math.min(100, AGC.cmd * 0.985 - df * 14));
  const target = on ? Math.max(-W.BESS.mw, Math.min(W.BESS.mw, AGC.prim + AGC.cmd)) : 0; AGC.act += (target - AGC.act) * 0.75; AGC.err = AGC.err * .95 + Math.abs(target - AGC.act) * .05;
  for (const [h, x] of [[AGC.hf, AGC.f], [AGC.hc, on ? target : AGC.prim + AGC.cmd], [AGC.ha, AGC.act]]) { h.copyWithin(0, 1); h[h.length - 1] = x; }
}
function renderAgc() { const el = $('#agc'); if (!el) return; const on = S.strat === 'agc', n = AGC.hf.length, X = i => (i / (n - 1) * 300).toFixed(1);
  const line = (h, lo, hi, y0, y1) => Array.from(h, (x, i) => `${X(i)},${(y1 - (Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo) * (y1 - y0)).toFixed(1)}`).join(' ');
  $('#agc-pill').className = 'pill ' + (on ? '' : 'off'); $('#agc-pill').lastElementChild.textContent = on ? 'СНЭ в регулировании' : 'СНЭ не участвует';
  el.innerHTML = `<svg viewBox="0 0 300 96" style="display:block;width:100%;height:auto"><line x1="0" x2="300" y1="20" y2="20" stroke="rgba(255,255,255,.14)" stroke-dasharray="2 4"/><line x1="0" x2="300" y1="68" y2="68" stroke="rgba(255,255,255,.14)" stroke-dasharray="2 4"/>
    <polyline points="${line(AGC.hf, 49.8, 50.2, 2, 38)}" fill="none" stroke="#7fd4ff" stroke-width="1.4"/><polyline points="${line(AGC.hc, -160, 160, 44, 92)}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.2" stroke-dasharray="3 3"/><polyline points="${line(AGC.ha, -160, 160, 44, 92)}" fill="none" stroke="#f5b544" stroke-width="1.6"/></svg>
    <dl class="kv" style="margin-top:8px"><dt>Частота</dt><dd class="${Math.abs(AGC.f - 50) > .1 ? 'bad' : ''}">${fmt(AGC.f, 3)} Гц</dd><dt>${on ? 'Задание накопителю' : 'Требуется от регулирования'}</dt><dd>${(x => (x > 0 ? '+' : '−') + fmt(Math.abs(x)))(AGC.hc[n - 1])} МВт</dd><dt>Отработано</dt><dd>${(x => (x > 0 ? '+' : '−') + fmt(Math.abs(x)))(AGC.act)} МВт</dd></dl>
    <p class="note">${on ? 'Плюс — выдача в сеть при просадке частоты, минус — заряд. Синяя линия — частота, пунктир — задание, жёлтая — отклик за последние три минуты.' : 'Чтобы накопитель отрабатывал отклонения частоты, выберите в сценарии режим «АРЧМ».'}</p>`; }
function createOrder(key) { const e = evCache.find(x => x.key === key); if (!e || S.orders.find(o => o.key === key)) return; S.orders.push({ key, n: 4101 + S.orders.length + S.fixed, crew: (S.orders.length + S.fixed) % 4 + 1, step: 0, fix: e.fix }); refresh(); }
function advanceOrder(key) { const o = S.orders.find(x => x.key === key); if (!o) return; if (++o.step >= 4) { o.fix(); S.orders = S.orders.filter(x => x !== o); S.fixed++; if (S.sel && selKey(S.sel) === key) S.sel = null; buildCurve(); } refresh(); }
const selKey = s => s.level + ':' + (s.i ?? s.f ?? '');
function renderOps() {
  renderWx();
  const L = live, k = Math.min(curve.length - 1, Math.round(S.min / 10)), u = S.min / 1440, grid = curve[k], nRun = st.filter(x => x === 0 || x === 5).length;
  $('#clock').textContent = hhmm(S.min);
  $('#r-tiles').innerHTML = `
    <div class="tile"><label>В сеть 220 кВ</label><div class="v">${fmt(grid, grid < 100 ? 1 : 0)}<small>МВт</small></div><div class="s">${fmt(grid / 10)} % от 1000 МВт</div><div class="viz">${spark(curve, u)}</div></div>
    <div class="tile"><label>За день</label><div class="v">${fmt(energyUntil(S.min) / 1000, 2)}<small>ГВт·ч</small></div><div class="s">к полуночи ${fmt(eDay / 1000, 2)}</div><div class="viz">${spark(curve.map((x, i) => energyUntil(i * 10)), u)}</div></div>
    <div class="tile"><label>Ветер на оси</label><div class="v">${fmt(L.w.v, 1)}<small>м/с</small></div><div class="s">${compass(L.w.dir)}, ${fmt(L.w.dir)}°</div><div class="viz">${spark(windC, u, true)}</div></div>
    <div class="tile"><label>В работе</label>${gauge(nRun / N * 100, String(nRun), 'из ' + N + ' ВЭУ')}</div>`;
  $('#f-a').textContent = fmt(W.density(hMean + T.hub, L.w.temp), 3) + ' кг/м³'; $('#f-b').textContent = L.free > 1 ? fmt((1 - L.waked / L.free) * 100, 1) + ' %' : '—'; $('#f-c').textContent = curt[k] > 0.5 ? fmt(curt[k]) + ' МВт' : 'нет';
  const pill = $('#st-pill'); pill.className = 'pill ' + (L.w.v >= T.cutOut ? 'bad' : L.act > 1 ? '' : 'off'); pill.lastElementChild.textContent = L.w.v >= T.cutOut ? 'Буря' : L.act > 1 ? 'В работе' : 'Штиль';
  const nt = NETS[S.net][1], o = W.ohl(Math.max(0, grid * 1000), nt.line ?? -1), tmax = Math.max(...L.trLoad);
  $('#ss-rows').innerHTML = `<button class="row w" data-ss="1"><span class="n">Трансформаторы ВЭС</span><span class="p">до ${fmt(tmax * 100)} <small>%</small></span><span class="quad">${L.trLoad.map((l, i) => `<span>Т${i + 1}${i === nt.tr ? ' откл.' : ' ' + fmt(l * 100) + ' %'}<span class="bar"><i style="width:${Math.min(100, l * 100)}%;${l > 1 ? 'background:var(--bad)' : ''}"></i></span></span>`).join('')}</span></button>` +
    o.lines.map(l => `<div class="row"><span class="n">${l.name.replace('ВЛ 220 кВ ', '')}</span><span class="t">${l.km} км</span><span class="p">${l.out ? '<small>отключена</small>' : fmt(l.mw) + ' <small>МВт</small>'}</span><span class="bar"><i style="width:${Math.min(100, l.mw / 6)}%"></i></span></div>`).join('') +
    `<button class="row" data-bess="1"><span class="n">Накопитель</span><span class="t">${bess[k] > 1 ? 'заряд' : bess[k] < -1 ? 'выдача' : 'ждёт'}</span><span class="p">${fmt(Math.abs(bess[k]))} <small>МВт</small></span><span class="bar"><i style="width:${soc[k] * 100}%"></i></span></button>`;
  evCache = events(); $('#ev-pill').lastElementChild.textContent = evCache.length;
  $('#ev-rows').innerHTML = (evCache.length ? evCache.map(e => { const od = S.orders.find(x => x.key === e.key);
    return `<div class="ev ${e.sev}" data-ev="${e.key}"><i class="dot"></i><b>${e.title}</b><em>${e.loss > 1 ? '−' + pwf(e.loss) : ''}</em><span>${e.sub}</span>${od ? `<div class="wo"><small>Наряд ${od.n}, бригада ${od.crew}</small><div class="segs">${WO.map((_, i) => `<i class="${i < od.step ? 'on' : ''}"></i>`).join('')}</div><button class="mini go" data-adv="${e.key}">${WO[od.step]} ✓</button></div>` : `<div class="wo"><small></small><button class="mini" data-new="${e.key}">Создать наряд</button></div>`}</div>`; }).join('') : `<p class="empty">Все ветроустановки и фидеры в работе.</p>`) + (S.fixed ? `<p class="empty" style="margin-top:4px">Устранено за сессию: ${S.fixed}.</p>` : '');
  const down = Math.max(0, L.waked - L.act), el = L.mv + L.tr;
  $('#side').innerHTML = `<div class="card-head"><h2>Куда уходит мощность</h2></div>` + (L.free > 50 ? ring([['Полезно', Math.max(0, L.hv - curt[k] * 1000), '#f5b544'], ['Следы ВЭУ', L.free - L.waked, '#7fb6ff'], ['Простои', down, '#ff6452'], ['Кабели и ПС', el + (L.over || 0), '#b5367a'], ['Срезано', curt[k] * 1000, '#8d95a8']], fmt(Math.max(0, L.hv - curt[k] * 1000) / L.free * 100) + ' %', 'полезно') : `<p class="empty">${L.w.v >= T.cutOut ? 'Ветер сильнее 25 м/с: ветроустановки остановлены и развёрнуты лопастями по потоку.' : 'Ветер слабее 3 м/с: роторы не вращаются.'}</p>`);
  drawTimeline(); alertLabels(); renderAgc(); renderScada();
}
function drawTimeline() {
  const pt = (x, i, P, n) => `${(i / n * 1000).toFixed(1)},${(100 - Math.min(x, P) / P * 94).toFixed(1)}`;
  if (S.stage === 'ops') { const P = 1050, n = curve.length - 1, d = 'M' + curve.map((x, i) => pt(x, i, P, n)).join('L'), k = Math.floor(S.min / 10), f = curve.slice(0, k + 1).map((x, i) => pt(x, i, P, n)).join('L');
    $('#c-plan').setAttribute('d', ''); $('#c-fc').setAttribute('d', ''); $('#c-ghost').setAttribute('d', d + 'L1000,100L0,100Z'); $('#c-line').setAttribute('d', 'M' + f); $('#c-area').setAttribute('d', 'M0,100L' + f + `L${(k / n * 1000).toFixed(1)},100Z`);
    $('#c-plan').setAttribute('d', 'M' + windHv.map((x, i) => pt(x, i, P, n)).join('L')); const x = S.min / 1440 * 1000; $('#c-cur').setAttribute('x1', x); $('#c-cur').setAttribute('x2', x); }
  else if (S.stage === 'build') { const n = E.MAXD, D = Math.round(S.bday), f = E.curveFact.slice(0, D + 1).map((x, i) => pt(x, i, 1, n)).join('L');
    $('#c-plan').setAttribute('d', 'M' + E.curvePlan.map((x, i) => pt(x, i, 1, n)).join('L')); $('#c-ghost').setAttribute('d', ''); $('#c-line').setAttribute('d', 'M' + f); $('#c-area').setAttribute('d', 'M0,100L' + f + `L${(D / n * 1000).toFixed(1)},100Z`);
    $('#c-fc').setAttribute('d', bm.ev < .9995 ? `M${pt(bm.ev, D, 1, n)}L${pt(1, Math.min(n, bm.forecast), 1, n)}` : ''); const x = D / n * 1000; $('#c-cur').setAttribute('x1', x); $('#c-cur').setAttribute('x2', x); }
}

/* ═════════ стройка ═════════ */
let bm = E.metrics(S.bday), bState = [], qcOpen = new Map();
function applyBuild() {
  bm = E.metrics(S.bday); qcOpen = new Map(); bm.open.forEach(q => { if (!qcOpen.has(q.i) || q.sev === 'bad') qcOpen.set(q.i, q); }); bState = [];
  for (let i = 0; i < N; i++) { const b = E.wtgState(i, S.bday); bState.push(b); towerK[i] = b.tower; nacOn[i] = +b.nacelle; bladeN[i] = b.blades; foundK[i] = b.found; padOn[i] = +b.pad; built[i] = +b.com; }
  bm.cranes.slice(0, 4).forEach((i, k) => { dm.rotation.set(0, 0, 0.12); dm.scale.set(1, 1, 1); dm.position.set(W.X[i] + Math.sin(padDir[i]) * 30, baseY[i], W.Z[i] + Math.cos(padDir[i]) * 30); dm.updateMatrix(); cranes.setMatrixAt(k, dm.matrix); });
  for (let k = Math.min(4, bm.cranes.length); k < 4; k++) cranes.setMatrixAt(k, ZERO); cranes.instanceMatrix.needsUpdate = true; dm.rotation.set(0, 0, 0);
}
function applyBuilt() { towerK.fill(1); nacOn.fill(1); bladeN.fill(3); foundK.fill(1); padOn.fill(1); built.fill(1); }
function buildAlerts(m) {
  const a = [], er = m.acts.find(x => x.id === 'erect');
  if (m.stopped) a.push(['bad', 'Монтаж ВЭУ остановлен', `${m.stopWhy}. Простой до ${fdate(E.dateOf(m.stopped[1]))}`]);
  if (m.winter && !m.acts.find(x => x.id === 'found').done) a.push(['warn', 'Бетонирование фундаментов на зимней паузе', `Возобновится ${fdate(E.dateOf(m.winter[1]))}`]);
  const ms = m.ms.find(x => m.d >= x.day - 60 && m.mw < x.mw - 4); if (ms) a.push([m.d > ms.day ? 'bad' : 'warn', `Веха ${ms.mw} МВт ${m.d > ms.day ? 'сорвана' : 'под угрозой'}`, `По RFP ${fdate(E.dateOf(ms.day))} (${ms.tag}), по ходу работ ${ms.fact > 0 ? fdate(E.dateOf(ms.fact)) : 'не достигается'}; в сети ${fmt(m.mw)} МВт`]);
  if (er.started && !er.done && !m.stopped && m.stock <= 4) a.push(['warn', `На площадке ${m.stock} комплектов ВЭУ`, 'Запаса хватит меньше чем на две недели монтажа']);
  m.acts.filter(x => x.over).forEach(x => a.push(['bad', `${x.name}: срок вышел`, `Осталось ${fmt(x.qty - x.fact, x.qty > 200 ? 0 : 1)} ${x.unit}`]));
  if (m.ev >= .9995) a.push(['ok', 'Все ВЭУ в сети', `Факт ${fdate(E.dateOf(E.factEnd))}, по RFP ${fdate(E.dateOf(E.PD))}; приёмка ${fdate(E.dateOf(E.PAC))}`]);
  return a;
}
function renderBuild() {
  const m = bm, D = S.bday; $('#clock').textContent = fdate(E.dateOf(D));
  $('#r-tiles').innerHTML = `
    <div class="tile"><label>Готовность</label>${gauge(m.ev * 100, fmt(m.ev * 100, 1) + ' %', 'план ' + fmt(m.pv * 100, 1) + ' %')}</div>
    <div class="tile"><label>В сети</label><div class="v">${fmt(m.mw)}<small>МВт</small></div><div class="s">по вехам RFP ${fmt(m.mwPlan)}</div><div class="viz">${spark(E.mwFact.slice(0, 800), D / 799)}</div></div>
    <div class="tile"><label>Темп к плану</label><div class="v">${fmt(m.spi, 2)}</div><div class="s">${m.spi >= .995 ? 'по графику' : fmt(m.spi * 100) + ' % от плана'}</div></div>
    <div class="tile"><label>1000 МВт</label><div class="v" style="font-size:14px;letter-spacing:0">${fdate(E.dateOf(m.ev >= .9995 ? E.factEnd : m.forecast))}</div><div class="s">по RFP ${fdate(E.dateOf(E.PD))}</div></div>`;
  $('#b-acts').innerHTML = m.acts.map(a => { const pf = a.fact / a.qty * 100, pp = a.plan / a.qty * 100, dg = a.qty < 200 || a.unit === 'км' ? (a.unit === 'шт' ? 0 : a.qty < 200 ? 0 : 0) : 0, note = a.done ? ['ok', 'готово'] : a.over ? ['bad', 'срок вышел'] : !a.started ? ['', 'ещё не начато'] : ['', `идёт ${fmt(a.rate, 1)} в день, нужно ${fmt(a.need, 1)}`];
    return `<div class="row w"><span class="n">${a.name}</span><span class="p">${fmt(a.fact, dg)} <small>из ${fmt(a.qty)} ${a.unit}</small></span><span class="bar"><i style="width:${pf}%"></i>${pp > 0 && pp < 100 ? `<u style="left:${pp}%"></u>` : ''}</span><span class="note ${note[0]}">${note[1]}</span></div>`; }).join('');
  const al = buildAlerts(m); $('#b-pill').className = 'pill ' + (al.some(x => x[0] === 'bad') ? 'bad' : al.some(x => x[0] === 'warn') ? 'warn' : ''); $('#b-pill').lastElementChild.textContent = al.filter(x => x[0] !== 'ok').length;
  $('#b-alerts').innerHTML = al.length ? al.map(x => `<div class="ev ${x[0]}"><i class="dot"></i><b>${x[1]}</b><em></em><span>${x[2]}</span></div>`).join('') : `<p class="empty">На эту дату нет отклонений, которые требуют решения.</p>`;
  $('#b-qcpill').lastElementChild.textContent = m.open.length;
  $('#b-qc').innerHTML = m.open.length ? m.open.slice(-6).reverse().map(q => `<div class="ev ${q.sev}" data-w="${q.i}"><i class="dot"></i><b>${wName(q.i)}</b><em>${fmt(D - q.found)} дн.</em><span>${q.text}</span></div>`).join('') : `<p class="empty">Открытых замечаний нет.</p>`;
  $('#side').innerHTML = `<div class="card-head"><h2>Комплекты ВЭУ</h2><span class="pill ${m.stopped ? 'warn' : 'off'}"><i></i><span>${m.erected >= N ? 'смонтированы' : m.stopped ? 'монтаж стоит' : 'на площадке ' + m.stock}</span></span></div>` + ring([['Смонтировано', m.erected, '#f5b544'], ['Ждут монтажа', m.stock, '#7fb6ff'], ['Не привезено', N - m.del, 'rgba(255,255,255,.18)']], m.erected + '', 'из ' + N);
  const rd = E.real; $('#b-src').className = 'pill ' + (rd ? '' : 'off'); $('#b-src').lastElementChild.textContent = rd ? 'отчёт на ' + fdate(E.dateOf(rd.day)) : 'сценарий';
  $('#b-srcnote').textContent = rd ? `Внесён факт по ${Object.keys(rd.wtg).length} ВЭУ из файла «${rd.file || 'отчёт'}». Всё, что после даты отчёта, — прогноз плановым темпом.${rd.skipped ? ' Не распознано строк: ' + rd.skipped + '.' : ''}` : 'Сейчас ход работ — демонстрационный сценарий. Загрузите таблицу с датами по каждой ВЭУ, и план будет сравниваться с вашим фактом.';
  $('#b-demo').hidden = !rd; $('#b-cranes').textContent = m.cranes.length ? 'в монтаже ' + m.cranes.length + ' ВЭУ' : 'монтаж не идёт';
  const cW = W.VMEAN / 0.8862, okShare = lim => (1 - Math.exp(-Math.pow(lim / cW, 2))) * 100;      // распределение Вейбулла, k = 2
  $('#b-parts').innerHTML = `<dl class="kv">${m.parts.map(p => `<dt>${p.name} на площадке</dt><dd>${p.n} из ${N}</dd>`).join('')}<dt>Смонтировано ВЭУ</dt><dd>${m.erected} из ${N}</dd><dt>Подъём лопастей, ветер до 10 м/с*</dt><dd>${fmt(okShare(10))} % часов</dd><dt>Башня и гондола, до 12 м/с*</dt><dd>${fmt(okShare(12))} % часов</dd></dl><p class="note">Доля часов в году, когда кран может работать: по ветру Global Wind Atlas на оси 110 м. * Пределы по ветру приняты, в документах проекта их нет.</p>`;
  drawTimeline(); alertLabels();
}

/* ═════════ смета и экономика ═════════ */
function renderCost() {
  const p = Object.assign({}, E.ECON, S.econ), a = W.aep(p.avail / 100), f = E.finance(p, a.net);
  $('#clock').textContent = 'Оценка проекта';
  $('#r-tiles').innerHTML = `
    <div class="tile"><label>Выработка в год</label><div class="v">${fmt(a.net / 1000, 2)}<small>ТВт·ч</small></div><div class="s">КИУМ ${fmt(a.cf * 100, 1)} %</div></div>
    <div class="tile"><label>Выручка в год</label><div class="v">${fmt(f.rev / 1e6)}<small>млн $</small></div><div class="s">тариф ${fmt(p.tariff, 2)} цента</div></div>
    <div class="tile"><label>LCOE</label><div class="v">${fmt(f.lcoe, 2)}<small>цента</small></div><div class="s">${fmt(f.perKw)} $ за кВт</div></div>
    <div class="tile"><label>Окупаемость</label><div class="v">${f.payback ? fmt(f.payback, 1) : '—'}<small>${f.payback ? 'лет' : ''}</small></div><div class="s">${f.irr != null ? 'IRR ' + fmt(f.irr * 100, 1) + ' %' : 'не окупается'}</div></div>`;
  const sg = x => (x > 0 ? '+' : '−') + fmt(Math.abs(x)); $('#c-aep').tBodies[0].innerHTML = a.steps.map((s, i) => `<tr><td>${s[0]}</td><td>${i ? sg(s[1]) : fmt(s[1])}${i ? ` <span style="color:var(--faint)">${fmt(Math.abs(s[1]) / a.gross * 100, 1)} %</span>` : ''}</td></tr>`).join('') + `<tr><td><b>В сеть, ГВт·ч в год</b></td><td><b>${fmt(a.net)}</b></td></tr>`;
  $('#side').innerHTML = `<div class="card-head"><h2>Роза ветров</h2><span class="pill off"><span>Global Wind Atlas</span></span></div>${rose(null)}`;
  const mx = Math.max(...a.sect.map(s => s.net)); $('#bars').innerHTML = `<span class="cap">Выработка по направлениям ветра, ГВт·ч в год. Средняя скорость на оси ${fmt(W.VMEAN, 2)} м/с (${fmt(W.GWA.mean100, 2)} на 100 м по Global Wind Atlas), потери в следах ${fmt((1 - a.waked / a.gross) * 100, 1)} %</span>` + a.sect.map(s => `<div class="${s.net === mx ? 'hi' : ''}"><b>${fmt(s.net)}</b><i style="height:${(s.net / mx * 56).toFixed(0)}px"></i>${compass(s.dir)}</div>`).join('');
  alertLabels();
}
const FIELDS = [['capex', 'Стоимость проекта, млн $'], ['tariff', 'Тариф, центов за кВт·ч'], ['opex', 'Эксплуатация, % в год'], ['rate', 'Ставка дисконта, %'], ['years', 'Срок, лет'], ['avail', 'Готовность ВЭУ, %']];

/* однолинейная схема: ВЛ 220 кВ → две системы шин → шесть трансформаторов → секции 35 кВ → ветропарк и накопитель */
const sldEl = document.createElement('section'); sldEl.id = 'sld'; sldEl.className = 'card glass'; sldEl.style.display = 'none'; $('#left').appendChild(sldEl);
function renderSLD() {
  const nt = NETS[S.net][1], k = Math.min(curve.length - 1, Math.round(S.min / 10)), o = W.ohl(Math.max(0, curve[k] * 1000), nt.line ?? -1), L = live, ON = '#f5b544', OFF = '#5d6474', BAD = '#ff6452', B = W.BESS;
  const sec = []; { let f = 0; W.EL.sections.forEach(n => { let p = 0; for (let q = 0; q < n; q++, f++) p += L.fP ? L.fP[f] : 0; sec.push([n, p / 1000]); }); }
  const cb = (x, y, on) => `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="${on ? ON : 'none'}" stroke="${on ? ON : OFF}" stroke-width="1.4"/>`, tx = (x, y, t, c = '#f2f4f8', a = 'middle', sz = 10) => `<text x="${x}" y="${y}" text-anchor="${a}" style="font:${sz}px var(--body);fill:${c}">${t}</text>`;
  let h = `<line x1="40" x2="680" y1="96" y2="96" stroke="${ON}" stroke-width="3"/><line x1="40" x2="680" y1="108" y2="108" stroke="${ON}" stroke-width="3"/>${tx(36, 100, '220 кВ', '#a0a9bb', 'end', 9)}${cb(672, 102, true)}`;
  o.lines.forEach((l, i) => { const x = 150 + i * 190, c = l.out ? OFF : ON; h += tx(x, 16, l.name.replace('ВЛ 220 кВ ', '')) + tx(x, 30, l.out ? 'отключена' : `${fmt(l.mw)} МВт, ${fmt(l.amp)} А`, l.out ? '#717a8d' : '#a0a9bb', 'middle', 9.5);
    for (const d of [-14, 14]) h += `<line x1="${x + d}" x2="${x + d}" y1="38" y2="${d < 0 ? 96 : 108}" stroke="${c}" stroke-width="1.6" ${l.out ? 'stroke-dasharray="4 4"' : ''}/>` + cb(x + d, 66, !l.out); });
  for (let t = 0; t < 6; t++) { const x = 95 + t * 106, wpp = t < 4, off = wpp && t === nt.tr, ld = wpp ? L.trLoad[t] : Math.abs(bess[k]) / 2 / (B.trafoMva * .98), c = off ? OFF : ld > 1 ? BAD : ON;
    h += `<line x1="${x}" x2="${x}" y1="${t % 2 ? 108 : 96}" y2="150" stroke="${c}" stroke-width="1.6" ${off ? 'stroke-dasharray="4 4"' : ''}/>${cb(x, 128, !off)}<circle cx="${x}" cy="160" r="10" fill="none" stroke="${c}" stroke-width="1.6"/><circle cx="${x}" cy="174" r="10" fill="none" stroke="${c}" stroke-width="1.6"/>` + tx(x + 16, 162, 'Т' + (t + 1), '#f2f4f8', 'start') + tx(x + 16, 175, off ? 'откл.' : fmt(ld * 100) + ' %', ld > 1 ? BAD : '#a0a9bb', 'start', 9.5);
    h += `<line x1="${x}" x2="${x}" y1="184" y2="212" stroke="${c}" stroke-width="1.6"/>`;
    for (const sgn of [0, 1]) { const x0 = x - 44 + sgn * 46, sc = wpp ? sec[t * 2 + sgn] : [4, Math.abs(bess[k]) / 4]; h += `<line x1="${x0}" x2="${x0 + 42}" y1="212" y2="212" stroke="${wpp ? ON : '#7fb6ff'}" stroke-width="3"/>` + tx(x0 + 21, 226, `${sc[0]} фид.`, '#a0a9bb', 'middle', 9) + tx(x0 + 21, 238, fmt(sc[1]) + ' МВт', '#f2f4f8', 'middle', 9.5) + `<line x1="${x0 + 21}" x2="${x0 + 21}" y1="244" y2="266" stroke="${wpp ? ON : '#7fb6ff'}" stroke-width="1.2"/>`; } }
  h += tx(36, 216, '35 кВ', '#a0a9bb', 'end', 9) + `<rect x="46" y="266" width="424" height="52" rx="10" fill="rgba(245,181,68,.10)" stroke="${ON}"/>` + tx(258, 288, `Ветропарк: ${st.filter(x => x === 0 || x === 5).length} из ${N} ВЭУ в работе, ${fmt(L.act / 1000)} МВт`, '#f2f4f8', 'middle', 11) + tx(258, 305, `${W.NF} фидеров 35 кВ, компенсация 16 × 41 МВАр`, '#a0a9bb', 'middle', 9.5);
  h += `<rect x="476" y="266" width="204" height="52" rx="10" fill="rgba(127,182,255,.10)" stroke="#7fb6ff"/>` + tx(578, 288, `Накопитель: ${bess[k] > 1 ? 'заряд' : bess[k] < -1 ? 'выдача' : 'ждёт'} ${fmt(Math.abs(bess[k]))} МВт`, '#f2f4f8', 'middle', 11) + tx(578, 305, `заряд ${fmt(soc[k] * 100)} %, компенсация 4 × 36 МВАр`, '#a0a9bb', 'middle', 9.5);
  sldEl.innerHTML = `<div class="card-head"><h2>Однолинейная схема подстанции</h2><span class="pill ${nt.tr != null || nt.line != null ? 'warn' : ''}"><i></i><span>${NETS[S.net][0]}</span></span></div><svg viewBox="0 0 720 326" style="display:block;width:100%;height:auto">${h}</svg>`;
}

/* ═════════ правая колонка, режимы ═════════ */
const RIGHT = {
  ops: `<section class="card glass"><div class="card-head"><h2>Станция сейчас</h2><span class="pill" id="st-pill"><i></i><span>В работе</span></span></div><div class="tiles" id="r-tiles"></div>
      <dl class="kv sep"><dt>Плотность воздуха</dt><dd id="f-a"></dd><dt>Потери в следах</dt><dd id="f-b"></dd><dt>Срезано ограничением сети</dt><dd id="f-c"></dd></dl></section>
    <section class="card glass"><div class="card-head"><h2>Лента SCADA</h2><span class="pill warn"><i></i><span>имитация</span></span></div><div id="scada" class="scada"></div><div class="insp-actions"><button class="btn" id="sc-pause">Пауза</button></div><p class="note">Имитация потока: значения считает модель станции, подключения к SCADA пока нет.</p></section>
    <section class="card glass"><div class="card-head"><h2>Погода и прогноз</h2><span class="pill off"><span id="wx-pill"></span></span></div><div id="wx"></div></section>
    <section class="card glass"><div class="card-head"><h2>Сценарий</h2></div><div class="fin sc"><label>Погода<select id="sc-day">${Object.entries(W.DAYS).map(([k, d]) => `<option value="${k}">${d[0]}</option>`).join('')}</select></label><label>Сеть<select id="sc-net">${Object.entries(NETS).map(([k, d]) => `<option value="${k}">${d[0]}</option>`).join('')}</select></label><label>Накопитель<select id="sc-strat">${Object.entries(STRATS).map(([k, d]) => `<option value="${k}">${d}</option>`).join('')}</select></label></div></section>
    <section class="card glass"><div class="card-head"><h2>Частота и АРЧМ</h2><span class="pill off" id="agc-pill"><i></i><span></span></span></div><div id="agc"></div></section>
    <section class="card glass"><div class="card-head"><h2>Подстанция и линии</h2><span class="pill off"><span>220/35 кВ</span></span></div><div class="rows" id="ss-rows"></div></section>
    <section class="card glass"><div class="card-head"><h2>Что теряет мощность</h2><span class="pill warn" id="ev-pill"><i></i><span>0</span></span></div><div class="rows" id="ev-rows"></div></section><p class="foot" id="src"></p>`,
  build: `<section class="card glass"><div class="card-head"><h2>Стройка на дату</h2><span class="pill off"><span>NTP июль 2026</span></span></div><div class="tiles" id="r-tiles"></div></section>
    <section class="card glass"><div class="card-head"><h2>Данные с площадки</h2><span class="pill off" id="b-src"><i></i><span></span></span></div><p class="note" id="b-srcnote" style="margin:0"></p>
      <div class="insp-actions"><button class="btn go" data-fact="load">Загрузить отчёт: CSV или Excel</button><button class="btn" data-fact="tpl">Скачать шаблон</button><button class="btn" data-fact="demo" id="b-demo">Вернуть сценарий</button></div><input type="file" id="b-file" accept=".csv,.txt,.xlsx" hidden></section>
    <section class="card glass"><div class="card-head"><h2>Требует решения</h2><span class="pill" id="b-pill"><i></i><span>0</span></span></div><div class="rows" id="b-alerts"></div></section>
    <section class="card glass"><div class="card-head"><h2>Поставки и кран</h2><span class="pill off"><span id="b-cranes"></span></span></div><div id="b-parts"></div></section>
    <section class="card glass"><div class="card-head"><h2>Объёмы работ</h2><span class="pill off"><span>метка — план</span></span></div><div class="rows" id="b-acts"></div></section>
    <section class="card glass"><div class="card-head"><h2>Замечания ОТК</h2><span class="pill warn" id="b-qcpill"><i></i><span>0</span></span></div><div class="rows" id="b-qc"></div></section><p class="foot" id="src"></p>`,
  cost: `<section class="card glass"><div class="card-head"><h2>Экономика проекта</h2><span class="pill off"><span>1000 МВт</span></span></div><div class="tiles" id="r-tiles"></div></section>
    <section class="card glass"><div class="card-head"><h2>Допущения</h2><button class="mini" id="fin-reset">Сбросить</button></div><div class="fin" id="c-fin"></div></section>
    <section class="card glass"><div class="card-head"><h2>Выработка, ГВт·ч в год</h2></div><table class="boq" id="c-aep"><tbody></tbody></table></section>
    <section class="card glass"><div class="card-head"><h2>Ведомость объёмов</h2><span class="pill off"><span>BOP и ПС</span></span></div><table class="boq"><tbody>${E.BOQ.map(r => `<tr><td>${r[0]}</td><td>${fmt(r[1], r[1] % 1 ? (r[1] < 20 ? 2 : 1) : 0)} ${r[2]}</td></tr>`).join('')}</tbody></table></section><p class="foot" id="src"></p>`
};
const MODES = { ops: [['real', 'Вид'], ['power', 'Мощность'], ['wake', 'Ветер и следы'], ['elec', 'Сеть 35 кВ'], ['sld', 'Схема ПС'], ['zones', 'Ограничения'], ['pf', 'Расчёт и факт'], ['diag', 'Диагностика'], ['met', 'Метео и датчики']], build: [['stat', 'Ход работ'], ['pf', 'План и факт'], ['qc', 'Замечания']], cost: [] };
const VIEWS = { ops: [[-6500, 4000, 13500], [-300, 0, 1500]], build: [[-9000, 9000, 15500], [0, 0, 500]], cost: [[-2000, 26000, 21000], [0, 0, 500]] };
function setSrc() { const el = $('#src'); if (!el) return; const map = S.terrain && S.terrain.demOk ? 'Рельеф — открытые данные высот (Terrain Tiles), снимок — Esri World Imagery.' : 'Рельеф условный.';
  el.textContent = (S.stage === 'ops' ? 'ВЭУ, дороги и траншеи — из KMZ проекта; подстанция — из ведомости HV-AIS; накопитель — из отчёта и чертежей СНЭ. Суточный ход ветра, кривая мощности и отказы — модель, это не данные SCADA. ' : S.stage === 'build' ? 'План привязан к вехам RFP, объёмы — из ведомости BOP. ' + (E.real ? 'Факт — из загруженного отчёта, после его даты — прогноз. ' : 'Фактический ход работ — демонстрационный сценарий. ') : 'Стоимость и тариф — из справки по проекту, подстанция — из оценённой ведомости. Роза ветров и средняя скорость — Global Wind Atlas; кривая мощности и форма распределения — допущения, ветрового отчёта проекта нет. ') + map; }
function setStage(s, fly = true) {
  S.stage = s; S.sel = null; S.playing = false; $('#play-ic').setAttribute('d', 'M4 2.5v11l9-5.5z');
  $$('#tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.stage === s)); $('#right').innerHTML = RIGHT[s];
  $('#modes').innerHTML = MODES[s].map(m => `<button data-mode="${m[0]}" aria-pressed="${m[0] === (s === 'ops' ? S.mode : S.bmode)}">${m[1]}</button>`).join('');
  $('#clockbox').innerHTML = `<span class="num" id="clock"></span>`;
  if (s === 'ops') { $('#sc-day').value = S.day; $('#sc-net').value = S.net; $('#sc-strat').value = S.strat; }
  const tl = s !== 'cost'; for (const q of ['#tl-ctl', '#tl-chart', '#axis']) $(q).hidden = !tl; $('#bars').hidden = tl; const t = $('#t');
  if (s === 'ops') { t.min = 0; t.max = 1435; t.step = 5; t.value = S.min; $('#now').textContent = S.day === 'live' ? 'Сейчас' : 'Полдень'; $('#cap').innerHTML = '<span><i></i>ветропарк</span><span><i style="background:#f5b544"></i>в сеть с учётом накопителя и ограничений, до 1000 МВт</span>'; $('#axis').innerHTML = ['00:00', '06:00', '12:00', '18:00', '24:00'].map((x, i) => `<span style="left:${i * 25}%">${x}</span>`).join(''); }
  if (s === 'build') { t.min = 0; t.max = E.MAXD; t.step = 1; t.value = S.bday; $('#now').textContent = 'Финиш'; $('#cap').innerHTML = '<span><i></i>план</span><span><i style="background:#f5b544"></i>факт и прогноз</span>';
    const st = $('#tl-chart').clientWidth < 520 ? 200 : 100; let h = ''; for (let d = 0; d <= E.MAXD - (st > 100 ? 100 : 0); d += st) h += `<span style="left:${d / E.MAXD * 100}%">${E.dateOf(d).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace(' г.', '').replace('.', '')}</span>`; $('#axis').innerHTML = h; }
  if (s === 'cost') $('#c-fin').innerHTML = FIELDS.map(([k, l]) => `<label>${l}<input type="number" step="any" data-k="${k}" value="${S.econ[k] ?? E.ECON[k]}"></label>`).join('');
  if (s !== 'build') { applyBuilt(); buildCurve(); } setSrc(); refresh(); if (fly) flyView(...VIEWS[s]);
}
function refresh() {
  if (S.stage === 'build') { applyBuild(); live = { ...compute(720), night: false }; applySun(690); }
  else { live = { ...live, ...compute(S.stage === 'cost' ? 780 : S.min) }; applySun(S.stage === 'cost' ? 780 : S.min); }
  yaw = Math.atan2(Math.sin(live.w.dir * RAD), -Math.cos(live.w.dir * RAD)); poseStatic(); windField(); posePlumes(); paintDots(); layers(); poseXray();
  S.stage === 'ops' ? renderOps() : S.stage === 'build' ? renderBuild() : renderCost(); renderInspector(); renderLegend(); markSel(); insets();
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.stage === 'wtg') return openTurbine(S.sel && S.sel.level === 'wtg' ? S.sel.i : 0); if (b.dataset.stage === 'build') { location.href = 'epc.html'; return; } closeTurbine(); if (b.dataset.stage !== S.stage) setStage(b.dataset.stage); });
$('#modes').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.stage === 'ops' ? S.mode = b.dataset.mode : S.bmode = b.dataset.mode; $$('#modes button').forEach(x => x.setAttribute('aria-pressed', x === b)); refresh(); });
$('#right').addEventListener('click', e => {
  const nw = e.target.closest('[data-new]'), adv = e.target.closest('[data-adv]'), ev = e.target.closest('[data-ev]'), ww = e.target.closest('[data-w]'), ss = e.target.closest('[data-ss]');
  if (nw) return createOrder(nw.dataset.new); if (adv) return advanceOrder(adv.dataset.adv);
  if (ev) { const x = evCache.find(q => q.key === ev.dataset.ev); if (x) select(x.sel, true); return; }
  if (ww) return select({ level: 'wtg', i: +ww.dataset.w }, true); if (ss) return select({ level: 'ss' }, true); if (e.target.closest('[data-bess]')) return select({ level: 'bess' }, true);
  if (e.target.id === 'fin-reset') { S.econ = {}; setStage('cost', false); }
});
$('#right').addEventListener('change', e => { const m = { 'sc-day': 'day', 'sc-net': 'net', 'sc-strat': 'strat' }[e.target.id]; if (!m) return; S[m] = e.target.value; buildCurve(); refresh(); });
$('#right').addEventListener('input', e => { const i = e.target.closest('input[data-k]'); if (!i) return; const x = parseFloat(i.value); if (Number.isFinite(x)) { S.econ[i.dataset.k] = x; renderCost(); } });

/* ═════════ карточка объекта ═════════ */
const X_BTN = '<button class="x" data-act="clear" aria-label="Закрыть"><svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M1 1l8 8M9 1 1 9"/></svg></button>';
function renderInspector() {
  const el = $('#insp'), s = S.sel; if (S.stage === 'cost' || !s) { el.style.display = 'none'; return; } el.style.display = '';
  const kv = rows => `<dl class="kv">${rows.map(r => `<dt>${r[0]}</dt><dd class="${r[2] || ''}">${r[1]}</dd>`).join('')}</dl>`;
  const kq = Math.min(curve.length - 1, Math.round(S.min / 10));
  if (s.level === 'ss') { const nt = NETS[S.net][1], c = W.collect(pw, tripped, nt.tr ?? -1), o = W.ohl(Math.max(0, curve[kq] * 1000), nt.line ?? -1), A = W.EL;
    el.innerHTML = `<div class="card-head"><span class="pill ${nt.tr != null || nt.line != null ? 'warn' : ''}"><i></i><span>${nt.tr != null || nt.line != null ? 'Ремонтная схема' : 'В работе'}</span></span>${X_BTN}</div><h3 class="insp-title">Подстанция 220/35 кВ</h3><div class="insp-sub">Точка учёта на стороне 220 кВ. Состав — по ведомости подстанции</div><div class="big"><b>${pwf(c.hv)}</b><span>от ветропарка на шинах 220 кВ</span></div>` +
      kv([['Трансформаторы ВЭС', `${A.trafos} × ${A.trafoMva} МВА`], ['Их загрузка', c.trLoad.map((l, i) => i === nt.tr ? 'откл.' : fmt(l * 100)).join(' / ') + ' %', Math.max(...c.trLoad) > 1 ? 'bad' : ''], ['Трансформаторы СНЭ', `${W.BESS.trafos} × ${W.BESS.trafoMva} МВА`], ['ОРУ 220 кВ', `${A.ais.bays} ячеек, две системы шин`], ['Фидеры 35 кВ', `${W.NF - tripped.reduce((a, b) => a + b, 0)} из ${W.NF} ВЭС, ${W.BESS.feeders} СНЭ`], ['Компенсация', `${A.svg.n} установок, ${A.svg.mvar} МВАр`], ['Потери в кабелях 35 кВ', pwf(c.mvLoss)], ['Потери в трансформаторах', pwf(c.trLoss)], ['Потери в ВЛ за точкой учёта', pwf(o.loss)], ['Оценка поставки и наладки', fmt(A.ssCost, 1) + ' млн $']]) + `<div class="insp-actions"><button class="btn" data-act="fly">Показать в сцене</button></div>`; return; }
  if (s.level === 'bess') { const B = W.BESS, p = S.stage === 'ops' ? bess[kq] : 0, so = S.stage === 'ops' ? soc[kq] : 0.5, caps = Array.from({ length: 26 }, (_, y) => B.capacity(y) - 560);
    el.innerHTML = `<div class="card-head"><span class="pill ${Math.abs(p) > 1 ? '' : 'off'}"><i></i><span>${p > 1 ? 'Заряд' : p < -1 ? 'Выдача' : 'Ожидание'}</span></span>${X_BTN}</div><h3 class="insp-title">Накопитель энергии</h3><div class="insp-sub">${B.mw} МВт / ${B.mwh} МВт·ч, 35 кВ. Состав — по отчёту и схеме СНЭ</div><div class="big"><b>${fmt(Math.abs(p))} МВт</b><span>заряд ${fmt(so * 100)} %, ${fmt(so * bCap)} МВт·ч</span></div>` +
      kv([['Режим', STRATS[S.strat]], ['Батарейные контейнеры', `${B.encl} по ${fmt(B.q * 1000)} кВт·ч`], ['Преобразовательные станции', `70 по 5,5 МВА и одна 2,75`], ['Кольца 35 кВ', `${B.loops} по три станции, ${B.feeders} фидеров`], ['Трансформаторы', `${B.trafos} × 330/165/165 МВА`], ['Собственные нужды', fmt(Math.abs(p) > 1 ? B.auxOp : B.auxSb, 2) + ' МВт'], ['Полезная ёмкость, 1-й год', fmt(bCap) + ' МВт·ч'], ['На 25-й год', fmt(B.capacity(25)) + ' МВт·ч, ' + B.count(25) + ' конт.']]) +
      `<div style="margin-top:10px">${spark(caps, 1 / 25)}</div><p class="note">Полезная ёмкость за 25 лет: батареи стареют, на 5, 10, 15 и 20-й год добавляют по 12 контейнеров, поэтому ёмкость не опускается ниже 600 МВт·ч.</p><div class="insp-actions"><button class="btn" data-act="fly">Показать в сцене</button></div>`; return; }
  if (S.stage === 'build' && s.level === 'wtg') { el.innerHTML = buildCard(s.i); return; }
  if (S.stage === 'build') { const i = s.i, b = bState[i], D = S.bday, obs = bm.open.filter(q => q.i === i);
    el.innerHTML = `<div class="card-head"><span class="pill ${b.late > 14 ? 'bad' : b.late > 0 ? 'warn' : ''}"><i></i><span>${b.late > 0 ? 'отстаёт на ' + fmt(b.late) + ' дн.' : 'по графику'}</span></span>${X_BTN}</div><h3 class="insp-title">${wName(i)}</h3><div class="insp-sub">${E.STAGE[b.stage]}. Фидер ${W.feeder[i] + 1}. Фундамент Ø26 м: 680 м³ бетона, 82 т арматуры</div>
      <div class="steps" style="border:0;padding:0;margin:0">${E.steps(i).map(x => { const done = D >= x.fact, now = !done && D >= x.start, late = Math.round((done ? x.fact : D) - x.plan);
        return `<div class="step ${done ? 'done' : now ? 'now' : ''}"><i></i><span>${x.name}</span><em>${done ? fdate(E.dateOf(x.fact)) : now ? 'в работе' : 'план ' + fdate(E.dateOf(x.plan))}</em>${late > 0 && (done || D > x.plan) ? `<small class="bad">${done ? 'сдано на' : 'просрочено на'} ${fmt(late)} дн. позже плана</small>` : done ? `<small>в срок</small>` : ''}</div>`; }).join('')}</div>
      ${(c => `<dl class="kv" style="margin-top:10px">${E.PARTS.map(([k, name]) => `<dt>${name}</dt><dd class="${c[k] != null && c[k] <= D ? 'ok' : ''}">${c[k] == null ? 'нет данных' : c[k] <= D ? 'на площадке с ' + fdate(E.dateOf(c[k])) : 'ждём ' + fdate(E.dateOf(c[k]))}</dd>`).join('')}</dl>${c.demo ? '<p class="note">Поставки — по сценарию.</p>' : ''}`)(E.comp(i))}
      ${obs.length ? `<div class="rows" style="margin-top:12px">${obs.map(q => `<div class="ev ${q.sev}"><i class="dot"></i><b>Замечание ${q.n}</b><em>${fmt(D - q.found)} дн.</em><span>${q.text}</span></div>`).join('')}</div>` : ''}<div class="insp-actions"><button class="btn" data-act="fly">Показать в сцене</button></div>`; return; }
  const seg = `<div class="seg">${[['wtg', 'Ветроустановка'], ['feeder', 'Фидер 35 кВ']].map(l => `<button data-level="${l[0]}" aria-pressed="${s.level === l[0]}">${l[1]}</button>`).join('')}</div>`, key = selKey(s), ev = evCache.find(x => x.key === key), od = S.orders.find(o => o.key === key);
  const act = `<div class="insp-actions">${ev ? (od ? `<button class="btn go" data-adv="${key}">Наряд ${od.n}: ${WO[od.step].toLowerCase()} ✓</button>` : `<button class="btn go" data-new="${key}">Создать наряд бригаде</button>`) : ''}<button class="btn" data-act="fly">Показать в сцене</button>${s.level === 'wtg' ? '<button class="btn" data-act="tear">Разобрать в 3D</button>' : ''}</div>`;
  if (s.level === 'wtg') { const i = s.i, dv = pExp[i] > 1 ? (pw[i] / pExp[i] - 1) * 100 : NaN;
    el.innerHTML = `<div class="card-head"><span class="pill ${st[i] === 3 || st[i] === 6 ? 'bad' : st[i] ? 'warn' : ''}"><i></i><span>${ST_NAME[st[i]]}</span></span>${X_BTN}</div>${seg}<h3 class="insp-title">${wName(i)}</h3><div class="insp-sub">${fmt(T.rated / 1000, 2)} МВт, ротор ${T.D} м, ось ${T.hub} м. ${faultText[i] && st[i] ? faultText[i] : 'Фидер ' + (W.feeder[i] + 1) + ', трансформатор Т' + (W.feederTr[W.feeder[i]] + 1)}</div>
      <div class="big"><b>${pwf(pw[i])}</b>${Number.isNaN(dv) ? '' : `<span class="${dv < -15 ? 'bad' : dv < -3 ? 'warn' : 'ok'}">${dv < -0.5 ? '↓ ' + fmt(-dv) + ' % к расчёту' : 'в норме'}</span>`}</div>` + act + diagBox(i) + pfBox(i) + wtgDash(i) +
      kv([['Ветер на роторе', fmt(v[i], 1) + ' м/с'], ['Потеря скорости в следе', fmt(def[i] * 100, 1) + ' %', def[i] > .12 ? 'bad' : ''], ['Обороты ротора', fmt(rpm[i] < 1 ? 0 : rpm[i], 1) + ' об/мин'], ['Угол лопастей', fmt(run[i] ? W.pitch(v[i], rho[i]) : 88) + '°'], ['Курс гондолы', `${compass(live.w.dir)}, ${fmt(live.w.dir)}°`], ['Высота площадки', fmt(W.elev[i]) + ' м'], ['Кабель до подстанции', fmt(W.route[i] / 1000, 1) + ' км'], ...(t => [['Редуктор, генератор', `${fmt(t.gear)} и ${fmt(t.gen)} °C`, t.gen > 95 ? 'bad' : ''], ['Подшипник, преобразователь', `${fmt(t.bear)} и ${fmt(t.conv)} °C`, t.bear > 95 || t.conv > 95 ? 'bad' : '']])(temps(i))]); return; }
  const f = s.f, m = W.feeders[f], p = m.reduce((a, i) => a + pw[i], 0), I = p / (Math.sqrt(3) * W.EL.kv * W.EL.cosphi);
  el.innerHTML = `<div class="card-head"><span class="pill ${tripped[f] ? 'bad' : ''}"><i></i><span>${tripped[f] ? 'Отключён' : 'В работе'}</span></span>${X_BTN}</div>${seg}<h3 class="insp-title">Фидер ${f + 1}</h3><div class="insp-sub">35 кВ, трансформатор Т${W.feederTr[f] + 1}, ${m.length} ВЭУ: ${m.map(wName).join(', ').replace(/WTG/g, '')}</div><div class="big"><b>${pwf(p)}</b><span>из ${fmt(m.length * T.rated / 1000, 1)} МВт</span></div>` +
    kv([['Ток в головном кабеле', fmt(I) + ' А'], ['Сечения кабеля', m.map((_, k) => W.section(k + 1)).filter((x, k, a) => a.indexOf(x) === k).join(', ') + ' мм²'], ['Длина трассы', fmt(Math.max(...m.map(i => W.route[i])) / 1000, 1) + ' км'], ['На шинах подстанции', pwf(live.fP ? live.fP[f] : 0)]]) + act;
}
$('#insp').addEventListener('click', e => { const act = e.target.closest('[data-act]'), lv = e.target.closest('[data-level]'), nw = e.target.closest('[data-new]'), adv = e.target.closest('[data-adv]');
  if (nw) return createOrder(nw.dataset.new); if (adv) return advanceOrder(adv.dataset.adv);
  if (lv) { const s = S.sel; if (lv.dataset.level === 'feeder' && s.level === 'wtg') return select({ level: 'feeder', f: W.feeder[s.i] }); if (lv.dataset.level === 'wtg' && s.level === 'feeder') return select({ level: 'wtg', i: W.feeders[s.f][0] }); return; }
  if (act) act.dataset.act === 'fly' ? flyToSel() : act.dataset.act === 'tear' ? openTurbine(S.sel.i) : select(null); });

/* ---------- турбина в 3D: отдельная страница wtg.html, собранная teardown, открывается поверх парка ---------- */
const tabBtns = () => document.querySelectorAll('#tabs button');
function openTurbine(i) { if (i == null) i = 0; const t = temps(i), q = new URLSearchParams({ wtg: wName(i), v: (v[i] || 0).toFixed(2), t: Math.round(live.w.temp), rho: rho[i].toFixed(3) });
  const al = []; if (t.bear > 95) al.push('ГП1'); else if (t.bear > 80) q.set('warn', 'ГП1'); if (t.gen > 95) al.push('Г1'); if (al.length) q.set('alarm', al.join(','));
  let box = document.getElementById('wtgview'); if (!box) { box = document.createElement('div'); box.id = 'wtgview'; box.innerHTML = '<iframe title="Ветроустановка в 3D"></iframe><button class="glass" data-close>← К парку</button>'; document.body.appendChild(box); box.querySelector('[data-close]').addEventListener('click', closeTurbine); }
  box.querySelector('iframe').src = 'wtg.html?v=9#' + q.toString(); box.classList.add('open'); for (const b of tabBtns()) b.setAttribute('aria-pressed', b.dataset.stage === 'wtg'); }
function closeTurbine() { const box = document.getElementById('wtgview'); if (!box || !box.classList.contains('open')) return; box.classList.remove('open'); box.querySelector('iframe').src = 'about:blank'; for (const b of tabBtns()) b.setAttribute('aria-pressed', b.dataset.stage === S.stage); }
function selCenter(s) { if (s.level === 'ss') return { p: new THREE.Vector3(SITE.ss[0] - 10, ssY + 10, SITE.ss[1]), r: 300 }; if (s.level === 'bess') return { p: new THREE.Vector3(SITE.ss[0] + 378, ssY + 5, SITE.ss[1]), r: 330 }; if (s.level === 'wtg') return { p: new THREE.Vector3(W.X[s.i], baseY[s.i] + 95, W.Z[s.i]), r: 190 };
  const m = W.feeders[s.f]; let x = 0, z = 0; m.forEach(i => { x += W.X[i]; z += W.Z[i]; }); x /= m.length; z /= m.length; return { p: new THREE.Vector3(x, ground(x, z) + 60, z), r: 1800 }; }
function markSel() { const s = S.sel; if (S.stage === 'build') alertLabels(); Object.values(labels).forEach(l => l.el.classList.toggle('sel', !!s && l.key === selKey(s))); }
function select(s, fly) { S.sel = s; paintDots(); poseXray(); renderInspector(); renderLegend(); markSel(); insets(); if (s && fly) flyToSel(); }
let tween = null;
function flyView(pos, tgt, ms = 1700) { const p = new THREE.Vector3(...pos), a = new THREE.Vector3(...tgt); a.y += ground(a.x, a.z); p.y += ground(a.x, a.z); if (reduceMotion) { camera.position.copy(p); controls.target.copy(a); return; } tween = { t0: performance.now(), ms, p0: camera.position.clone(), p1: p, a0: controls.target.clone(), a1: a }; }
function flyToSel() { if (!S.sel) return;
  if (S.sel.level === 'wtg') { const i = S.sel.i, d = camera.position.clone().sub(controls.target); d.y = 0; if (d.lengthSq() < 1) d.set(1, 0, 1); d.normalize();
    const a1 = new THREE.Vector3(W.X[i], baseY[i] + T.hub * .82, W.Z[i]), to = new THREE.Vector3(W.X[i], baseY[i] + T.hub * .82 + 14, W.Z[i]).addScaledVector(d, 330);
    if (reduceMotion) { camera.position.copy(to); controls.target.copy(a1); } else tween = { t0: performance.now(), ms: 1400, p0: camera.position.clone(), p1: to, a0: controls.target.clone(), a1 }; return; }
  const { p, r } = selCenter(S.sel), dir = camera.position.clone().sub(controls.target).normalize(); if (dir.y < .3) { dir.y = .3; dir.normalize(); } const to = p.clone().add(dir.multiplyScalar(r * 2.2)); tween = reduceMotion ? null : { t0: performance.now(), ms: 1200, p0: camera.position.clone(), p1: to, a0: controls.target.clone(), a1: p }; if (reduceMotion) { camera.position.copy(to); controls.target.copy(p); } }

/* ═════════ подписи, легенда ═════════ */
const labels = {}, labelsEl = $('#labels'), v3 = new THREE.Vector3();
function addLabel(id, pos, html, cls, onclick, key) { const d = document.createElement('div'); d.className = 'lbl ' + (cls || ''); d.innerHTML = html; d.onclick = onclick; labelsEl.appendChild(d); labels[id] = { el: d, p: pos, key }; }
addLabel('ss', new THREE.Vector3(SITE.ss[0], 40, SITE.ss[1]), `<i></i><b>ПС 220/35 кВ</b><span></span>`, '', () => select({ level: 'ss' }, true), 'ss:');
addLabel('bess', new THREE.Vector3(SITE.ss[0] + 378, 30, SITE.ss[1]), `<i></i><b>СНЭ</b><span></span>`, '', () => select({ level: 'bess' }, true), 'bess:');
function alertLabels() {
  Object.keys(labels).filter(k => k[0] === 'a').forEach(k => { labels[k].el.remove(); delete labels[k]; });
  const top = i => new THREE.Vector3(W.X[i], baseY[i] + T.hub + 40, W.Z[i]);
  if (S.stage === 'ops') { evCache.slice(0, S.mode === 'diag' || S.mode === 'met' || S.mode === 'pf' ? 0 : PHONE ? 2 : 5).forEach((e, k) => { const i = e.sel.level === 'wtg' ? e.sel.i : W.feeders[e.sel.f][0]; addLabel('a' + k, top(i), `<i></i><b>${e.sel.level === 'wtg' ? wName(i) : 'Фидер ' + (e.sel.f + 1)}</b><span>${e.loss > 1 ? '−' + pwf(e.loss) : ''}</span>`, 'alert', () => select(e.sel, true), e.key); });
    labels.ss.el.querySelector('span').textContent = pwf(live.hv); { const kq = Math.min(curve.length - 1, Math.round(S.min / 10)); labels.bess.el.querySelector('span').textContent = fmt(soc[kq] * 100) + ' %'; } }
  if (S.stage === 'build') { bm.cranes.slice(0, 3).forEach((i, k) => addLabel('a' + k, top(i), `<i></i><b>Кран</b><span>${wName(i)}</span>`, 'alert', () => select({ level: 'wtg', i }, true), 'wtg:' + i)); labels.ss.el.querySelector('span').textContent = fmt(bm.acts.find(a => a.id === 'ss').fact) + ' %'; labels.bess.el.querySelector('span').textContent = fmt(bm.acts.find(a => a.id === 'bess').fact) + ' МВт·ч';
    if (S.bmode === 'qc') bm.open.slice(-6).forEach((q, k) => addLabel('aq' + k, top(q.i), `<i></i><b>${wName(q.i)}</b>`, 'alert', () => select({ level: 'wtg', i: q.i }, true), 'wtg:' + q.i)); }
  if (S.stage === 'build' && S.sel && S.sel.level === 'wtg') { const i = S.sel.i; addLabel('asel', top(i), `<i></i><b>${wName(i)}</b><span>${E.detail(i, S.bday).stage}</span>`, 'alert', null, 'wtg:' + i); }
  opsMarks();
  if (S.stage === 'cost') { labels.ss.el.querySelector('span').textContent = ''; labels.bess.el.querySelector('span').textContent = '300 МВт'; }
}
const INS = { l: 0, r: 0, t: 0, b: 0, block: [] };
function insets() { const w = canvas.clientWidth, h = canvas.clientHeight;
  if (innerWidth <= 760) { INS.l = -30; INS.r = -30; INS.t = $('#top').getBoundingClientRect().bottom - 10; INS.b = $('#modes').offsetHeight ? 58 : 8; INS.block = []; const cy = (INS.t + h - INS.b) / 2; camera.setViewOffset(w, h, 0, Math.round(h / 2 - cy), w, h); return; }
  INS.r = document.body.classList.contains('lean') ? 8 : w - $('#right').getBoundingClientRect().left + 4; INS.b = h - $('#bot').getBoundingClientRect().top + 4; INS.t = $('#top').getBoundingClientRect().bottom + 4; INS.l = 8; INS.block = ['#modes', '#legend', '#insp'].map(q => $(q).getBoundingClientRect()).filter(r => r.width > 0);
  const cx = (INS.l + w - INS.r) / 2, cy = (INS.t + h - INS.b) / 2; camera.setViewOffset(w, h, Math.round(w / 2 - cx), Math.round(h / 2 - cy), w, h); }
function placeLabels() { const w = canvas.clientWidth, h = canvas.clientHeight; let ssXY = null; for (const l of Object.values(labels)) { v3.copy(l.p).project(camera); const x = (v3.x * .5 + .5) * w, y = (-v3.y * .5 + .5) * h, vis = v3.z < 1 && x > INS.l + 40 && x < w - INS.r - 40 && y > INS.t + 34 && y < h - INS.b - 6 && !INS.block.some(r => x > r.left - 70 && x < r.right + 70 && y > r.top - 4 && y < r.bottom + 34);
    let show = vis && !(l.near && camera.position.distanceTo(l.p) > l.near); if (l === labels.ss && show) ssXY = [x, y]; if (l === labels.bess && show && ssXY && Math.abs(x - ssXY[0]) < 150 && Math.abs(y - ssXY[1]) < 26) show = false; l.el.style.display = show ? '' : 'none'; if (show) l.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-150%)`; } }
function renderLegend() {
  const css = s => `linear-gradient(90deg,${s.map(c => `rgb(${c.map(x => Math.round(x * 255)).join(',')})`).join(',')})`, el = $('#legend'), key = a => `<div class="keys">${a.map(x => `<span><i style="background:#${x[0].toString(16).padStart(6, '0')}"></i>${x[1]}</span>`).join('')}</div>`; let h = '';
  if (S.stage === 'ops') { if (S.mode === 'power') h = `<h2>Мощность ветроустановки</h2><div class="ramp" style="background:${css(RP)}"></div><div class="ticks"><span>0</span><span>3,6</span><span>7,15 МВт</span></div>`;
    if (S.mode === 'wake') h = `<h2>Потеря скорости ветра в следе</h2><div class="ramp" style="background:${css(RW)}"></div><div class="ticks"><span>0</span><span>11 %</span><span>22 %</span></div>`;
    if (S.mode === 'elec') h = `<h2>Кабельные траншеи 35 кВ</h2>` + key(Object.keys(TR_COL).map(k => [TR_COL[k], TR_NAME[k]])) + `<p class="note">Цвет точки и линии над ВЭУ — фидер. Фидеров ${W.NF}, как в ведомости подстанции; какие ВЭУ на каком фидере — расчёт.</p>`;
    if (S.mode === 'zones') h = `<h2>Зоны ограничений</h2>` + key([[0xc77dff, 'археология, охранные зоны'], [0x4ade80, 'чувствительная природа'], [0xff5a4a, 'сибиреязвенные захоронения, 1 км']]); }
  if (S.stage === 'build') h = S.bmode === 'stat' ? (S.sel ? '' : `<h2>Слои проекта</h2>` + layersTree() + `<details class="keysd"><summary>Цвета меток на карте</summary>` + key(STAGE_COL.map((c, i) => [c, E.STAGE[i]]).slice(1)) + `</details>`) : S.bmode === 'pf' ? `<h2>Отставание от плана</h2>` + key([[0x62d6a0, 'в срок'], [0xf5b544, 'до двух недель'], [0xf0784a, 'до полутора месяцев'], [0xe5352f, 'больше']]) : `<h2>Открытые замечания ОТК</h2>` + key([[0xf5b544, 'есть замечание'], [0xe5352f, 'критичное']]);
  if (S.stage === 'ops' && (S.mode === 'pf' || S.mode === 'diag' || S.mode === 'met')) h = opsLegend(css);
  const isHint = !h && !S.sel && S.stage === 'ops'; if (isHint) h = `<p class="empty" style="font-size:12px">${S.stage === 'ops' ? 'Нажмите на ветроустановку или подстанцию. Слои слева показывают мощность, следы, кабельную сеть и зоны ограничений.' : ''}</p>`;
  el.classList.toggle('hint', isHint); el.innerHTML = h; el.style.display = h ? '' : 'none';
}

/* ═════════ время, поиск, указатель ═════════ */
$('#t').addEventListener('input', e => { if (S.stage === 'ops') S.min = +e.target.value; else S.bday = +e.target.value; refresh(); });
$('#play').addEventListener('click', () => { S.playing = !S.playing; $('#play-ic').setAttribute('d', S.playing ? 'M4 2.5h3v11H4zM9 2.5h3v11H9z' : 'M4 2.5v11l9-5.5z'); if (S.playing && S.stage === 'build' && S.bday >= E.factEnd + 20) S.bday = 0; });
$('#now').addEventListener('click', () => { if (S.stage === 'ops') S.min = S.day === 'live' && WX && WX.nowMin != null ? WX.nowMin : 720; else S.bday = E.factEnd + 5; $('#t').value = S.stage === 'ops' ? S.min : S.bday; refresh(); });
const q = $('#q'), sug = $('#suggest'); let sugList = [];
function suggest(text) { const s = text.trim().toLowerCase(), out = [], num = (s.match(/\d+/) || [''])[0]; if (!s) return out;
  if (/пс|подст|ss|sub/.test(s)) out.push({ label: 'Подстанция 220/35 кВ', hint: 'точка учёта', sel: { level: 'ss' } });
  if (/снэ|накоп|bess|бата/.test(s)) out.push({ label: 'Накопитель энергии', hint: '300 МВт / 600 МВт·ч', sel: { level: 'bess' } });
  if (/фид|fee/.test(s) && num && +num >= 1 && +num <= W.NF) out.push({ label: 'Фидер ' + num, hint: '35 кВ', sel: { level: 'feeder', f: +num - 1 } });
  if (num && !/фид|fee/.test(s)) for (let i = 0; i < N && out.length < 7; i++) if (wName(i).replace('WTG', '').replace(/^0+/, '').startsWith(String(+num))) out.push({ label: wName(i), hint: 'фидер ' + (W.feeder[i] + 1), sel: { level: 'wtg', i } });
  return out.slice(0, 7); }
const goSug = s => { if (S.stage === 'cost' || (S.stage === 'build' && s.sel.level !== 'wtg')) setStage('ops', false); select(s.sel, true); sug.classList.remove('open'); };
q.addEventListener('input', () => { sugList = suggest(q.value); sug.innerHTML = sugList.map((s, i) => `<button data-i="${i}" class="${i ? '' : 'act'}"><span>${s.label}</span><small>${s.hint}</small></button>`).join('') || (q.value.trim() ? '<div style="padding:8px 10px;color:var(--muted)">Не нашёл. Попробуйте «45», «фидер 7» или «подстанция».</div>' : ''); sug.classList.toggle('open', !!q.value.trim()); });
q.addEventListener('keydown', e => { if (e.key === 'Enter' && sugList[0]) { goSug(sugList[0]); q.blur(); } if (e.key === 'Escape') { q.value = ''; sug.classList.remove('open'); } });
sug.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) goSug(sugList[+b.dataset.i]); }); q.addEventListener('blur', () => setTimeout(() => sug.classList.remove('open'), 150));
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function hitAt(cx, cy) { const r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera);
  const h = ray.intersectObject(pickMesh, false)[0], g = ray.intersectObject(terrain, false)[0]; if (h && (!g || h.distance < g.distance + 60)) return { i: h.instanceId };
  const hs = ray.intersectObject(dyn, true)[0], q = hs && (!g || hs.distance < g.distance + 5) ? hs.point : g && g.point; if (q) { const dx = q.x - SITE.ss[0], dz = Math.abs(q.z - SITE.ss[1]); if (dx > -176 && dx < 156 && dz < 122) return { ss: 1 }; if (dx > 184 && dx < 572 && dz < 76) return { bess: 1 }; } return null; }
let down = null, hoverQ = null; const tip = $('#tip');
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; tween = null; });
canvas.addEventListener('pointerup', e => { if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; down = null; if (S.stage === 'cost') return; const h = hitAt(e.clientX, e.clientY); if (!h) return select(null); if (h.ss) return select({ level: 'ss' }); if (h.bess) return select({ level: 'bess' });
  select(S.stage === 'ops' && S.sel && S.sel.level === 'feeder' ? { level: 'feeder', f: W.feeder[h.i] } : { level: 'wtg', i: h.i }); });
canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') hoverQ = e; }); canvas.addEventListener('pointerleave', () => { hoverQ = null; tip.style.opacity = 0; });
function doHover() { const e = hoverQ; hoverQ = null; if (!e || e.buttons || S.stage === 'cost') { tip.style.opacity = 0; return; } const h = hitAt(e.clientX, e.clientY); if (!h) { tip.style.opacity = 0; canvas.style.cursor = ''; return; } canvas.style.cursor = 'pointer';
  tip.innerHTML = h.ss ? `Подстанция 220/35 кВ <b>${pwf(live.hv)}</b>` : h.bess ? `Накопитель <b>300 МВт / 600 МВт·ч</b>` : S.stage === 'build' ? `${wName(h.i)} <b>${E.STAGE[bState[h.i].stage].toLowerCase()}</b>` : `${wName(h.i)} <b>${pwf(pw[h.i])}, ${fmt(v[h.i], 1)} м/с</b>`; tip.style.opacity = 1; tip.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 16}px)`; }
addEventListener('keydown', e => { if (e.key === 'Escape' && document.activeElement !== q) { const o = document.getElementById('wtgview'); if (o && o.classList.contains('open')) closeTurbine(); else select(null); } });

/* ═════════ цикл ═════════ */
function resize() { const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio(); if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) { renderer.setSize(w, h, false); composer && composer.setSize(w, h); camera.aspect = w / h; camera.fov = w / h < 1.15 ? 50 : 36; camera.updateProjectionMatrix(); insets(); } }
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now; resize();
  if (S.playing) { acc += dt; if (S.stage === 'ops' && acc >= .14) { S.min += Math.floor(acc / .14) * 5; acc %= .14; if (S.min > 1435) S.min = 0; $('#t').value = S.min; refresh(); }
    if (S.stage === 'build' && acc >= .06) { acc = 0; S.bday += 2; if (S.bday > E.factEnd + 30) { S.bday = E.factEnd + 30; S.playing = false; $('#play-ic').setAttribute('d', 'M4 2.5v11l9-5.5z'); } $('#t').value = S.bday; refresh(); } }
  if (tween && now >= tween.t0) { const k = Math.min(1, (now - tween.t0) / tween.ms), e = ease(k); camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.a0, tween.a1, e); if (k >= 1) tween = null; }
  controls.update(); const gy = ground(camera.position.x, camera.position.z) + 12; if (camera.position.y < gy) camera.position.y = gy;
  const dist = camera.position.distanceTo(controls.target), sh = Math.max(350, Math.min(5000, dist * .7)), sc = sunL.shadow.camera;   // тени — только вокруг точки взгляда
  if (Math.abs(sc.right - sh) > sh * .15) { sc.left = -sh; sc.right = sh; sc.top = sh; sc.bottom = -sh; sc.near = 100; sc.far = sh * 8; sc.updateProjectionMatrix(); }
  sunL.target.position.copy(controls.target); sunL.position.copy(controls.target).addScaledVector(sunL.userData.dir || new THREE.Vector3(0, 1, 0), sh * 4);
  if (hoverQ) doHover(); if (envDirty && now - envTimer > 140) { envDirty = false; envTimer = now; refreshEnv(); }
  AGC.acc += dt; if (AGC.acc >= 1) { AGC.acc = 0; agcStep(); if (S.stage === 'ops') renderAgc(); }
  if (live.w) CLOUD.uOff.value.addScaledVector(new THREE.Vector2(fX, fZ), -live.w.v * dt * 0.00016 * 9);
  cloudMat.uniforms.uOff.value.copy(CLOUD.uOff.value); cloudMat.uniforms.uCam.value.copy(camera.position);
  poseRotors(dt); flow(dt); composer ? composer.render() : renderer.render(scene, camera); placeLabels(); requestAnimationFrame(frame);
}
applyHeights(); layout(); buildCurve(); setStage('ops', false); resize(); refreshEnv();
{ const vw = VIEWS.ops; if (reduceMotion) { camera.position.set(...vw[0]); controls.target.set(...vw[1]); } else tween = { t0: performance.now() + 300, ms: 3200, p0: camera.position.clone(), p1: new THREE.Vector3(...vw[0]), a0: controls.target.clone(), a1: new THREE.Vector3(...vw[1]) }; }
requestAnimationFrame(frame); requestAnimationFrame(() => $('#boot')?.classList.add('gone')); loadTerrain();
window.__twin = { S, live: () => live, select, setStage, refresh, camera, controls, W, E, ground, dbg: { renderer, scene, get composer() { return composer; }, flow, poseRotors, placeLabels, sunL, terrain } };

/* ---------- показатели по кнопке: на узком окне колонка справа не закрывает сцену ---------- */
{ const btn = document.getElementById('pbtn'), B = document.body, narrow = () => innerWidth < 1100; let wideLean = false;
  try { wideLean = localStorage.getItem('lean') === '1'; } catch (e) {}
  const apply = () => { const lean = innerWidth > 760 && (narrow() || wideLean); B.classList.toggle('lean', lean); if (!lean) B.classList.remove('panel');
    btn.setAttribute('aria-pressed', lean ? B.classList.contains('panel') : true); };
  btn.addEventListener('click', () => { if (narrow()) B.classList.toggle('panel'); else { wideLean = !wideLean; try { localStorage.setItem('lean', wideLean ? '1' : '0'); } catch (e) {} }
    apply(); dispatchEvent(new Event('resize')); });
  addEventListener('resize', apply); apply(); dispatchEvent(new Event('resize')); }

/* ---------- данные с площадки: таблица CSV или Excel → факт по каждой ВЭУ ---------- */
const FACT = (() => {
  const dayOf = v => { if (v == null) return null; if (typeof v === 'number') return v > 30000 && v < 80000 ? Math.round((Date.UTC(1899, 11, 30) + v * 864e5 - E.DAY0) / 864e5) : null;
    const t = String(v).trim(); let m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/), y, mo, d; if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; } else if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; } else { const n = +t.replace(',', '.'); return t && isFinite(n) && n > 30000 && n < 80000 ? dayOf(n) : null; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; return Math.round((Date.UTC(y, mo - 1, d) - E.DAY0) / 864e5); };
  const pctOf = v => { if (v == null || v === '') return null; let n = typeof v === 'number' ? v : +String(v).replace('%', '').replace(',', '.').trim(); if (!isFinite(n)) return null; if (typeof v === 'number' && n <= 1) n *= 100; return Math.max(0, Math.min(100, n)) / 100; };
  const idx = new Map(SITE.wtg.map((w, i) => [parseInt(String(w[0]).replace(/\D/g, ''), 10), i]));
  const COLS = [[/башн/, 'tower'], [/гондол/, 'nacelle'], [/лопаст/, 'blades'], [/дорог|подъезд/, 'road'], [/площадк/, 'pad'], [/фундамент/, 'found'], [/монтаж/, 'erect'], [/кабел/, 'mv'], [/пуск|ввод/, 'com']];
  const AREA = [[/^(пс|подстанц)/, 'ss'], [/жамбыл/, 'ohlJ'], [/кентау/, 'ohlK'], [/снэ|накопит|bess/, 'bess']];
  // строки таблицы → объект для EPCW.loadFact
  function fromRows(rows, file) {
    const real = { day: null, wtg: {}, area: {}, file, skipped: 0 }; let head = null, maxDay = -1e9;
    for (const row of rows) { const c0 = String(row[0] ?? '').trim(), low = c0.toLowerCase(); if (!c0) continue;
      if (/дата отч/.test(low)) { real.day = dayOf(row[1]); continue; }
      const ar = AREA.find(a => a[0].test(low)); if (ar && !head) { const p = pctOf(row[1]); if (p != null) real.area[ar[1]] = p; continue; }
      if (!head && /^(вэу|wtg|№)/.test(low)) { head = row.map(h => { const t = String(h ?? '').toLowerCase(), c = COLS.find(x => x[0].test(t)); return c ? [c[1], /начал|старт/.test(t) ? 0 : 1] : null; }); continue; }
      if (!head) continue; const num = parseInt(c0.replace(/\D/g, ''), 10), i = idx.get(num); if (i == null) { real.skipped++; continue; }
      const r = {}; let any = false; head.forEach((h, k) => { if (!h || k === 0) return; const d = dayOf(row[k]); if (d == null) return; any = true; maxDay = Math.max(maxDay, d);
        if (h[0] === 'tower' || h[0] === 'nacelle' || h[0] === 'blades') r[h[0]] = d; else { r[h[0]] = r[h[0]] || [null, null]; r[h[0]][h[1]] = d; } });
      if (any) real.wtg[i] = r; }
    if (!head) throw new Error('В таблице нет строки заголовков: первая ячейка должна быть «ВЭУ»');
    if (!Object.keys(real.wtg).length) throw new Error('В таблице нет ни одной даты по ВЭУ');
    if (real.day == null) real.day = maxDay; return real; }
  function fromCsv(text) { text = text.replace(/^﻿/, ''); const first = text.split(/\r?\n/).find(l => /;|,|\t/.test(l)) || '', sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ((first.match(/\t/g) || []).length > (first.match(/;/g) || []).length ? '\t' : ';') : ',';
    return text.split(/\r?\n/).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim())); }
  // Excel: архив zip, внутри лист и общие строки в XML
  async function fromXlsx(buf) { const dv = new DataView(buf), u8 = new Uint8Array(buf), td = new TextDecoder(); let eo = buf.byteLength - 22; while (eo >= 0 && dv.getUint32(eo, true) !== 0x06054b50) eo--; if (eo < 0) throw new Error('Файл не похож на Excel');
    const cnt = dv.getUint16(eo + 10, true); let p = dv.getUint32(eo + 16, true); const files = {};
    for (let k = 0; k < cnt; k++) { const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true), name = td.decode(u8.subarray(p + 46, p + 46 + nl)); files[name] = { method, csz, lo }; p += 46 + nl + el + cl; }
    const read = async name => { const f = files[name]; if (!f) return null; const nl = dv.getUint16(f.lo + 26, true), el = dv.getUint16(f.lo + 28, true), data = u8.subarray(f.lo + 30 + nl + el, f.lo + 30 + nl + el + f.csz);
      if (f.method === 0) return td.decode(data); const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(data); w.close(); return await new Response(ds.readable).text(); };
    const xml = t => new DOMParser().parseFromString(t, 'application/xml'), ssx = await read('xl/sharedStrings.xml'), strs = ssx ? [...xml(ssx).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
    const sheet = Object.keys(files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0]; if (!sheet) throw new Error('В файле Excel нет листа');
    const rows = []; for (const r of xml(await read(sheet)).getElementsByTagName('row')) { const row = []; for (const c of r.getElementsByTagName('c')) { const ref = c.getAttribute('r') || '', col = [...ref.replace(/\d/g, '')].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1, t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], is = c.getElementsByTagName('is')[0];
        row[col] = t === 's' ? strs[+v.textContent] : t === 'inlineStr' ? (is ? is.textContent : '') : v ? (t === 'str' ? v.textContent : +v.textContent) : ''; } rows.push(row); }
    return rows; }
  async function fromFile(file) { const buf = await file.arrayBuffer(); if (/\.xlsx$/i.test(file.name)) return fromRows(await fromXlsx(buf), file.name);
    let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1251').decode(buf); } return fromRows(fromCsv(text), file.name); }
  function template() { const h = ['ВЭУ', 'Дорога начало', 'Дорога конец', 'Площадка начало', 'Площадка конец', 'Фундамент начало', 'Фундамент конец', 'Башня на площадке', 'Гондола на площадке', 'Лопасти на площадке', 'Монтаж начало', 'Монтаж конец', 'Кабель начало', 'Кабель конец', 'Пуск'];
    return '﻿' + [['Дата отчёта', 'дд.мм.гггг'], ['Подстанция, % готовности', ''], ['ВЛ до ПС Жамбыл, % готовности', ''], ['ВЛ до ПС Кентау, % готовности', ''], ['Накопитель, % готовности', ''], h, ...SITE.wtg.map(w => [w[0], ...h.slice(1).map(() => '')])].map(r => r.join(';')).join('\r\n'); }
  function apply(real, save = true) { E.loadFact(real); if (save) try { real ? localStorage.setItem('jambyl-fact', JSON.stringify(real)) : localStorage.removeItem('jambyl-fact'); } catch (e) {}
    if (real) S.bday = Math.max(0, Math.min(E.MAXD, real.day)); if (S.stage === 'build') setStage('build', false); }
  try { const saved = JSON.parse(localStorage.getItem('jambyl-fact') || 'null'); if (saved && saved.day != null) { E.loadFact(saved); S.bday = Math.max(0, Math.min(E.MAXD, saved.day)); } } catch (e) {}
  $('#right').addEventListener('click', e => { const b = e.target.closest('[data-fact]'); if (!b) return; const k = b.dataset.fact;
    if (k === 'load') $('#b-file').click(); else if (k === 'demo') apply(null);
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([template()], { type: 'text/csv;charset=utf-8' })); a.download = 'Жамбыл_факт_стройки_шаблон.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } });
  $('#right').addEventListener('change', async e => { if (e.target.id !== 'b-file' || !e.target.files[0]) return; const st = $('#status');
    try { apply(await fromFile(e.target.files[0])); st.textContent = ''; } catch (err) { st.textContent = 'Отчёт не загружен: ' + err.message; setTimeout(() => { if (st.textContent.startsWith('Отчёт')) st.textContent = ''; }, 8000); } });
  return { fromRows, fromCsv, fromXlsx, fromFile, template, apply };
})();
window.__twin.FACT = FACT;

/* ---------- подложка: издалека приглушена, чтобы читались метки; вблизи — естественная ---------- */
function terTone() { if (!terMat.userData.img) return; const d = camera.position.distanceTo(controls.target), k = Math.max(0, Math.min(1, (d - 700) / 5000)); terMat.color.setHex(0xd6d6d6).lerp(new THREE.Color(0x7f858c), k); }
controls.addEventListener('change', terTone);

/* ---------- погода: прогноз Open-Meteo по координатам площадки → ветер на оси, выработка на 7 дней ---------- */
var WX = null;      // var: карточка погоды рисуется раньше, чем выполнится эта строка
const WMO = c => c === 0 ? ['☀️', 'ясно'] : c <= 2 ? ['🌤️', 'малооблачно'] : c === 3 ? ['☁️', 'пасмурно'] : c <= 48 ? ['☁️', 'туман'] : c <= 67 ? ['🌧️', 'дождь'] : c <= 77 ? ['❄️', 'снег'] : c <= 82 ? ['🌦️', 'ливни'] : c <= 86 ? ['🌨️', 'снегопад'] : ['⛈️', 'гроза'];
function parkMw(vHub, dir, temp) { const a = new Float32Array(N), r = new Float32Array(N), on = new Uint8Array(N), vv = new Float32Array(N), dd = new Float32Array(N);
  for (let i = 0; i < N; i++) { a[i] = vHub * W.speedUp(W.elev[i], hMean); r[i] = W.density(W.elev[i] + T.hub, temp); on[i] = a[i] >= T.cutIn && a[i] < T.cutOut ? 1 : 0; }
  W.wake(dir, a, r, on, vv, dd); let p = 0; for (let i = 0; i < N; i++) if (on[i]) p += W.power(vv[i], r[i]); return Math.min(1000, p / 1000 * 0.97); }      // 3 % — потери в кабелях и трансформаторах
async function loadWeather() {
  try { const M = SITE.meta, u = `https://api.open-meteo.com/v1/forecast?latitude=${M.lat0.toFixed(2)}&longitude=${M.lon0.toFixed(2)}&hourly=wind_speed_120m,wind_direction_120m,temperature_2m&daily=weather_code,temperature_2m_max,temperature_2m_min&wind_speed_unit=ms&timezone=auto&forecast_days=7`;
    const j = await (await fetch(u)).json(), H = j.hourly, hours = H.time.map((t, k) => ({ t, v: H.wind_speed_120m[k], dir: H.wind_direction_120m[k], temp: H.temperature_2m[k] })).filter(h => h.v != null);
    if (hours.length < 48) throw new Error('мало данных'); const mw = hours.map(h => parkMw(h.v, h.dir, h.temp));
    const days = j.daily.time.map((d, k) => { const sl = mw.slice(k * 24, k * 24 + 24), vs = hours.slice(k * 24, k * 24 + 24).map(h => h.v); return { d, code: j.daily.weather_code[k], tmax: j.daily.temperature_2m_max[k], tmin: j.daily.temperature_2m_min[k], gwh: sl.reduce((a, b) => a + b, 0) / 1000, v: vs.reduce((a, b) => a + b, 0) / Math.max(1, vs.length) }; });
    WX = { hours, mw, days, at: new Date() }; W.setLive(hours.slice(0, 25)); S.day = 'live'; if (!RIGHT.ops.includes('value="live"')) RIGHT.ops = RIGHT.ops.replace('<select id="sc-day">', '<select id="sc-day"><option value="live">По прогнозу погоды</option>'); const now = new Date(), tz = (j.utc_offset_seconds || 0) / 60, loc = new Date(now.getTime() + (tz + now.getTimezoneOffset()) * 60000); S.min = Math.round((loc.getHours() * 60 + loc.getMinutes()) / 5) * 5; WX.nowMin = S.min;
    buildCurve(); if (S.stage === 'ops') setStage('ops', false);
  } catch (e) { console.warn('weather', e); WX = { err: true }; if (S.stage === 'ops') renderWx(); }
}
function renderWx() { const el = $('#wx'); if (!el) return; const pill = $('#wx-pill');
  if (!WX) { pill.textContent = 'загружаю'; el.innerHTML = '<p class="note" style="margin:0">Запрашиваю прогноз погоды для площадки…</p>'; return; }
  if (WX.err) { pill.textContent = 'нет связи'; el.innerHTML = '<p class="note" style="margin:0">Сервис прогноза недоступен. Ветер берётся из сценария ниже.</p>'; return; }
  const mx = Math.max(...WX.days.map(d => d.gwh), 1); pill.textContent = 'на 7 дней';
  el.innerHTML = `<div class="wx">${WX.days.map((d, k) => { const dt = new Date(d.d + 'T12:00:00'), w = WMO(d.code); return `<div title="${w[1]}"><span>${k ? dt.toLocaleDateString('ru-RU', { weekday: 'short' }) : 'сегодня'}</span><i>${w[0]}</i><b>${fmt(d.tmax)}°</b><em>${fmt(d.v, 1)} м/с</em><u><s style="height:${Math.max(4, d.gwh / mx * 100)}%"></s></u><b>${fmt(d.gwh, 1)}</b></div>`; }).join('')}</div>
    <p class="note">Нижнее число — выработка парка за сутки, ГВт·ч: ветер прогноза на 120 м пропущен через следы и кривую мощности. За неделю ${fmt(WX.days.reduce((a, d) => a + d.gwh, 0))} ГВт·ч. Прогноз Open-Meteo, обновлён в ${WX.at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}.</p>`; }
/* приборы в карточке ВЭУ: ветер, загрузка, мощность через 30 минут, суточный ход этой турбины */
function wtgDash(i) { const k = v[i] > 0.1 && live.w ? v[i] / live.w.v : W.speedUp(W.elev[i], hMean), at = m => { const w = W.windAt(Math.min(1439, m), S.day); return built[i] && fault[i] !== 3 && fault[i] !== 4 ? W.power(w.v * k, rho[i]) : 0; };
  const day = []; for (let m = 0; m < 1440; m += 30) day.push(at(m)); const p30 = at(S.min + 30), ld = pw[i] / T.rated * 100, dE = eAct[i] / 1000;      // та же цифра, что в сравнении расчёта и факта
  return `<div class="tiles" style="margin:8px 0 4px"><div class="tile"><label>Ветер на роторе</label>${gauge(v[i] / 25 * 100, fmt(v[i], 1), 'м/с')}</div>
    <div class="tile"><label>Загрузка</label>${gauge(ld, fmt(ld) + ' %', 'от ' + fmt(T.rated / 1000, 2) + ' МВт')}</div>
    <div class="tile"><label>Через 30 минут</label><div class="v">${fmt(p30 / 1000, 2)}<small>МВт</small></div><div class="s">${p30 > pw[i] * 1.03 ? 'растёт' : p30 < pw[i] * .97 ? 'падает' : 'без изменений'}</div></div>
    <div class="tile"><label>За сутки</label><div class="v">${fmt(dE, 1)}<small>МВт·ч</small></div><div class="viz">${spark(day, S.min / 1440)}</div></div></div>`; }
loadWeather();

/* ---------- стройка: слои проекта, карточка ВЭУ, журнал действий ---------- */
var JOURNAL = []; try { JOURNAL = JSON.parse(localStorage.getItem('jambyl-journal') || '[]'); } catch (e) {}
const J_KIND = { qa: 'Запрошена приёмка ОТК', report: 'Суточный отчёт', mob: 'Заявка на материалы и кран' };
function layersTree() { const D = S.bday, L = E.layers(D), pc = x => fmt(x * 100) + ' %', short = t => t.replace('В работе: ', '').replace('башня: ', 'башня, ').replace('Башня: ', 'башня, ').replace(' установлены', '').toLowerCase();
  const list = (a, withStage) => a.length ? `<div class="wl">${a.slice(0, 5).map(i => `<button data-w="${i}">${wName(i)}${withStage ? '<em>' + short(E.detail(i, D).stage) + '</em>' : ''}</button>`).join('')}${a.length > 5 ? `<span>и ещё ${a.length - 5}</span>` : ''}</div>` : '<p>Сейчас работы не ведутся.</p>';
  const g = (title, sum, body, open) => `<details${open ? ' open' : ''}><summary><b>${title}</b><span>${sum}</span></summary>${body}</details>`, fNow = L.feeders.filter(f => f.p > 0 && f.p < 1).sort((a, b) => b.p - a.p);
  return `<div class="tree">` +
    g('Земляные работы', pc((L.road / L.roadQty + L.pad.done / N) / 2), `<p>Дороги: ${fmt(L.road)} из ${fmt(L.roadQty)} км</p><p>Монтажные площадки: ${L.pad.done} из ${N}${L.pad.now.length ? ', в работе ' + L.pad.now.length : ''}</p>`) +
    g('Фундаменты', `${L.found.done} из ${N}`, list(L.found.now, true)) +
    g('Кабельная сеть 35 кВ', `${L.mv.done} из ${N}`, (fNow.length ? fNow.slice(0, 4).map(f => `<p>Фидер ${f.f + 1}: подключено ${pc(f.p)}</p>`).join('') : '') + `<p>Готово фидеров: ${L.feeders.filter(f => f.p >= 1).length} из ${L.feeders.length}, не начато: ${L.feeders.filter(f => f.p <= 0).length}</p>`) +
    g('Монтаж ВЭУ', `${L.erect.done} из ${N}`, list(L.erect.now, true), true) +
    g('Подстанция, линии, накопитель', pc(L.ss), `<p>Подстанция 220/35 кВ: ${pc(L.ss)}</p><p>ВЛ до ПС Жамбыл: ${pc(L.ohlJ)}</p><p>ВЛ до ПС Кентау: ${pc(L.ohlK)}</p><p>Накопитель: ${pc(L.bess)}</p>`) +
    g('Пуск', `${L.com.done} из ${N}`, list(L.com.now, false)) + `</div>`; }
function buildCard(i) { const D = S.bday, b = bState[i], d = E.detail(i, D), obs = bm.open.filter(q => q.i === i), dt = x => fdate(E.dateOf(x)), pct = Math.round(d.pct * 100), jr = JOURNAL.filter(x => x.i === i).slice(-4).reverse();
  return `<div class="card-head"><span class="pill ${b.late > 14 ? 'bad' : b.late > 0 ? 'warn' : ''}"><i></i><span>${b.late > 0 ? 'отстаёт на ' + fmt(b.late) + ' дн.' : 'по графику'}</span></span>${X_BTN}</div>
    <h3 class="insp-title">${wName(i)}</h3><div class="insp-sub">Фидер ${W.feeder[i] + 1}. Состояние на ${dt(D)}</div>
    <div class="pbar"><i style="width:${pct}%"></i><b>${pct} %</b><span>${d.stage}</span></div>
    <div class="chips"><span class="${d.spi < .95 ? 'bad' : ''}">темп к плану ${fmt(d.spi, 2)}</span><span>по плану ${fmt(d.planPct * 100)} %</span><span class="${obs.length ? 'warn' : ''}">ОТК: ${obs.length ? 'открыто ' + obs.length : 'замечаний нет'}</span></div>
    <dl class="kv"><dt>Следующая веха</dt><dd>${d.next ? d.next.name : 'все работы закончены'}</dd>${d.next ? `<dt>Ожидается</dt><dd>${dt(d.next.day)}</dd>` : ''}</dl>
    <div class="insp-actions"><button class="btn" data-act="fly">Показать в сцене</button><button class="btn" data-act="tear">Разобрать в 3D</button></div>
    <h4>Ход работ</h4><div class="check">${d.steps.map(x => { const late = Math.round((x.done ? x.day : D) - x.plan); return `<div class="${x.done ? 'done' : x === d.next ? 'cur' : ''}"><i></i><span>${x.name}</span><em>${x.done ? dt(x.day) : 'план ' + dt(x.plan)}</em>${late > 0 && (x.done || D > x.plan) ? `<small>${x.done ? 'на ' + fmt(late) + ' дн. позже плана' : 'просрочено на ' + fmt(late) + ' дн.'}</small>` : ''}</div>`; }).join('')}</div>
    <h4>Материалы и кран</h4><div class="check mat">${d.parts.map(p => `<div class="${p.mounted || p.here ? 'done' : ''}"><i></i><span>${p.name} <u>${p.sn}</u></span><em>${p.mounted ? 'смонтировано' : p.here ? 'на площадке' : p.day != null ? 'в пути, ждём ' + dt(p.day) : 'нет данных'}</em></div>`).join('')}
      <div class="${/идёт/.test(d.crane) ? 'cur' : /снят/.test(d.crane) ? 'done' : ''}"><i></i><span>Кран и бригада</span><em>${d.crane}${d.craneDay != null ? dt(d.craneDay) : ''}</em></div></div>${d.demo ? '<p class="note">Поставки — по сценарию; номера комплектов условные.</p>' : '<p class="note">Номера комплектов условные: в отчёте их нет.</p>'}
    ${obs.length ? `<h4>Замечания ОТК</h4><div class="rows">${obs.map(q => `<div class="ev ${q.sev}"><i class="dot"></i><b>Замечание ${q.n}</b><em>${fmt(D - q.found)} дн.</em><span>${q.text}</span></div>`).join('')}</div>` : ''}
    <h4>Действия</h4><input class="jnote" id="j-note" placeholder="Заметка к записи" maxlength="140" autocomplete="off"><div class="insp-actions"><button class="btn" data-j="qa">Запросить приёмку ОТК</button><button class="btn" data-j="report">Суточный отчёт</button><button class="btn" data-j="mob">Заявка на материалы</button></div>
    ${jr.length ? `<div class="check jr">${jr.map(x => `<div class="done"><i></i><span>${J_KIND[x.kind]}${x.note ? ': ' + x.note.replace(/[<>&]/g, '') : ''}</span><em>${dt(x.day)}</em><small>${x.stage}, готовность ${x.pct} %</small></div>`).join('')}</div>` : '<p class="note">Записей по этой ВЭУ пока нет. Журнал хранится в этом браузере.</p>'}`; }
$('#insp').addEventListener('click', e => { const b = e.target.closest('[data-j]'); if (!b || !S.sel || S.sel.level !== 'wtg') return; const i = S.sel.i, d = E.detail(i, S.bday), n = $('#j-note');
  JOURNAL.push({ i, day: S.bday, kind: b.dataset.j, note: n ? n.value.trim() : '', stage: d.stage, pct: Math.round(d.pct * 100), at: Date.now() }); try { localStorage.setItem('jambyl-journal', JSON.stringify(JOURNAL.slice(-500))); } catch (err) {} renderInspector(); });
$('#legend').addEventListener('click', e => { const b = e.target.closest('[data-w]'), m = e.target.closest('[data-met]'); if (b) select({ level: 'wtg', i: +b.dataset.w }, true); if (m) { const x = MET[+m.dataset.met]; flyView([x.x - 420, 260, x.z + 520], [x.x, 60, x.z], 1400); } });

if (location.hash === '#build') setStage('build'); else if (location.hash === '#cost') setStage('cost'); else if (location.hash === '#wtg') openTurbine(0);

/* ═════════ эксплуатация: расчёт и факт, диагностика, метеомачты, лента SCADA ═════════ */
var diagG, metG;      // без начального значения: сцена собирается раньше, чем выполнится эта строка
function opsObjects() {          // жёлтые отметки над ВЭУ с ранними признаками отказа и метеомачты; пересобираются вместе с рельефом
  diagG = new THREE.Group(); const ym = new THREE.MeshBasicMaterial({ color: 0xf5b544, toneMapped: false });
  for (const d of DIAG) { const g = new THREE.Mesh(new THREE.OctahedronGeometry(11), ym); g.position.set(W.X[d.i], baseY[d.i] + T.hub + T.D / 2 + 26, W.Z[d.i]); diagG.add(g);
    const r = new THREE.Mesh(new THREE.TorusGeometry(34, 2.2, 8, 40), ym); r.rotation.x = Math.PI / 2; r.position.set(W.X[d.i], baseY[d.i] + 3, W.Z[d.i]); diagG.add(r); }
  metG = new THREE.Group(); const steel = new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: .6, metalness: .3 }), red = new THREE.MeshStandardMaterial({ color: 0xd9534a, roughness: .7 });
  for (const m of MET) { const y = ground(m.x, m.z); m.y = y; const h = m.kind === 'mast' ? 110 : m.kind === 'lidar' ? 2.2 : 10;
    if (m.kind === 'lidar') { const b = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 3), steel); b.position.set(m.x, y + 1.1, m.z); metG.add(b); }
    else { for (let k = 0; k < (m.kind === 'mast' ? 11 : 1); k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(m.kind === 'mast' ? 1.1 : .35, m.kind === 'mast' ? 1.1 : .35, h / (m.kind === 'mast' ? 11 : 1), 6), k % 2 ? steel : red); c.position.set(m.x, y + (k + .5) * h / (m.kind === 'mast' ? 11 : 1), m.z); c.castShadow = true; metG.add(c); }
      for (const hh of m.kind === 'mast' ? [110, 80, 50] : [10]) { const a = new THREE.Mesh(new THREE.BoxGeometry(m.kind === 'mast' ? 9 : 2.5, .5, .5), steel); a.position.set(m.x, y + hh - 1, m.z); metG.add(a); }
      if (m.kind === 'mast') { const pts = []; for (let k = 0; k < 3; k++) { const an = k * 2.094; pts.push(m.x, y + 105, m.z, m.x + Math.cos(an) * 70, ground(m.x + Math.cos(an) * 70, m.z + Math.sin(an) * 70), m.z + Math.sin(an) * 70); } const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); metG.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xcfd5dd, transparent: true, opacity: .6 }))); } }
    m.h = h; }
  dyn.add(diagG); dyn.add(metG); diagG.visible = metG.visible = S.stage === 'ops';
}
function metRead(m) { const w = live.w || { v: 0, dir: 0, temp: 10 }, k = fieldAt(m.x, m.z, 110) || 1, v110 = w.v * k, sh = h => v110 * Math.pow(h / 110, 0.14), n = MET.indexOf(m), j = Math.sin(S.min / 7 + n * 2.1);
  const p = 1013.25 * Math.pow(1 - 2.25577e-5 * (m.y || hMean), 5.25588); return { v110, v80: sh(80), v50: sh(50), v10: sh(10), dir: (w.dir + 4 * j + 360) % 360, temp: w.temp + (m.kind === 'mast' ? -.6 : .4) + .3 * j, p, rh: Math.max(18, Math.min(92, 62 - (w.temp - 8) * 2.1 + 5 * j)), rho: W.density((m.y || hMean) + 110, w.temp), ti: Math.max(6, 18 - v110 * .55 + 2 * j) }; }
function opsMarks() {          // метки над сценой: диагностика — жёлтые, датчики — с показаниями
  Object.keys(labels).filter(k => k[0] === 'd' || k[0] === 'm').forEach(k => { labels[k].el.remove(); delete labels[k]; }); if (S.stage !== 'ops') return;
  DIAG.slice(0, S.mode === 'diag' ? 5 : PHONE ? 1 : 3).forEach((d, k) => addLabel('d' + k, new THREE.Vector3(W.X[d.i], baseY[d.i] + T.hub + T.D / 2 + 40, W.Z[d.i]), `<i></i><b>${wName(d.i)}</b><span>${d.comp.toLowerCase()} · ${d.days} дн.</span>`, 'diag', () => select({ level: 'wtg', i: d.i }, true), 'wtg:' + d.i));
  if (S.mode === 'met') MET.forEach((m, k) => { const r = metRead(m); addLabel('m' + k, new THREE.Vector3(m.x, (m.y || 0) + m.h + 18, m.z), `<i></i><b>${m.id}</b><span>${fmt(m.kind === 'ws' ? r.v10 : r.v110, 1)} м/с · ${compass(r.dir)} · ${fmt(r.temp, 1)} °C</span>`, 'met', () => flyView([m.x - 420, 260, m.z + 520], [m.x, 60, m.z], 1400)); });
}
function opsLegend(css) {
  if (S.mode === 'pf') { let ex = 0, ac = 0, down = 0, under = 0; const lag = []; for (let i = 0; i < N; i++) { ex += eExp[i]; ac += eAct[i]; const lost = eExp[i] - eAct[i], stop = fault[i] === 3 || fault[i] === 4 || tripped[W.feeder[i]]; if (stop) down += lost; else { under += lost; if (eExp[i] > 50 && eAct[i] / eExp[i] < 0.97) lag.push(i); } }
    lag.sort((a, b) => eAct[a] / eExp[a] - eAct[b] / eExp[b]);
    return `<h2>Расчёт и факт за сутки</h2><div class="ramp" style="background:${css(RF)}"></div><div class="ticks"><span>в расчёте</span><span>−7 %</span><span>−15 %</span></div>
      <dl class="kv" style="margin-top:10px"><dt>Расчёт</dt><dd>${fmt(ex / 1000)} МВт·ч</dd><dt>Факт</dt><dd class="${ac / ex < .97 ? 'bad' : ''}">${fmt(ac / 1000)} МВт·ч, ${ex > 1 ? '−' + fmt((1 - ac / ex) * 100, 1) + ' %' : '—'}</dd><dt>Простои и отключения</dt><dd>−${fmt(down / 1000)} МВт·ч</dd><dt>Недовыполнение в работе</dt><dd>−${fmt(under / 1000)} МВт·ч</dd></dl>
      <h3 class="lg-h">Отстают от расчёта: ${lag.length}</h3><div class="lg-list">${lag.slice(0, 7).map(i => `<button data-w="${i}"><b>${wName(i)}</b><em>−${fmt((1 - eAct[i] / eExp[i]) * 100, 1)} %</em><span>${perfText[i] || faultText[i] || 'разброс в пределах нормы'}</span></button>`).join('') || '<p class="note">Все работающие ВЭУ — в пределах 3 % от расчёта.</p>'}</div>
      <p class="note">Расчёт — кривая мощности с учётом ветра на роторе, следов и плотности воздуха. Серые — ветра не было.</p>`; }
  if (S.mode === 'diag') return `<h2>Ранние признаки отказа</h2><div class="lg-list">${DIAG.map(d => `<button data-w="${d.i}" class="${d.days < 21 ? 'hot' : ''}"><b>${wName(d.i)}</b><em>${d.days} дн.</em><span>${d.comp}: ${d.par.toLowerCase()} ${fmt(d.cur, 1)} ${d.unit}, порог ${fmt(d.alarm, 1)}</span></button>`).join('')}</div>
    <p class="note">ВЭУ работают без аварий. Срок — когда тренд последних трёх недель дойдёт до порога отключения. Жёлтая отметка над ВЭУ — в любом слое.</p>`;
  return `<h2>Метеомачты и датчики</h2><div class="lg-list met">${MET.map((m, k) => { const r = metRead(m); return `<button data-met="${k}"><b>${m.name}</b><em>${fmt(m.kind === 'ws' ? r.v10 : r.v110, 1)} м/с</em><span>${m.kind === 'mast' ? `110 / 80 / 50 м: ${fmt(r.v110, 1)} / ${fmt(r.v80, 1)} / ${fmt(r.v50, 1)} м/с · ${compass(r.dir)} ${fmt(r.dir)}°<br>${fmt(r.temp, 1)} °C · ${fmt(r.p)} гПа · влажность ${fmt(r.rh)} % · турбулентность ${fmt(r.ti)} %` : m.kind === 'lidar' ? `профиль 200 / 110 / 40 м: ${fmt(r.v110 * Math.pow(200 / 110, .14), 1)} / ${fmt(r.v110, 1)} / ${fmt(r.v110 * Math.pow(40 / 110, .14), 1)} м/с · ${compass(r.dir)}` : `10 м · ${compass(r.dir)} ${fmt(r.dir)}° · ${fmt(r.temp, 1)} °C · ${fmt(r.p)} гПа · влажность ${fmt(r.rh)} %`}</span></button>`; }).join('')}</div>
    <dl class="kv" style="margin-top:8px"><dt>Плотность воздуха на оси</dt><dd>${fmt(metRead(MET[1]).rho, 3)} кг/м³</dd><dt>Обледенение</dt><dd>${live.w && live.w.temp < 1 ? 'возможно' : 'нет'}</dd></dl><p class="note">Показания меняются со временем суток и сценарием погоды. Нажмите на строку — камера перейдёт к датчику.</p>`;
}
function pfBox(i) { if (eExp[i] < 50) return ''; const r = eAct[i] / eExp[i], lost = (eExp[i] - eAct[i]) / 1000;
  return `<dl class="kv pfbox"><dt>Расчёт за сутки</dt><dd>${fmt(eExp[i] / 1000, 1)} МВт·ч</dd><dt>Факт за сутки</dt><dd class="${r < .9 ? 'bad' : ''}">${fmt(eAct[i] / 1000, 1)} МВт·ч, ${r >= .995 ? 'в расчёте' : '−' + fmt((1 - r) * 100, 1) + ' %'}</dd>${r < .97 ? `<dt>Потеряно</dt><dd>${fmt(lost, 1)} МВт·ч · ${perfText[i] || faultText[i] || 'простой'}</dd>` : ''}</dl>`; }
function diagBox(i) { const d = diagOf.get(i); if (!d) return ''; const w = 300, h = 86, lo = Math.min(...d.ser, d.base) * .9, hi = d.alarm * 1.06, n = 60 + Math.min(40, d.days), X = k => (k / (n - 1) * w).toFixed(1), Y = x => (h - 4 - (x - lo) / (hi - lo) * (h - 10)).toFixed(1);
  return `<div class="diag"><div class="card-head"><h2>${d.comp}: ранний признак отказа</h2></div><svg viewBox="0 0 ${w} ${h}" style="display:block;width:100%;height:auto"><line x1="0" x2="${w}" y1="${Y(d.alarm)}" y2="${Y(d.alarm)}" stroke="#ff6452" stroke-dasharray="4 3"/><line x1="0" x2="${w}" y1="${Y(d.warn)}" y2="${Y(d.warn)}" stroke="#f5b544" stroke-dasharray="2 4"/>
    <polyline points="${d.ser.map((x, k) => X(k) + ',' + Y(x)).join(' ')}" fill="none" stroke="#f5b544" stroke-width="1.8"/><line x1="${X(59)}" y1="${Y(d.cur)}" x2="${X(59 + Math.min(40, d.days))}" y2="${Y(Math.min(d.alarm, d.cur + d.slope * Math.min(40, d.days)))}" stroke="#f5b544" stroke-width="1.4" stroke-dasharray="5 4"/><circle cx="${X(59)}" cy="${Y(d.cur)}" r="3.2" fill="#f5b544"/>
    <text x="${w - 2}" y="${+Y(d.alarm) - 3}" font-size="8.5" text-anchor="end" fill="#ff9d90">порог ${fmt(d.alarm, 1)} ${d.unit}</text><text x="2" y="${h - 1}" font-size="8.5" fill="#aab3c4">60 суток назад</text><text x="${X(59)}" y="${h - 1}" font-size="8.5" text-anchor="middle" fill="#aab3c4">сегодня</text></svg>
    <dl class="kv"><dt>${d.par}</dt><dd class="warn">${fmt(d.cur, 1)} ${d.unit}, норма до ${fmt(d.warn, 1)}</dd><dt>Рост</dt><dd>${fmt(d.slope * 7, 2)} ${d.unit} в неделю</dd><dt>Порог будет достигнут</dt><dd>${d.date}, через ${d.days} дн.</dd><dt>Что сделать</dt><dd style="white-space:normal;text-align:right">${d.rec}</dd></dl></div>`; }
/* лента SCADA: имитация потока тегов, значения берутся из модели на текущую минуту */
function scadaTick() { if (SCADA.paused || S.stage !== 'ops' || document.hidden || !live.w) return; const t = new Date().toLocaleTimeString('ru-RU'), add = (tag, val, unit, cls) => SCADA.rows.unshift({ t, tag, val, unit, cls });
  for (let k = 0; k < 2; k++) { const i = Math.random() < .25 && DIAG.length ? DIAG[Math.floor(Math.random() * DIAG.length)].i : Math.floor(Math.random() * N), n = wName(i), tp = temps(i), jit = 1 + (Math.random() - .5) * .02, dg = diagOf.get(i), kind = Math.floor(Math.random() * 5), bad = st[i] === 3 || st[i] === 6;
    if (kind === 0) add(n + '.GRD.P', fmt(pw[i] * jit), 'кВт', bad ? 'bad' : ''); else if (kind === 1) add(n + '.NAC.WS', fmt(v[i] * jit, 1), 'м/с', ''); else if (kind === 2) add(n + '.ROT.RPM', fmt(rpm[i] < 1 ? 0 : rpm[i] * jit, 1), 'об/мин', bad ? 'bad' : '');
    else if (kind === 3) add(n + '.GBX.OILT', fmt(tp.gear * jit, 1), '°C', dg && dg.key === 'gear' ? 'warn' : ''); else add(n + '.GEN.BRGT', fmt(tp.gen * jit, 1), '°C', dg && dg.key === 'gen' ? 'warn' : tp.gen > 95 ? 'bad' : ''); }
  const q = Math.random(), kq = Math.min(curve.length - 1, Math.round(S.min / 10)); if (q < .3) add('SS.220.P', fmt(curve[kq] * (1 + (Math.random() - .5) * .01), 1), 'МВт', ''); else if (q < .5) add('BESS.SOC', fmt(soc[kq] * 100, 1), '%', ''); else if (q < .75) { const m = MET[Math.floor(Math.random() * 3)]; add('MET.' + m.id + '.WS110', fmt(metRead(m).v110 * (1 + (Math.random() - .5) * .03), 1), 'м/с', ''); } else add('GRID.F', fmt(AGC.f, 3), 'Гц', Math.abs(AGC.f - 50) > .1 ? 'warn' : '');
  SCADA.rows.length = Math.min(SCADA.rows.length, 9); renderScada(); }
function renderScada() { const el = $('#scada'); if (!el) return; el.innerHTML = SCADA.rows.length ? SCADA.rows.map(r => `<div class="${r.cls}"><time>${r.t}</time><b>${r.tag}</b><span>${r.val} <small>${r.unit}</small></span></div>`).join('') : '<p class="empty">Ждём первые значения…</p>'; const b = $('#sc-pause'); if (b) b.textContent = SCADA.paused ? 'Продолжить' : 'Пауза'; }
setInterval(scadaTick, 1100);
$('#right').addEventListener('click', e => { if (e.target.id === 'sc-pause') { SCADA.paused = !SCADA.paused; renderScada(); } });
