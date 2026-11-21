/* Стройка одной ВЭУ в 3D: от подъезда и котлована до пуска. Одна шкала b = 0…10 ведёт всю сцену.
   Фундамент — по чертежу 104218-CI-DW-040: плита Ø26 м, подошва −2,70, откос котлована 1:4, подбетонка C16/20 100 мм,
   приямок под нижним кольцом C40/50, плита C35/45, подколонник Ø6,6 м C50/60 до +1,00, 2 × 100 болтов M48 на Ø4782 и Ø4346,
   обратная засыпка слоями 300 мм до +1,00. Заземление — по 104218-EL-DW-040: полоса 60 × 6 мм, внутреннее и наружное кольца, электроды.
   Раскладка арматуры типовая: в чертеже есть только масса (81,8 т). Размеры площадки, техника и длительность операций условные. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = q => document.querySelector(q), RAD = Math.PI / 180, H = 110, NS = 5;
const P = new URLSearchParams(location.hash.slice(1)), CFG = { wtg: P.get('wtg') || 'ВЭУ', now: Math.max(0, Math.min(10, +(P.get('b') ?? 10))), f: (P.get('f') || '').split(',').filter(Boolean), pl: (P.get('pl') || '').split(',').filter(Boolean), d: P.get('d') || '' };
const canvas = $('#gl'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.localClippingEnabled = true;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, 0.5, 5000), controls = new OrbitControls(camera, canvas);
Object.assign(controls, { enableDamping: true, dampingFactor: .08, minDistance: 6, maxDistance: 900, maxPolarAngle: Math.PI * .497, zoomToCursor: true });
{ const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256; const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#b9cde0'); gr.addColorStop(.6, '#dde7ef'); gr.addColorStop(1, '#ece9e1'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
scene.fog = new THREE.Fog(0xe6e6e0, 700, 2600);
scene.add(new THREE.HemisphereLight(0xeef3f8, 0x8a7a62, 1.15));
const sun = new THREE.DirectionalLight(0xfff3e2, 2.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = .06; scene.add(sun, sun.target);

/* ---------- материалы ---------- */
const SEC = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), POUR = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), PED = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), cuttable = [];
const mat = (color, o = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: o.r ?? .9, metalness: o.m ?? 0, side: o.side ?? THREE.FrontSide, transparent: !!o.t, opacity: o.o ?? 1 }); if (o.cut) { m.side = THREE.DoubleSide; m.userData.own = o.own || []; cuttable.push(m); } return m; };
const M = { ground: mat(0xcbc3ad), soil: mat(0x8f7a5c, { cut: 1 }), soil2: mat(0x9c876a, { cut: 1 }), spoil: mat(0x94805f), gravel: mat(0xb9b2a0), sub: mat(0xa3927a), blind: mat(0xb8b6b0, { cut: 1 }),
  conc: mat(0xa9aaa8, { cut: 1, own: [POUR] }), concWet: mat(0x7f8384, { cut: 1 }), ped: mat(0xb6b7b5, { cut: 1, own: [PED] }), rebar: mat(0xb0532a, { r: .6, m: .4, cut: 1 }), steel: mat(0x8e959d, { r: .45, m: .8 }), ring: mat(0x8e959d, { r: .45, m: .8, cut: 1 }), bolt: mat(0x5d646c, { r: .5, m: .8, cut: 1 }),
  form: mat(0xd9a441, { cut: 1, r: .8 }), duct: mat(0x4f7fb5, { r: .6, cut: 1 }), earth: mat(0x3fae52, { r: .5, m: .5, cut: 1 }), rod: mat(0xc8742e, { r: .4, m: .7, cut: 1 }), white: mat(0xf2f3f4, { r: .5 }), nac: mat(0xe9ebed, { r: .5 }), dark: mat(0x2d333b, { r: .7 }),
  yel: mat(0xf2b632, { r: .55, m: .2 }), red: mat(0xc0392b, { r: .6 }), cab: mat(0xdfe5ea, { r: .4, m: .2 }), trench: mat(0x6f5d45), cable: mat(0x1f2937, { r: .5 }), ghost: new THREE.MeshBasicMaterial({ color: 0x0065ae, transparent: true, opacity: .07, depthWrite: false }) };
let section = false; const applyClip = () => { for (const m of cuttable) { m.clippingPlanes = [...m.userData.own, ...(section ? [SEC] : [])]; m.needsUpdate = true; } }; applyClip();
const world = new THREE.Group(); scene.add(world);
const mk = (geo, m, x = 0, y = 0, z = 0, parent = world, shadow = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o; };
const lathe = (pts, seg = 96) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
const eio = t => { t = Math.max(0, Math.min(1, t)); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }, sg = (b, a, c) => Math.max(0, Math.min(1, (b - a) / (c - a))), lerp = (a, b, k) => a + (b - a) * k;
const UP = new THREE.Vector3(0, 1, 0), tv = new THREE.Vector3(), tq = new THREE.Quaternion(), dm = new THREE.Object3D();
// пучок стержней: список отрезков → один InstancedMesh, count растёт по мере укладки
function bars(list, r, m) { const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(r, r, 1, 5), m, list.length); list.forEach((s, k) => { const a = new THREE.Vector3(s[0], s[1], s[2]), b = new THREE.Vector3(s[3], s[4], s[5]); dm.position.copy(a).add(b).multiplyScalar(.5); dm.scale.set(1, a.distanceTo(b), 1); dm.quaternion.setFromUnitVectors(UP, tv.copy(b).sub(a).normalize()); dm.updateMatrix(); im.setMatrixAt(k, dm.matrix); }); im.castShadow = true; im.userData.n = list.length; world.add(im); return im; }
const show = (im, k) => { im.count = Math.round(im.userData.n * Math.max(0, Math.min(1, k))); im.visible = im.count > 0; };

