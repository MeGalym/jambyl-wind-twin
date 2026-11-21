/* Стройка одной ВЭУ в 3D: от подъезда и котлована до пуска. Одна шкала b = 0…10 ведёт всю сцену.
   Фундамент — по чертежу 104218-CI-DW-040: плита Ø26 м, подошва −2,70, откос котлована 1:4, подбетонка C16/20 100 мм,
   приямок под нижним кольцом C40/50, плита C35/45, подколонник Ø6,6 м C50/60 до +1,00, 2 × 100 болтов M48 на Ø4782 и Ø4346,
   обратная засыпка слоями 300 мм до +1,00. Заземление — по 104218-EL-DW-040: полоса 60 × 6 мм, внутреннее и наружное кольца, электроды.
   Раскладка арматуры типовая: в чертеже есть только масса (81,8 т). Размеры площадки, техника и длительность операций условные. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createSite, H } from './site3d.js?v=2';

const $ = q => document.querySelector(q);
const P = new URLSearchParams(location.hash.slice(1)), CFG = { wtg: P.get('wtg') || 'ВЭУ', now: Math.max(0, Math.min(10, +(P.get('b') ?? 10))), f: (P.get('f') || '').split(',').filter(Boolean), pl: (P.get('pl') || '').split(',').filter(Boolean), d: P.get('d') || '' };
const canvas = $('#gl'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.localClippingEnabled = true;
const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 5000), controls = new OrbitControls(camera, canvas);
Object.assign(controls, { enableDamping: true, dampingFactor: .08, minDistance: 6, maxDistance: 900, maxPolarAngle: Math.PI * .497, zoomToCursor: true });
const site = createSite(), { scene, sun, build } = site, { RT, R1, rb, y0, SL } = site.K, tv = new THREE.Vector3();

/* ---------- подписи: что сейчас делают и выноски с цифрами чертежа ---------- */
const STEPS = ['Подъезд', 'Монтажная площадка', 'Котлован и арматура', 'Бетонирование фундамента', 'Башня: нижние и средние секции', 'Башня: верхняя секция', 'Гондола и ступица', 'Лопасти', 'Кабель 35 кВ', 'Пусконаладка и пуск'];
const OPS = [[0, 'Земляное полотно дороги'], [.5, 'Щебёночное покрытие и уплотнение катком'], [1, 'Планировка крановой площадки'], [1.45, 'Отсыпка щебнем и уплотнение площадки'], [2, 'Разработка котлована: подошва на −2,80, откос 1:4'], [2.25, 'Подбетонка C16/20 толщиной 100 мм'], [2.32, 'Анкерная корзина: 2 × 100 болтов M48 класса 10.9'], [2.46, 'Закладные трубы под кабель 35 кВ и оптику'],
  [2.52, 'Нижняя сетка: радиальные стержни'], [2.62, 'Нижняя сетка: кольцевые стержни'], [2.72, 'Фиксаторы и верхняя сетка по уклону плиты'], [2.84, 'Кольца верхней сетки и каркас подколонника'], [2.92, 'Внутреннее кольцо заземления, опалубка'], [3.02, 'Бетон приямка под нижним кольцом: C40/50, 9,7 м³'], [3.08, 'Бетонирование плиты без перерыва: C35/45, 636,6 м³'], [3.5, 'Подколонник: C50/60, 34,2 м³'],
  [3.6, 'Снятие опалубки, уход за бетоном, набор прочности'], [3.72, 'Наружное кольцо заземления: полоса 60 × 6 мм, электроды'], [3.86, 'Обратная засыпка слоями по 300 мм с уплотнением'], [4, 'Краны на площадке. Секция 1: кантовка двумя кранами, установка на анкерные болты'], [4.37, 'Секция 2: стык фланцев на отметке 22,4 м, затяжка болтов'], [4.68, 'Секция 3: стык на отметке 43,7 м'], [5, 'Секция 4: стык на отметке 64,9 м'], [5.5, 'Секция 5: стык на отметке 86,2 м, верх башни'], [6, 'Гондола: подъём на опорно-поворотное устройство, ось 110 м'], [6.62, 'Ступица: стыковка с фланцем главного вала'],
  [7, 'Лопасть 1: подъём горизонтально на траверсе, стыковка со ступицей'], [7.33, 'Ротор провёрнут на 120°. Лопасть 2'], [7.67, 'Лопасть 3'], [8, 'Траншея и кабель 35 кВ к подстанции'], [8.6, 'Засыпка траншеи, подключение ячейки 35 кВ'], [9, 'Кран уходит к следующей ВЭУ. Проверки без напряжения'], [9.3, 'Синхронизация с сетью и пробный пуск 24 часа']];
