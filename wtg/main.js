// Ветроустановка как живая страница: камеры, режимы, разборка, API для диагностики, режим съёмки ?render + window.seek(t).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NOM, state, stateOf, BEARINGS } from './model.js';
import { buildMachine } from './machine.js';
import { buildConsole } from './console.js';
import { buildPanel } from './build.js';

const app = document.getElementById('app'), canvas = document.createElement('canvas'); canvas.id = 'gl'; app.appendChild(canvas);
const H = NOM.hubH, Q = new URLSearchParams(location.search), RENDER = Q.has('render'), PHONE = matchMedia('(max-width:760px)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true, preserveDrawingBuffer: RENDER });
renderer.setPixelRatio(Math.min(devicePixelRatio, PHONE ? 1.5 : 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const camera = new THREE.PerspectiveCamera(34, 1, 0.3, 4000), controls = new OrbitControls(camera, canvas);
Object.assign(controls, { enableDamping: true, dampingFactor: .08, minDistance: 2.5, maxDistance: 900, zoomToCursor: true });
const M = buildMachine(renderer);

const L = { wtg: 'ВЭУ', v: NOM.vMean, tAir: 12, rho: NOM.rho, e: 0, eT: 0, mode: 'out', cam: 'nac', sel: null, selB: null, forced: {}, tags: {} };
const CAMS = {     // положение камеры и точка взгляда как функции степени разборки
  nac: e => [[-30 - 16 * e, H + 9 + 8 * e, -17 - 10 * e], [0, H + .3 + 1.5 * e, -1 - 2 * e]],
  rot: e => [[-70 - 20 * e, H + 12, 150 + 30 * e], [0, H, 8 + 6 * e]],
  all: e => [[-250, 118 - 20 * e, 372], [0, 102 - 20 * e, 0]],
  fnd: e => [[-30, 17 - 39 * e, 36], [0, -1.6 - 39 * e, 0]],
};
let tween = null;
function goCam(id, ms = 900) { L.cam = id; const [p, t] = CAMS[id](L.eT); flyTo(new THREE.Vector3(...p), new THREE.Vector3(...t), ms); }
function flyTo(p, t, ms = 900) { if (!ms) { camera.position.copy(p); controls.target.copy(t); tween = null; return; } tween = { t0: performance.now(), ms, p0: camera.position.clone(), p1: p, a0: controls.target.clone(), a1: t }; }
function pick(unit, bearing) { L.sel = unit; L.selB = bearing; M.highlight(unit); if (unit && !['tower', 'blades', 'fnd', 'anchor', 'cover'].includes(unit)) { const a = M.anchorOf(unit), d = camera.position.clone().sub(controls.target).setLength(unit === 'gear' || unit === 'gen' ? 13 : 11); flyTo(a.clone().add(d), a, 700); L.cam = ''; if (L.mode === 'out' && L.eT < .2) setMode('glass'); }
  if (unit === 'fnd' || unit === 'anchor') goCam('fnd'); if (unit === 'tower') goCam('all'); if (unit === 'blades') goCam('rot'); }
function setMode(m) { L.mode = m; M.setMode(m); }
const ui = RENDER && Q.get('render') === 'clean' ? null : buildConsole(app, L, { wind: v => L.v = v, explode: e => { L.eT = e; if (L.cam && e > 0.02) goCam(L.cam, 500); }, mode: setMode, cam: goCam, pick });

/* стройка ВЭУ: шкала b = 0…10 ведёт всю сцену; открывается параметром build=1, даты шагов приходят с экрана стройки */
const B = { on: false, b: 10, now: 10, play: false, ph: '', panel: null };
const BCAM = { s: [[46, 78, 128], [-70, 0, -12]], f: [[30, 25, 54], [-4, -1.5, -2]], a: [[-262, 96, 318], [-12, 60, 0]] };
function bcam(ms = 1400) { const ph = B.b < 2 ? 's' : B.b < 4 ? 'f' : 'a'; if (ph === B.ph) return; B.ph = ph; flyTo(new THREE.Vector3(...BCAM[ph][0]), new THREE.Vector3(...BCAM[ph][1]), ms); }
function startBuild(p) { const hud = document.getElementById('hud'); if (!hud) return; B.on = true; B.now = Math.max(0, Math.min(10, +(p.get('b') ?? 10))); B.b = B.now; B.play = false; B.ph = ''; L.e = L.eT = 0; setMode('out'); pick(null, null);
  if (B.panel) B.panel.el.remove(); B.panel = buildPanel(hud, { wtg: L.wtg, now: B.now, f: (p.get('f') || '').split(',').filter(Boolean), pl: (p.get('pl') || '').split(',').filter(Boolean), d: p.get('d') }, {
    seek: v => { B.b = v; B.play = false; bcam(700); }, jump: k => { B.b = k; B.play = true; bcam(900); },
    act: a => { if (a === 'start') { B.b = 0; B.play = true; } else if (a === 'play') { if (B.b >= 10) B.b = 0; B.play = !B.play; } else if (a === 'now') { B.b = B.now; B.play = false; } else if (a === 'exit') { B.on = false; B.play = false; hud.classList.remove('bld'); goCam('nac'); return; } bcam(900); } });
  hud.classList.add('bld'); bcam(0); }
/* API для предиктивной диагностики */
window.setBearingState = (id, st) => { if (st) L.forced[id] = st; else delete L.forced[id]; };
window.setTags = tags => { Object.assign(L.tags, tags); };                        // {'Г1.T': 82, 'Г1.V': 5.1, 'V': 9.4}
function applyParams(str) { const p = new URLSearchParams(str.replace(/^#/, ''));
  if (p.get('wtg')) L.wtg = p.get('wtg'); if (p.get('v')) L.v = +p.get('v'); if (p.get('t')) L.tAir = +p.get('t'); if (p.get('rho')) L.rho = +p.get('rho'); if (p.get('mode')) setMode(p.get('mode')); if (p.get('explode')) L.e = L.eT = +p.get('explode');
  if (p.get('build')) startBuild(p);
  for (const k of ['alarm', 'warn', 'ok']) if (p.get(k)) for (const id of p.get(k).split(',')) window.setBearingState(id, k); if (p.get('view') && CAMS[p.get('view')]) goCam(p.get('view'), 0); }
addEventListener('message', e => { const d = e.data || {}; if (d.bearing) window.setBearingState(d.bearing, d.state); if (d.tags) window.setTags(d.tags); if (d.v != null) L.v = +d.v; if (d.wtg) L.wtg = d.wtg; if (d.t != null) L.tAir = +d.t; if (d.params) applyParams(d.params); });
addEventListener('hashchange', () => applyParams(location.hash));

function bearings(s) { return BEARINGS.map((b, i) => { const m = s.bearings[i], t = L.tags[b.id + '.T'] ?? m.t, vib = L.tags[b.id + '.V'] ?? m.vib, tag = L.tags[b.id + '.T'] != null || L.tags[b.id + '.V'] != null;
    return { ...b, t, vib, tag, st: L.forced[b.id] || stateOf(t, vib) }; }); }
const v3 = new THREE.Vector3();
function draw(dt) {
  const s = state(L.tags.V ?? L.v, L.tAir, L.rho), bst = bearings(s); M.explode(L.e); M.build(B.on ? B.b : null); M.update(s, dt, L.e); for (const b of bst) M.setBearing(b.id, b.st);
  M.key.target.position.copy(controls.target); M.key.position.copy(controls.target).add(new THREE.Vector3(-60, 70, 80));
  renderer.render(M.scene, camera);
  if (B.panel) B.panel.update(B.b, B.play);
  if (ui) { ui.update(s, bst); const show = !B.on && (L.e > .3 || L.mode !== 'out'); ui.tags(id => { v3.copy(M.anchorOf(id)); const far = v3.distanceTo(camera.position) > 120; if (far && !['blades', 'cover', 'tower', 'anchor', 'fnd'].includes(id)) return null; v3.project(camera); return { x: (v3.x * .5 + .5) * innerWidth, y: (-v3.y * .5 + .5) * innerHeight, z: v3.z }; }, show); }
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1 ? 48 : 34;
  // центр сцены — в свободной зоне между панелями
  const q = id => { const p = document.getElementById(id); return p && p.offsetParent ? p.getBoundingClientRect() : null; }, a = q('p-main'), b = q('p-list'), c = q('p-bar');
  let l = 0, r = w, t = 0, bt = c ? c.top : h; if (w > 760) { if (a) l = a.right; if (b) r = b.left; } else if (a) t = a.bottom;
  OFF.x = (l + r) / 2 - w / 2; OFF.y = (t + bt) / 2 - h / 2; camera.setViewOffset(w, h, -OFF.x, -OFF.y, w, h); camera.updateProjectionMatrix(); }
const OFF = { x: 0, y: 0 };
addEventListener('resize', resize); setMode('out'); applyParams(location.hash); if (!Q.get('view') && !/view=/.test(location.hash) && !B.on) goCam('nac', 0); resize();

// выбор узла кликом по модели
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; tween = null; });
canvas.addEventListener('pointerup', e => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; ndc.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(M.pickables().filter(m => m.visible && !(L.mode === 'glass' && m.userData.unit === 'cover')), false)[0]; pick(hit ? hit.object.userData.unit : null, null); });
addEventListener('keydown', e => { if (e.key === 'Escape') pick(null, null); });

const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
if (RENDER) {      // съёмка: кадр — чистая функция времени t (с)
  const TOUR = [[0, 'all', 'out', 0], [4, 'rot', 'out', 0], [8, 'nac', 'out', 0], [11, 'nac', 'glass', 0], [14, 'nac', 'out', 1], [19, 'nac', 'cut', 0], [23, 'fnd', 'cut', 1], [26, 'all', 'out', 0]];
  window.seek = t => { let i = 0; while (i < TOUR.length - 1 && TOUR[i + 1][0] <= t) i++; const a = TOUR[i], b = TOUR[Math.min(TOUR.length - 1, i + 1)], k = b === a ? 0 : ease(Math.min(1, (t - a[0]) / Math.min(2.5, b[0] - a[0])));
    L.e = L.eT = a[3] + (b[3] - a[3]) * k; setMode(k > .5 ? b[2] : a[2]); const A = CAMS[a[1]](L.e), B = CAMS[b[1]](L.e); camera.position.fromArray(A[0]).lerp(new THREE.Vector3(...B[0]), k); controls.target.fromArray(A[1]).lerp(new THREE.Vector3(...B[1]), k); camera.lookAt(controls.target); draw(0); };
  window.seek(+Q.get('t') || 0);
} else {
  let last = performance.now();
  (function loop(now) { const dt = Math.min(.1, (now - last) / 1000); last = now; if (B.on && B.play) { B.b = Math.min(10, B.b + dt * 10 / 48); if (B.b >= 10) B.play = false; bcam(); } L.e += (L.eT - L.e) * Math.min(1, dt * 3.2); if (Math.abs(L.eT - L.e) < .001) L.e = L.eT;
    if (tween) { const k = Math.min(1, (now - tween.t0) / tween.ms), q = ease(k); camera.position.lerpVectors(tween.p0, tween.p1, q); controls.target.lerpVectors(tween.a0, tween.a1, q); if (k >= 1) tween = null; }
    controls.update(); draw(dt); requestAnimationFrame(loop); })(last);
}
window.LIVE = { L, M, B, goCam, pick, setMode, camera, controls, snap() { L.e = L.eT; if (tween) { camera.position.copy(tween.p1); controls.target.copy(tween.a1); tween = null; } camera.lookAt(controls.target); draw(0); } };