/* ---------- площадка: земля, дорога, крановая площадка ---------- */
const RB = 13.8, RT = 14.5, YB = -2.8;      // котлован: низ на 0,8 м шире плиты, откос 1:4
mk(new THREE.RingGeometry(60, 1500, 96, 1).rotateX(-Math.PI / 2), M.ground, 0, 0, 0, world, false); mk(new THREE.RingGeometry(RT, 60.05, 96, 1).rotateX(-Math.PI / 2), mat(0xcbc3ad, { cut: 1 }), 0, 0, 0, world, false);
// при разрезе ближняя половина грунта вынута: дно и стенка выреза
const cutBox = new THREE.Group(); cutBox.visible = false; world.add(cutBox); mk(new THREE.CircleGeometry(60, 64, 0, Math.PI).rotateX(-Math.PI / 2).rotateY(Math.PI), mat(0x6f5d45), 0, -7, 0, cutBox, false); mk(new THREE.CylinderGeometry(60, 60, 7, 64, 1, true, -Math.PI / 2, Math.PI), mat(0x7d6a4f, { side: THREE.BackSide }), 0, -3.5, 0, cutBox, false); for (const o of cutBox.children) o.receiveShadow = false;
const lid = mk(new THREE.CircleGeometry(RT + .02, 96).rotateX(-Math.PI / 2), M.ground, 0, 0.01, 0, world, false);
const pit = new THREE.Group(); world.add(pit); mk(lathe([[RB, YB], [RT, 0]]), M.soil, 0, 0, 0, pit, false).material = mat(0x8a7557, { cut: 1, side: THREE.DoubleSide }); mk(new THREE.CircleGeometry(RB, 96).rotateX(-Math.PI / 2), M.soil2, 0, YB, 0, pit, false);
const roadSub = mk(new THREE.BoxGeometry(1, .25, 8), M.sub, 0, .12, 0), roadTop = mk(new THREE.BoxGeometry(1, .2, 6), M.gravel, 0, .34, 0), padSub = mk(new THREE.BoxGeometry(46, .3, 62), M.sub, -40, .15, 0), padTop = mk(new THREE.BoxGeometry(45, .25, 61), M.gravel, -40, .42, 0);
for (const o of [roadSub, roadTop, padSub, padTop]) o.castShadow = false;