const TAGS = [[2.05, 2.5, [RT, 0, 0], 'Откос 1:4, глубина 2,8 м'], [2.26, 2.6, [9, -2.7, 6], 'Подбетонка C16/20, 100 мм'], [2.34, 3.0, [R1, 1.3, 0], '2 × 100 болтов M48, кл. 10.9 · Ø4782 и Ø4346'], [2.47, 3.0, [12, -3, 0], 'Закладные трубы'], [2.55, 3.05, [8, -2.6, -6], 'Арматура S500 · 81,8 т на фундамент'],
  [3.1, 3.62, [9, -1.6, 5], 'Плита Ø26 м · C35/45 · 636,6 м³'], [3.5, 3.9, [3.3, .6, 0], 'Подколонник Ø6,6 м · C50/60 · 34,2 м³'], [3.73, 4.0, [14, -2.6, 0], 'Заземление: полоса 60 × 6 мм, не более 4 Ом'], [3.88, 4.3, [10, .8, 6], 'Засыпка слоями 300 мм, плотность от 1700 кг/м³'],
  [4.05, 6, [rb, 12, 0], 'Башня: 5 секций, у основания Ø4,56 м'], [6.6, 7.0, [0, H - 2.6, 2], 'Опорно-поворотное устройство'], [6.02, 7, [0, H + 3, -6], 'Гондола: редуктор, генератор, трансформатор'], [7, 8, [-40, H, 7.4], 'Лопасть 95,4 м'], [8.05, 9, [60, 0, 0], 'Кабель 35 кВ к подстанции'], [9.4, 10.1, [0, H, 7.4], 'Ротор 195 м, ось 110 м']];
const tagEls = TAGS.map(t => { const d = document.createElement('div'); d.className = 'tag'; d.innerHTML = `<i></i><span>${t[3]}</span>`; $('#tags').appendChild(d); return d; }), v3 = new THREE.Vector3();
const CAMS = [[0, [60, 78, 150], [-110, 0, -4]], [1, [34, 60, 96], [-36, 0, 0]], [2, [27, 15, 36], [0, -1.6, 0]], [2.3, [15, 9, 21], [0, -1.6, 0]], [2.52, [20, 12.5, 26], [0, -1.8, 0]], [3, [30, 17, 37], [3, -1, 0]], [3.72, [30, 16, 38], [0, -.6, 0]], [4, [-156, 66, 214], [-16, 46, 0]], [7, [-208, 96, 268], [-24, 70, 0]], [8, [126, 62, 150], [44, 8, 0]], [9, [-170, 84, 236], [0, 70, 0]]];

/* ---------- управление ---------- */
const DUR = [5, 6, 26, 22, 16, 11, 12, 15, 6, 8], S = { b: CFG.now, play: false, cam: -1, speed: 1, dock: '' }, has = CFG.f.length === 10; let tween = null;
function flyTo(p, a, ms = 1500) { tween = { t0: performance.now(), ms, p0: camera.position.clone(), p1: new THREE.Vector3(...p), a0: controls.target.clone(), a1: new THREE.Vector3(...a) }; }
function autoCam(ms) { let i = 0; while (i < CAMS.length - 1 && CAMS[i + 1][0] <= S.b) i++; if (i === S.cam) return; S.cam = i; if (ms === 0) { camera.position.set(...CAMS[i][1]); controls.target.set(...CAMS[i][2]); tween = null; } else flyTo(CAMS[i][1], CAMS[i][2], ms); }
$('#b-title').textContent = CFG.wtg + ' · стройка'; $('#b-sub').textContent = 'SANY SI-19580, ротор 195 м, ось 110 м' + (CFG.d ? ' · на ' + CFG.d : '');
$('#b-rows').innerHTML = STEPS.map((s, k) => `<button class="row" data-s="${k}"><i></i><span>${k + 1}. ${s}</span><em>${has ? CFG.f[k] : ''}</em></button>`).join(''); $('#b-now').style.left = CFG.now * 10 + '%'; $('#b-now').hidden = !has; if (!has) $('[data-b=now]').textContent = 'Готовая ВЭУ';
let lastHud = -1, lastPlay = null;
function hud() { if (Math.abs(S.b - lastHud) < .003 && lastPlay === S.play) return; lastHud = S.b; lastPlay = S.play; const k = Math.min(9, Math.floor(S.b)), r = $('#b-range'); if (document.activeElement !== r) r.value = S.b; r.style.setProperty('--p', S.b * 10 + '%');
  let op = OPS[0][1]; for (const o of OPS) if (o[0] <= S.b) op = o[1]; $('#b-n').textContent = S.b >= 10 ? 'ВЭУ в работе' : `Шаг ${k + 1} из 10 · ${Math.round((S.b - k) * 100)} %`; $('#b-t').textContent = STEPS[k]; $('#b-op').textContent = S.b >= 10 ? 'Стройка закончена: ВЭУ выдаёт энергию в сеть.' : op;
  $('#b-play').textContent = S.play ? '❚❚ Пауза' : S.b >= 10 ? '↺ Ещё раз' : '▶ Показать стройку';
  $('#b-kv').innerHTML = has ? `<dt>${k < Math.floor(CFG.now) ? 'Сделано' : 'Прогноз'}</dt><dd>${CFG.f[k]}</dd><dt>По плану</dt><dd>${CFG.pl[k] || '—'}</dd>` : ''; $('#b-st').textContent = has ? (CFG.now >= 10 ? 'На дату ВЭУ в работе.' : 'На дату: шаг ' + (Math.floor(CFG.now) + 1) + ' — ' + STEPS[Math.min(9, Math.floor(CFG.now))].toLowerCase() + '.') : '';
  document.querySelectorAll('#b-rows .row').forEach((x, j) => { x.classList.toggle('sel', j === k && S.b < 10); x.classList.toggle('done', has && j < Math.floor(CFG.now + 1e-6)); x.classList.toggle('cur', has && j === Math.floor(CFG.now) && CFG.now < 10); }); }