/* ---------- фундамент ---------- */
const coneR = y => y <= -2.4 ? 13 : y <= 0 ? 13 - (y + 2.4) / 2.4 * 9.7 : 3.3, RC = (4.782 + 4.346) / 4, R1 = 4.782 / 2, R2 = 4.346 / 2;
const blind = mk(lathe([[0, -2.8], [RB, -2.8], [RB, -2.7], [RC + .6, -2.7], [RC + .3, -3.0], [RC - .3, -3.0], [RC - .6, -2.7], [0, -2.7]]), M.blind);
const lowpit = mk(lathe([[RC - .6, -2.7], [RC - .3, -3.0], [RC + .3, -3.0], [RC + .6, -2.7]]), M.concWet);
const slab = mk(lathe([[0, -2.7], [13, -2.7], [13, -2.4], [3.3, 0], [0, 0]]), M.conc), slabCap = mk(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), M.concWet, 0, 0, 0, world, false);
const pedestal = mk(lathe([[0, 0], [3.3, 0], [3.3, 1.0], [0, 1.0]]), M.ped), pedCap = mk(new THREE.CircleGeometry(3.3, 72).rotateX(-Math.PI / 2), M.concWet, 0, 0, 0, world, false), grout = mk(lathe([[R2 - .18, 1.0], [R2 - .18, 1.1], [R1 + .18, 1.1], [R1 + .18, 1.0]], 72), M.ped);
// анкерная корзина: нижнее кольцо в приямке, 2 × 100 болтов M48, верхнее кольцо-шаблон
const ringLo = mk(lathe([[R2 - .12, -2.92], [R2 - .12, -2.86], [R1 + .12, -2.86], [R1 + .12, -2.92], [R2 - .12, -2.92]], 72), M.ring), ringUp = mk(lathe([[R2 - .12, 1.1], [R2 - .12, 1.17], [R1 + .12, 1.17], [R1 + .12, 1.1], [R2 - .12, 1.1]], 72), M.ring);
const bolts = bars(Array.from({ length: 200 }, (_, k) => { const a = Math.floor(k / 2) / 100 * 6.2832, r = k % 2 ? R1 : R2; return [Math.cos(a) * r, -2.9, Math.sin(a) * r, Math.cos(a) * r, 1.32, Math.sin(a) * r]; }), .024, M.bolt);
// закладные трубы: от центра подколонника вниз и под плитой наружу, к траншее
const ducts = []; for (let k = 0; k < 4; k++) { const z = (k - 1.5) * .28, c = new THREE.CatmullRomCurve3([new THREE.Vector3(.2 + k * .05, 1.15, z), new THREE.Vector3(.2 + k * .05, -2.0, z), new THREE.Vector3(.6, -2.75, z), new THREE.Vector3(1.6, -2.98, z), new THREE.Vector3(17, -3.0, z)]); ducts.push(mk(new THREE.TubeGeometry(c, 40, .075, 8), M.duct)); }
// арматура: нижняя сетка, верхняя по уклону, каркас подколонника
const cs = a => [Math.cos(a), Math.sin(a)], NR = 120, botRad = bars(Array.from({ length: NR }, (_, k) => { const [c, s] = cs(k / NR * 6.2832); return [c * 1.2, -2.63, s * 1.2, c * 12.9, -2.63, s * 12.9]; }), .02, M.rebar);
const ringsBot = [], ringsTop = [], hoops = []; for (let r = 1.6; r <= 12.9; r += .47) ringsBot.push(mk(new THREE.TorusGeometry(r, .02, 5, 80).rotateX(Math.PI / 2), M.rebar, 0, -2.59, 0));
const topRad = bars(Array.from({ length: NR }, (_, k) => { const [c, s] = cs((k + .5) / NR * 6.2832); return [c * 3.5, -.1, s * 3.5, c * 12.9, -2.45, s * 12.9]; }), .02, M.rebar);
for (let r = 3.9; r <= 12.9; r += .6) ringsTop.push(mk(new THREE.TorusGeometry(r, .02, 5, 80).rotateX(Math.PI / 2), M.rebar, 0, -.06 - (r - 3.5) / 9.4 * 2.35, 0));
const links = bars(Array.from({ length: 96 }, (_, k) => { const [c, s] = cs(k / 96 * 6.2832 * 3), r = 4.5 + (k % 8) * 1.05, yt = -.06 - (r - 3.5) / 9.4 * 2.35; return [c * r, -2.6, s * r, c * r, yt, s * r]; }), .016, M.rebar);
const pedBars = bars(Array.from({ length: 112 }, (_, k) => { const [c, s] = cs(k / 56 * 6.2832), r = k < 56 ? 3.2 : 1.55; return [c * r, -2.6, s * r, c * r, .93, s * r]; }), .02, M.rebar);
for (let y = -.4; y <= .9; y += .26) for (const r of [3.22, 1.57]) hoops.push(mk(new THREE.TorusGeometry(r, .018, 5, 64).rotateX(Math.PI / 2), M.rebar, 0, y, 0));
// опалубка
const formOut = mk(new THREE.CylinderGeometry(13.04, 13.04, .34, 96, 1, true), M.form, 0, -2.53, 0), formPed = mk(new THREE.CylinderGeometry(3.34, 3.34, 1.04, 72, 1, true), M.form, 0, .5, 0);
// заземление: внутреннее кольцо, наружное кольцо на Ø28 м, четыре связи, восемь электродов
const eIn = mk(new THREE.TorusGeometry(1.75, .04, 5, 64).rotateX(Math.PI / 2), M.earth, 0, .9, 0), eOut = mk(new THREE.TorusGeometry(14.0, .045, 5, 120).rotateX(Math.PI / 2), M.earth, 0, -2.66, 0);
const eLinks = bars([45, 135, 225, 315].map(d => { const [c, s] = cs(d * RAD); return [c * 1.75, -2.6, s * 1.75, c * 14, -2.66, s * 14]; }).concat([45, 135, 225, 315].map(d => { const [c, s] = cs(d * RAD); return [c * 1.75, .9, s * 1.75, c * 1.75, -2.6, s * 1.75]; })), .04, M.earth);
const eRods = bars(Array.from({ length: 8 }, (_, k) => { const [c, s] = cs((k + .5) / 8 * 6.2832); return [c * 14, -2.66, s * 14, c * 14, -5.6, s * 14]; }), .05, M.rod);
// обратная засыпка: слои по 300 мм от −2,70 до +1,00, сверху уклон 2 %
const fill = []; { const yo = y => y <= 0 ? RB + (y + 2.8) / 4 : 15.6 - y; for (let k = 0, y = -2.7; y < 1.0 - 1e-6; k++, y += .3) { const y1 = Math.min(1.0, y + .3), top = y1 >= 1.0; fill.push(mk(lathe([[coneR(y) + .01, y], [yo(y), y], [yo(y1), top ? .72 : y1], [coneR(y1) + .01, y1]]), k % 2 ? M.soil : M.soil2)); } }
const spoil = mk(new THREE.ConeGeometry(11, 5.5, 28), M.spoil, 34, 2.75, -30);
// плоскость разреза: закрашенные сечения грунта, подбетонки, бетона и слоёв засыпки — как на чертеже, разрез А-А
const faces = new THREE.Group(); faces.visible = false; world.add(faces);
const faceMat = (color, own) => { const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }); if (own) m.clippingPlanes = own; return m; };
function face(pts, m, both = true) { const sh = new THREE.Shape(); pts.forEach((p, k) => k ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])); const g = [mk(new THREE.ShapeGeometry(sh), m, 0, 0, 0, faces, false)]; if (both) { const o = mk(new THREE.ShapeGeometry(sh), m, 0, 0, 0, faces, false); o.scale.x = -1; g.push(o); } return g; }
face([[RT, 0], [60, 0], [60, -7], [0, -7], [0, -3.0], [RC + .3, -3.0], [RC + .6, -2.8], [RB, -2.8]], faceMat(0x7d6a4f)); const fSoil = face([[0, 0], [RT, 0], [RB, -2.8], [RC + .6, -2.8], [RC + .3, -3.0], [0, -3.0]], faceMat(0x7d6a4f)), fBlind = face([[0, -2.8], [RB, -2.8], [RB, -2.7], [RC + .6, -2.7], [RC + .3, -3.0], [0, -3.0]], faceMat(0xd2d0ca));
const fSlab = face([[0, -2.7], [RC - .6, -2.7], [RC - .3, -3.0], [RC + .3, -3.0], [RC + .6, -2.7], [13, -2.7], [13, -2.4], [3.3, 0], [0, 0]], faceMat(0x9a9c9b, [POUR])), fPed = face([[0, 0], [3.3, 0], [3.3, 1.0], [0, 1.0]], faceMat(0xaeb0ae, [PED]));
const fFill = fill.map((f, k) => { const y = -2.7 + k * .3, yb = Math.min(1.0, y + .3), top = yb >= 1.0, yo = v => v <= 0 ? RB + (v + 2.8) / 4 : 15.6 - v; return face([[coneR(y), y], [yo(y), y], [yo(yb), top ? .72 : yb], [coneR(yb), yb]], faceMat(k % 2 ? 0x8a7557 : 0x97836a)); });


/* ---------- ВЭУ: пять секций башни, гондола, ступица, три лопасти ---------- */
const y0 = 1.17, y1 = H - 2.6, SL = (y1 - y0) / NS, rb = 2.28, rt = 1.65, secs = [], ghost = new THREE.Group(); world.add(ghost);
for (let k = 0; k < NS; k++) { const ra = lerp(rb, rt, k / NS), rc = lerp(rb, rt, (k + 1) / NS), g = new THREE.Group(); world.add(g);
  mk(new THREE.CylinderGeometry(rc, ra, SL, 48, 1, true), M.white, 0, 0, 0, g).material = mat(0xf2f3f4, { r: .5, side: THREE.DoubleSide }); for (const s of [-1, 1]) mk(new THREE.CylinderGeometry((s < 0 ? ra : rc) + .06, (s < 0 ? ra : rc) + .06, .12, 48), M.steel, 0, s * (SL / 2 - .06), 0, g);
  if (!k) mk(new THREE.BoxGeometry(1.0, 2.2, .1), M.dark, 0, -SL / 2 + 2.3, ra + .01, g);
  g.userData = { to: new THREE.Vector3(0, y0 + SL * (k + .5), 0), lay: new THREE.Vector3(-51, lerp(rb, rt, k / NS) + .9, -24 + k * 6.2) }; secs.push(g);
  mk(new THREE.CylinderGeometry(rc, ra, SL, 32, 1, true), M.ghost, 0, y0 + SL * (k + .5), 0, ghost, false); }
const nac = new THREE.Group(); world.add(nac); { const body = mk(new THREE.BoxGeometry(5.2, 5, 13.5), M.nac, 0, .2, -2.6, nac); mk(new THREE.BoxGeometry(5.3, .5, 13.6), M.dark, 0, -2.4, -2.6, nac); mk(new THREE.BoxGeometry(3.4, .9, 2.6), M.steel, 0, 3.1, -6.6, nac); mk(new THREE.CylinderGeometry(1.9, 2.0, 1.2, 32).rotateX(Math.PI / 2), M.steel, 0, 0, 4.7, nac); mk(new THREE.CylinderGeometry(1.7, 1.7, 2.2, 32), M.steel, 0, -3.4, 0, nac); body.castShadow = true; }
nac.userData = { to: new THREE.Vector3(0, H, 0), lay: new THREE.Vector3(-27, 3.6, 20) }; mk(new THREE.BoxGeometry(5.2, 5, 13.5), M.ghost, 0, H + .2, -2.6, ghost, false);
const hub = new THREE.Group(); world.add(hub); mk(new THREE.SphereGeometry(2.3, 32, 20), M.white, 0, 0, 0, hub).scale.set(1, 1, 1.35); hub.userData = { to: new THREE.Vector3(0, H, 7.4), lay: new THREE.Vector3(-27, 2.9, 5) };
function bladeGeometry(L) { const NSg = 28, NC = 12, pos = [], idx = []; for (let k = 0; k <= NSg; k++) { const r = k / NSg, y = 2.1 + r * L, q = Math.max(0, (r - .2) / .8), chord = r < .03 ? 3.2 : r < .2 ? 3.2 + 2.0 * (r - .03) / .17 : 5.2 - 4.5 * Math.pow(q, .8), thick = r < .03 ? 3.2 : r < .2 ? 3.2 - 1.9 * (r - .03) / .17 : 1.3 * Math.pow(1 - q, 1.3) + .1, tw = (15 * (1 - r) * (1 - r) - 2) * RAD;
    for (let c = 0; c < NC; c++) { const a = c / NC * Math.PI * 2, ex = Math.cos(a) * chord / 2 - (r > .03 ? chord * .16 * Math.min(1, (r - .03) / .17) : 0), ez = Math.sin(a) * thick / 2; pos.push(ex * Math.cos(tw) - ez * Math.sin(tw), y, ex * Math.sin(tw) + ez * Math.cos(tw)); } }
  for (let k = 0; k < NSg; k++) for (let c = 0; c < NC; c++) { const a = k * NC + c, b2 = k * NC + (c + 1) % NC; idx.push(a, a + NC, b2, b2, a + NC, b2 + NC); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; }
const BL = 95.4, bladeGeo = bladeGeometry(BL), rotor = new THREE.Group(); rotor.position.set(0, H, 7.4); world.add(rotor); const blades = [], laid = [];
for (let k = 0; k < 3; k++) { const arm = new THREE.Group(); arm.rotation.z = k * 2 * Math.PI / 3; rotor.add(arm); const m = mk(bladeGeo, M.white, 0, 0, 0, arm); blades.push(m);
  const l = mk(bladeGeo, M.white, -112, 2.6, 34 + k * 5.5); l.rotation.set(0, 0, -Math.PI / 2); laid.push(l);      // лопасть на раскладке, вдоль дороги
  const gh = mk(bladeGeo, M.ghost, 0, 0, 0, new THREE.Group(), false); gh.parent.rotation.z = k * 2 * Math.PI / 3 + Math.PI / 2; gh.parent.position.set(0, H, 7.4); ghost.add(gh.parent); }

/* ---------- техника ---------- */
function machine(x, z, ry) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry || 0; world.add(g); return g; }
const exc = machine(0, 20.5, Math.PI); { for (const zz of [-1.3, 1.3]) mk(new THREE.BoxGeometry(4.6, .9, .7), M.dark, 0, .45, zz, exc); mk(new THREE.BoxGeometry(3.4, 1.6, 2.8), M.yel, -.2, 1.8, 0, exc); mk(new THREE.BoxGeometry(1.3, 1.5, 1.2), M.cab, .9, 2.1, .7, exc); }
const excArm = new THREE.Group(); excArm.position.set(1.2, 2.2, -.4); exc.add(excArm); const excBoom = mk(new THREE.BoxGeometry(5.4, .5, .5), M.yel, 2.7, 0, 0, excArm), excStick = new THREE.Group(); excStick.position.set(5.4, 0, 0); excArm.add(excStick); mk(new THREE.BoxGeometry(3.4, .4, .4), M.yel, 1.7, 0, 0, excStick); mk(new THREE.BoxGeometry(1.1, .9, 1.1), M.dark, 3.5, -.3, 0, excStick);
exc.rotation.y = -Math.PI / 2;
const roller = machine(-40, 0); mk(new THREE.CylinderGeometry(.85, .85, 2.3, 24).rotateX(Math.PI / 2), M.steel, 1.6, .85, 0, roller); mk(new THREE.BoxGeometry(3, 1.5, 2.1), M.yel, -.6, 1.4, 0, roller); mk(new THREE.CylinderGeometry(.75, .75, 2.2, 20).rotateX(Math.PI / 2), M.dark, -1.5, .75, 0, roller);
const pump = machine(22, -10, 0); mk(new THREE.BoxGeometry(9, 1.4, 2.5), M.red, 0, 1.3, 0, pump); mk(new THREE.BoxGeometry(2.2, 2, 2.4), M.cab, 3.6, 2.6, 0, pump); for (const xx of [-3, 0, 3.2]) mk(new THREE.CylinderGeometry(.55, .55, 2.7, 16).rotateX(Math.PI / 2), M.dark, xx, .55, 0, pump);
const pumpBoom = [0, 1, 2].map(() => mk(new THREE.CylinderGeometry(.16, .2, 1, 8), M.red)), hose = mk(new THREE.CylinderGeometry(.12, .12, 1, 8), M.dark);
const mixers = [0, 1].map(k => { const g = machine(34 + k * 11, -10, 0); mk(new THREE.BoxGeometry(8, 1.2, 2.5), M.white, 0, 1.2, 0, g); mk(new THREE.BoxGeometry(2, 2, 2.4), M.cab, 3.2, 2.5, 0, g); const d = mk(new THREE.CylinderGeometry(1.25, .8, 4.6, 20).rotateZ(Math.PI / 2 - .22), M.steel, -1.2, 3, 0, g); g.userData.drum = d; for (const xx of [-2.6, 0, 3]) mk(new THREE.CylinderGeometry(.55, .55, 2.7, 16).rotateX(Math.PI / 2), M.dark, xx, .55, 0, g); return g; });
const crane = machine(-36, -6, 0); for (const zz of [-3.6, 3.6]) mk(new THREE.BoxGeometry(12, 1.6, 1.9), M.dark, 0, .8, zz, crane); mk(new THREE.BoxGeometry(8.5, 3.2, 6.8), M.yel, -.5, 3.3, 0, crane); mk(new THREE.BoxGeometry(3.4, 2.8, 6.4), M.dark, -6, 3.5, 0, crane); mk(new THREE.BoxGeometry(2.3, 2.4, 2.3), M.cab, 3.4, 4.1, 2.5, crane);
const boom = mk(new THREE.CylinderGeometry(.55, 1.0, 1, 4), M.yel), boomE = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(.56, 1.01, 1, 4, 24)), new THREE.LineBasicMaterial({ color: 0x5c4308 })); boom.add(boomE);
const rope = mk(new THREE.CylinderGeometry(.07, .07, 1, 6), M.dark, 0, 0, 0, world, false), hookB = mk(new THREE.BoxGeometry(1.2, 1.4, 1.2), M.yel);
const stick = (m, a, b) => { m.position.copy(a).add(b).multiplyScalar(.5); m.scale.set(1, Math.max(.01, a.distanceTo(b)), 1); m.quaternion.setFromUnitVectors(UP, tv.copy(b).sub(a).normalize()); };
// кабель 35 кВ: траншея уходит к подстанции, барабан, ячейка у башни
const trench = mk(new THREE.BoxGeometry(1, .5, 1.3), M.trench, 0, -.2, 0, world, false), cableT = mk(new THREE.BoxGeometry(1, .16, .5), M.cable, 0, -.3, 0, world, false), trFill = mk(new THREE.BoxGeometry(1, .08, 1.5), M.sub, 0, .03, 0, world, false), drum = mk(new THREE.CylinderGeometry(1.5, 1.5, 1.6, 24).rotateX(Math.PI / 2), M.form, 0, 1.6, 4);
const beacon = mk(new THREE.SphereGeometry(.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 }), 0, H + 3.6, -6.6, world, false);