document.addEventListener('click', e => { const s = e.target.closest('[data-s]'), a = e.target.closest('[data-b]'); if (s) { S.b = +s.dataset.s; S.play = true; S.cam = -1; autoCam(900); return; } if (!a) return; const k = a.dataset.b;
  if (k === 'start') { S.b = 0; S.play = true; } else if (k === 'play') { if (S.b >= 10) S.b = 0; S.play = !S.play; } else if (k === 'now') { S.b = CFG.now; S.play = false; } else if (k === 'sec') { const section = !site.section; site.setSection(section); a.classList.toggle('on', section); if (section && S.b < 4.05) flyTo([4, 7.5, 47], [0, -1.4, 0], 1100); else { S.cam = -1; autoCam(900); } return; } else if (k === 'speed') { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? .5 : 1; a.textContent = '× ' + String(S.speed).replace('.', ','); return; }
  else if (k === 'units') { location.href = 'wtg.html?v=13#wtg=' + encodeURIComponent(CFG.wtg); return; } S.cam = -1; autoCam(900); });
$('#b-range').addEventListener('input', e => { S.b = +e.target.value; S.play = false; autoCam(700); });
canvas.addEventListener('pointerdown', () => { tween = null; });
addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); S.play = !S.play; } });
function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } }
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; let last = performance.now();
autoCam(0);
(function loop(now) { const dt = Math.min(.1, (now - last) / 1000); last = now; resize();
  if (S.play) { S.b = Math.min(10, S.b + dt * S.speed / DUR[Math.min(9, Math.floor(S.b))]); if (S.b >= 10) S.play = false;
    const dockKey = site.dockKey; if (dockKey !== S.dock) { S.dock = dockKey; if (dockKey) { const k = dockKey[0], j = +dockKey.slice(1), y = k === 's' ? y0 + SL * j : H; flyTo(k === 's' ? [-17, y + 7, 24] : k === 'n' ? [-30, H + 9, 26] : k === 'h' ? [-20, H + 6, 34] : [-38, H + 9, 44], k === 's' ? [0, y + 1, 0] : k === 'n' ? [0, H - 1, -1] : k === 'h' ? [0, H, 6] : [-7, H, 7.4], 1300); } else { S.cam = -1; autoCam(1500); } } else if (!dockKey) autoCam(1600); }
  if (tween) { const k = Math.min(1, (now - tween.t0) / tween.ms), q = ease(k); camera.position.lerpVectors(tween.p0, tween.p1, q); controls.target.lerpVectors(tween.a0, tween.a1, q); if (k >= 1) tween = null; }
  controls.update(); build(S.b, now / 1000); site.tick(dt, S.b);
  const d = camera.position.distanceTo(controls.target), sh = Math.max(40, Math.min(260, d * .55)), sc = sun.shadow.camera; sc.left = -sh; sc.right = sh; sc.top = sh; sc.bottom = -sh; sc.near = 10; sc.far = sh * 8; sc.updateProjectionMatrix(); sun.target.position.copy(controls.target); sun.position.copy(controls.target).add(tv.set(-.55, .9, .5).multiplyScalar(sh * 3));
  renderer.render(scene, camera); hud();
  const w = canvas.clientWidth, h = canvas.clientHeight; TAGS.forEach((t, j) => { const on = S.b >= t[0] && S.b < t[1]; let vis = on; if (on) { v3.set(...t[2]).project(camera); const x = (v3.x * .5 + .5) * w, y = (-v3.y * .5 + .5) * h; vis = v3.z < 1 && x > 300 && x < w - 40 && y > 70 && y < h - 110; if (vis) tagEls[j].style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; } tagEls[j].style.display = vis ? '' : 'none'; });
  requestAnimationFrame(loop); })(last);
window.LIVE = { S, camera, controls, site };