/* ---------- сцена как функция b ---------- */
const A = new THREE.Vector3(), B3 = new THREE.Vector3(), load = new THREE.Vector3(), tip = new THREE.Vector3(), P0 = new THREE.Vector3();
// подъём с раскладки: деталь встаёт вертикально, идёт к оси башни и опускается на место
function lift(g, p, vertical) { const u = g.userData; if (p <= 0) { g.position.copy(u.lay); g.rotation.z = vertical ? Math.PI / 2 : 0; return false; } if (p >= 1) { g.position.copy(u.to); g.rotation.z = 0; return false; }
  const a = eio(sg(p, 0, .34)), t = eio(sg(p, .34, .74)), d = eio(sg(p, .74, 1)), top = u.to.y + 9; g.rotation.z = vertical ? Math.PI / 2 * (1 - a) : 0;
  g.position.set(lerp(u.lay.x, u.to.x, t), lerp(lerp(u.lay.y, top, a), u.to.y, d), lerp(u.lay.z, u.to.z, t)); load.copy(g.position); load.y += vertical ? SL / 2 * Math.cos(g.rotation.z) + .6 : 3.2; return true; }
const secWin = k => k < 3 ? [4.05 + k * .317, 4.05 + (k + 1) * .317] : [5 + (k - 3) / 2, 5 + (k - 2) / 2], bladeAng = j => (90 - 120 * j) * RAD;
let spin = 0, rot = 0, lastT = 0;
function build(b, t) { let k;
  k = sg(b, 0, .55); roadSub.visible = k > 0; roadSub.scale.x = Math.max(.01, 260 * k); roadSub.position.x = -323 + 130 * k; k = sg(b, .5, 1); roadTop.visible = k > 0; roadTop.scale.x = Math.max(.01, 260 * k); roadTop.position.x = -323 + 130 * k;
  k = eio(sg(b, 1, 1.5)); padSub.visible = k > 0; padSub.scale.z = Math.max(.01, k); padSub.position.z = -31 + 31 * k; k = eio(sg(b, 1.45, 2)); padTop.visible = k > 0; padTop.scale.z = Math.max(.01, k); padTop.position.z = -30.5 + 30.5 * k;
  roller.visible = b > .45 && b < 2.05; if (roller.visible) { if (b < 1) roller.position.set(-323 + 260 * sg(b, .5, 1) - 6, .45, 0); else roller.position.set(-40 + 14 * Math.sin(t * .7), .55, -31 + 61 * eio(sg(b, 1.05, 2)) - 4); roller.rotation.y = b < 1 ? 0 : Math.PI / 2; }
  // котлован
  const dig = eio(sg(b, 2, 2.25)); lid.visible = dig <= 0; pit.visible = dig > 0; pit.scale.y = Math.max(.001, dig);
  exc.visible = b >= 1.95 && b < 2.3 || b >= 3.84 && b < 4.02; if (exc.visible) { const w = Math.sin(t * 1.6); exc.position.set(0, 0, -(RT + 4.2)); excArm.rotation.z = .25 + .3 * w; excStick.rotation.z = -1.5 - .5 * w; exc.rotation.y = -Math.PI / 2 + .5 * Math.sin(t * .5); }
  const back = sg(b, 3.86, 4), sp = b < 2 ? 0 : b < 3.86 ? dig : 1 - back * .82; spoil.visible = sp > .02; spoil.scale.setScalar(Math.max(.02, sp)); spoil.position.y = 2.75 * sp;
  blind.visible = b >= 2.25; { const q = sg(b, 2.25, 2.32); blind.scale.set(Math.max(.01, q), 1, Math.max(.01, q)); }
  // анкерная корзина и закладные трубы
  ringLo.visible = b >= 2.32; show(bolts, sg(b, 2.34, 2.43)); k = eio(sg(b, 2.42, 2.46)); ringUp.visible = b >= 2.42; ringUp.position.y = (1 - k) * 6;
  ducts.forEach((d, j) => { d.visible = b >= 2.46 + j * .012; });
  // арматура по порядку: нижние радиальные, нижние кольца, фиксаторы, верхние радиальные, верхние кольца, каркас подколонника
  const cast = b >= 3.62; show(botRad, cast ? 0 : sg(b, 2.52, 2.62)); k = sg(b, 2.62, 2.72); ringsBot.forEach((r, j) => r.visible = !cast && j < k * ringsBot.length);
  show(links, cast ? 0 : sg(b, 2.72, 2.76)); show(topRad, cast ? 0 : sg(b, 2.76, 2.84)); k = sg(b, 2.84, 2.9); ringsTop.forEach((r, j) => r.visible = !cast && j < k * ringsTop.length);
  show(pedBars, cast ? 0 : sg(b, 2.8, 2.88)); k = sg(b, 2.86, 2.92); hoops.forEach((r, j) => r.visible = !cast && j < k * hoops.length);
  eIn.visible = b >= 2.92; formOut.visible = b >= 2.93 && b < 3.66; formPed.visible = b >= 2.96 && b < 3.68; k = eio(sg(b, 3.6, 3.68)); formOut.position.y = -2.53 + k * 3; formPed.position.y = .5 + k * 4;
  // бетон: приямок, плита (уровень поднимается), подколонник
  lowpit.visible = b >= 3.02; const lv = lerp(-2.7, 0, sg(b, 3.08, 3.5)), pouring = b >= 3.08 && b < 3.5; slab.visible = b >= 3.08; POUR.constant = lv + .001; slabCap.visible = pouring; slabCap.position.y = lv; slabCap.scale.set(coneR(lv), 1, coneR(lv));
  const pv = lerp(0, 1.0, sg(b, 3.5, 3.6)), pp = b >= 3.5 && b < 3.6; pedestal.visible = b >= 3.5; PED.constant = pv + .001; pedCap.visible = pp; pedCap.position.y = pv; grout.visible = b >= 3.7;
  { const c = sg(b, 3.5, 3.72); M.conc.color.setHex(0x8b8f90).lerp(tc.setHex(0xb4b5b2), c); M.ped.color.setHex(0x8b8f90).lerp(tc.setHex(0xc0c1be), sg(b, 3.6, 3.72)); }
  pump.visible = b >= 2.98 && b < 3.64; for (const o of [...pumpBoom, hose]) o.visible = pump.visible; mixers.forEach((m, j) => { m.visible = pump.visible; m.userData.drum.rotation.x = t * 2; m.position.x = 34 + j * 11 + (j ? 3 * Math.sin(t * .4) : 0); });
  if (pump.visible) { const ang = t * .25, rr = b < 3.5 ? 2 + 9 * (.5 + .5 * Math.sin(t * .31)) : 1.5; A.set(19, 2.2, -10); B3.set(14, 16, -8); stick(pumpBoom[0], A, B3); A.set(Math.cos(ang) * rr * .5 + 5, 12, Math.sin(ang) * rr * .5 - 4); stick(pumpBoom[1], B3, A); B3.set(Math.cos(ang) * rr, 6.5, Math.sin(ang) * rr); stick(pumpBoom[2], A, B3); A.set(B3.x, Math.max(lv, pp ? pv : -2.7) + .4, B3.z); stick(hose, B3, A); }
  // наружное заземление и обратная засыпка слоями
  faces.visible = cutBox.visible = section; for (const o of fSoil) o.visible = dig < 1; for (const o of fBlind) o.visible = b >= 2.32; for (const o of fSlab) o.visible = b >= 3.08; for (const o of fPed) o.visible = b >= 3.5; fFill.forEach((g, j) => g.forEach(o => o.visible = back * fill.length > j));
  eOut.visible = b >= 3.72; show(eLinks, sg(b, 2.92, 2.96) * .5 + sg(b, 3.74, 3.8) * .5); show(eRods, sg(b, 3.78, 3.86)); fill.forEach((f, j) => f.visible = back * fill.length > j);
  // подъёмы
  load.set(-20, H + 20, 0); let lifting = false; ghost.visible = b < 9.4;
  secs.forEach((s, j) => { const [a, c] = secWin(j); s.visible = b >= 3.9; if (lift(s, sg(b, a, c), true)) lifting = true; ghost.children[j].visible = b < c; });
  nac.visible = hub.visible = b >= 3.9; if (lift(nac, sg(b, 6.02, 6.6), false)) lifting = true; ghost.children[NS].visible = b < 6.6; if (lift(hub, sg(b, 6.62, 7), false)) lifting = true;
  rotor.visible = b >= 7; if (b < 8) { const j = Math.max(0, Math.min(2, Math.floor((b - 7) * 3))), pj = b < 7 ? 1 : (b - 7) * 3 - j, from = j ? bladeAng(j - 1) : bladeAng(0); rot = from + (bladeAng(j) - from) * eio(sg(pj, 0, .2)); }
  for (let j = 0; j < 3; j++) { const a = 7 + j / 3, p = sg(b, a, a + 1 / 3), q = eio(sg(p, .3, 1)), up = eio(sg(p, .08, .3)); blades[j].visible = p > .3; blades[j].position.set(0, 55 * (1 - q), 0); laid[j].visible = b >= 3.9 && p <= .3; laid[j].position.y = 2.6 + up * 26; ghost.children[NS + 1 + j].visible = p < 1;
    if (p > 0 && p < 1) { lifting = true; if (p <= .3) load.set(-112 + 38, 2.6 + up * 26 + 2.5, 34 + j * 5.5); else load.set(-(36 + 55 * (1 - q)), H + 2.4, 7.4); } }
  rotor.rotation.z = rot;
  const cin = eio(sg(b, 3.9, 4.05)), cout = eio(sg(b, 9.02, 9.3)), con = b >= 3.9 && b < 9.3; crane.visible = boom.visible = rope.visible = hookB.visible = con; crane.position.x = -36 - (1 - cin) * 70 - cout * 80;
  if (con) { if (!lifting) load.set(-14, 30 + 8 * Math.sin(t * .4), -4); P0.set(crane.position.x + 2, 5.5, crane.position.z); tip.set(load.x, Math.max(H + 46, load.y + 14), load.z); stick(boom, P0, tip); stick(rope, tip, load); hookB.position.copy(load); }
  // кабель и пуск
  k = sg(b, 8, 8.55); trench.visible = k > 0 && b < 8.95; trench.scale.x = Math.max(.01, 170 * k); trench.position.x = 17 + 85 * k; const kc = sg(b, 8.15, 8.65); cableT.visible = kc > 0 && b < 8.95; cableT.scale.x = Math.max(.01, 170 * kc); cableT.position.x = 17 + 85 * kc;
  const kf = sg(b, 8.6, 8.95); trFill.visible = kf > 0; trFill.scale.x = Math.max(.01, 170 * kf); trFill.position.x = 17 + 85 * kf; drum.visible = b >= 8.05 && b < 8.7; drum.position.x = 20 + 170 * kc; drum.rotation.z = -kc * 40;
  spin = b < 9.3 ? 0 : eio(sg(b, 9.3, 10)); beacon.visible = b >= 9.3 && Math.sin(t * 5) > 0;
}
const tc = new THREE.Color();

/* ---------- подписи: что сейчас делают и выноски с цифрами чертежа ---------- */
const STEPS = ['Подъезд', 'Монтажная площадка', 'Котлован и арматура', 'Бетонирование фундамента', 'Башня: нижние и средние секции', 'Башня: верхняя секция', 'Гондола и ступица', 'Лопасти', 'Кабель 35 кВ', 'Пусконаладка и пуск'];
const OPS = [[0, 'Земляное полотно дороги'], [.5, 'Щебёночное покрытие и уплотнение катком'], [1, 'Планировка крановой площадки'], [1.45, 'Отсыпка щебнем и уплотнение площадки'], [2, 'Разработка котлована: подошва на −2,80, откос 1:4'], [2.25, 'Подбетонка C16/20 толщиной 100 мм'], [2.32, 'Анкерная корзина: 2 × 100 болтов M48 класса 10.9'], [2.46, 'Закладные трубы под кабель 35 кВ и оптику'],
  [2.52, 'Нижняя сетка: радиальные стержни'], [2.62, 'Нижняя сетка: кольцевые стержни'], [2.72, 'Фиксаторы и верхняя сетка по уклону плиты'], [2.84, 'Кольца верхней сетки и каркас подколонника'], [2.92, 'Внутреннее кольцо заземления, опалубка'], [3.02, 'Бетон приямка под нижним кольцом: C40/50, 9,7 м³'], [3.08, 'Бетонирование плиты без перерыва: C35/45, 636,6 м³'], [3.5, 'Подколонник: C50/60, 34,2 м³'],
  [3.6, 'Снятие опалубки, уход за бетоном, набор прочности'], [3.72, 'Наружное кольцо заземления: полоса 60 × 6 мм, электроды'], [3.86, 'Обратная засыпка слоями по 300 мм с уплотнением'], [4, 'Кран на площадке. Секция 1 встаёт на анкерные болты'], [4.37, 'Секция 2'], [4.68, 'Секция 3'], [5, 'Секция 4'], [5.5, 'Секция 5: верх башни'], [6, 'Подъём гондолы на 110 м'], [6.62, 'Подъём ступицы'],
  [7, 'Лопасть 1: подъём горизонтально, стыковка со ступицей'], [7.33, 'Ротор провёрнут на 120°. Лопасть 2'], [7.67, 'Лопасть 3'], [8, 'Траншея и кабель 35 кВ к подстанции'], [8.6, 'Засыпка траншеи, подключение ячейки 35 кВ'], [9, 'Кран уходит к следующей ВЭУ. Проверки без напряжения'], [9.3, 'Синхронизация с сетью и пробный пуск 24 часа']];
const TAGS = [[2.05, 2.5, [RT, 0, 0], 'Откос 1:4, глубина 2,8 м'], [2.26, 2.6, [9, -2.7, 6], 'Подбетонка C16/20, 100 мм'], [2.34, 3.0, [R1, 1.3, 0], '2 × 100 болтов M48, кл. 10.9 · Ø4782 и Ø4346'], [2.47, 3.0, [12, -3, 0], 'Закладные трубы'], [2.55, 3.05, [8, -2.6, -6], 'Арматура S500 · 81,8 т на фундамент'],
  [3.1, 3.62, [9, -1.6, 5], 'Плита Ø26 м · C35/45 · 636,6 м³'], [3.5, 3.9, [3.3, .6, 0], 'Подколонник Ø6,6 м · C50/60 · 34,2 м³'], [3.73, 4.0, [14, -2.6, 0], 'Заземление: полоса 60 × 6 мм, не более 4 Ом'], [3.88, 4.3, [10, .8, 6], 'Засыпка слоями 300 мм, плотность от 1700 кг/м³'],
  [4.05, 6, [rb, 12, 0], 'Башня: 5 секций, у основания Ø4,56 м'], [6.02, 7, [0, H + 3, -6], 'Гондола: редуктор, генератор, трансформатор'], [7, 8, [-40, H, 7.4], 'Лопасть 95,4 м'], [8.05, 9, [60, 0, 0], 'Кабель 35 кВ к подстанции'], [9.4, 10.1, [0, H, 7.4], 'Ротор 195 м, ось 110 м']];
const tagEls = TAGS.map(t => { const d = document.createElement('div'); d.className = 'tag'; d.innerHTML = `<i></i><span>${t[3]}</span>`; $('#tags').appendChild(d); return d; }), v3 = new THREE.Vector3();
const CAMS = [[0, [60, 78, 150], [-110, 0, -4]], [1, [34, 60, 96], [-36, 0, 0]], [2, [27, 15, 36], [0, -1.6, 0]], [2.3, [15, 9, 21], [0, -1.6, 0]], [2.52, [20, 12.5, 26], [0, -1.8, 0]], [3, [30, 17, 37], [3, -1, 0]], [3.72, [30, 16, 38], [0, -.6, 0]], [4, [-156, 66, 214], [-16, 46, 0]], [7, [-208, 96, 268], [-24, 70, 0]], [8, [126, 62, 150], [44, 8, 0]], [9, [-170, 84, 236], [0, 70, 0]]];

/* ---------- управление ---------- */
const DUR = [5, 6, 26, 22, 9, 7, 9, 10, 6, 8], S = { b: CFG.now, play: false, cam: -1, speed: 1 }, has = CFG.f.length === 10; let tween = null;
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
  if (k === 'start') { S.b = 0; S.play = true; } else if (k === 'play') { if (S.b >= 10) S.b = 0; S.play = !S.play; } else if (k === 'now') { S.b = CFG.now; S.play = false; } else if (k === 'sec') { section = !section; applyClip(); a.classList.toggle('on', section); if (section && S.b < 4.05) flyTo([4, 7.5, 47], [0, -1.4, 0], 1100); else { S.cam = -1; autoCam(900); } return; } else if (k === 'speed') { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? .5 : 1; a.textContent = '× ' + String(S.speed).replace('.', ','); return; }
  else if (k === 'units') { location.href = 'wtg.html?v=13#wtg=' + encodeURIComponent(CFG.wtg); return; } S.cam = -1; autoCam(900); });
$('#b-range').addEventListener('input', e => { S.b = +e.target.value; S.play = false; autoCam(700); });
canvas.addEventListener('pointerdown', () => { tween = null; });
addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); S.play = !S.play; } });
function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } }
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; let last = performance.now();
autoCam(0);
(function loop(now) { const dt = Math.min(.1, (now - last) / 1000); last = now; resize();
  if (S.play) { S.b = Math.min(10, S.b + dt * S.speed / DUR[Math.min(9, Math.floor(S.b))]); if (S.b >= 10) S.play = false; autoCam(1600); }
  if (tween) { const k = Math.min(1, (now - tween.t0) / tween.ms), q = ease(k); camera.position.lerpVectors(tween.p0, tween.p1, q); controls.target.lerpVectors(tween.a0, tween.a1, q); if (k >= 1) tween = null; }
  controls.update(); build(S.b, now / 1000); rot += spin * 8.3 * Math.PI / 30 * dt; if (S.b >= 8) rotor.rotation.z = rot;
  const d = camera.position.distanceTo(controls.target), sh = Math.max(40, Math.min(260, d * .55)), sc = sun.shadow.camera; sc.left = -sh; sc.right = sh; sc.top = sh; sc.bottom = -sh; sc.near = 10; sc.far = sh * 8; sc.updateProjectionMatrix(); sun.target.position.copy(controls.target); sun.position.copy(controls.target).add(tv.set(-.55, .9, .5).multiplyScalar(sh * 3));
  renderer.render(scene, camera); hud();
  const w = canvas.clientWidth, h = canvas.clientHeight; TAGS.forEach((t, j) => { const on = S.b >= t[0] && S.b < t[1]; let vis = on; if (on) { v3.set(...t[2]).project(camera); const x = (v3.x * .5 + .5) * w, y = (-v3.y * .5 + .5) * h; vis = v3.z < 1 && x > 300 && x < w - 40 && y > 70 && y < h - 110; if (vis) tagEls[j].style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; } tagEls[j].style.display = vis ? '' : 'none'; });
  requestAnimationFrame(loop); })(last);
window.LIVE = { S, camera, controls, build, scene, M, parts: { slab, slabCap, pedestal, POUR } };
