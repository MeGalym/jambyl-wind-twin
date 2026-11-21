/* 3D-сцена стройки одной ВЭУ: площадка, фундамент по чертежу 104218-CI-DW-040, заземление по 104218-EL-DW-040, турбина, краны.
   Одна функция build(b, t) ставит всё по шкале b = 0…10. Модуль общий: его использует экран стройки (build3d.js) и съёмка сверху (aerial3d.js). */
import * as THREE from 'three';
export const H = 110, NS = 5;
const RAD = Math.PI / 180;
export function createSite(opts = {}) {
const scene = new THREE.Scene();
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
const groundOut = mk(new THREE.RingGeometry(60, 1500, 96, 1).rotateX(-Math.PI / 2), M.ground, 0, 0, 0, world, false), groundIn = mk(new THREE.RingGeometry(RT, 60.05, 96, 1).rotateX(-Math.PI / 2), mat(0xcbc3ad, { cut: 1 }), 0, 0, 0, world, false);
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
// секция башни: обечайка, фланцы внутрь с болтами, площадка, лестница; у нижней — дверь и крыльцо. На раскладке секции лежат на ложементах
const joints = [], cradles = new THREE.Group(); world.add(cradles); const amber = new THREE.MeshBasicMaterial({ color: 0xf5b544 }), grate = mat(0x4a525c, { side: THREE.DoubleSide, r: .8 });
function flangeBolts(g, r, y) { const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(.035, .035, .36, 6), M.bolt, 72); for (let q = 0; q < 72; q++) { const a = q / 72 * 6.2832; dm.position.set(Math.cos(a) * r, y, Math.sin(a) * r); dm.quaternion.identity(); dm.scale.set(1, 1, 1); dm.updateMatrix(); im.setMatrixAt(q, dm.matrix); } g.add(im); }
for (let k = 0; k < NS; k++) { const ra = lerp(rb, rt, k / NS), rc = lerp(rb, rt, (k + 1) / NS), g = new THREE.Group(); world.add(g);
  mk(new THREE.CylinderGeometry(rc, ra, SL, 56, 1, true), mat(0xf2f3f4, { r: .5, side: THREE.DoubleSide }), 0, 0, 0, g);
  for (const s of [-1, 1]) { const r = s < 0 ? ra : rc, y = s * (SL / 2 - .07); mk(lathe([[r - .32, -.07], [r + .015, -.07], [r + .015, .07], [r - .32, .07], [r - .32, -.07]], 56), M.steel, 0, y, 0, g); flangeBolts(g, r - .17, y - s * .1); }
  mk(new THREE.RingGeometry(.55, rc - .06, 40).rotateX(-Math.PI / 2), grate, 0, SL / 2 - 1.5, 0, g, false); mk(new THREE.BoxGeometry(.5, SL - 2.4, .06), M.steel, 0, -.4, -(ra + rc) / 2 + .2, g, false);
  if (!k) { mk(new THREE.BoxGeometry(1.0, 2.2, .12), M.dark, 0, -SL / 2 + 2.6, ra - .02, g); mk(new THREE.BoxGeometry(1.5, .12, 1.3), M.steel, 0, -SL / 2 + 1.45, ra + .62, g); for (let q = 0; q < 5; q++) mk(new THREE.BoxGeometry(1.2, .08, .32), M.steel, 0, -SL / 2 + 1.25 - q * .26, ra + 1.4 + q * .3, g); }
  g.userData = { to: new THREE.Vector3(0, y0 + SL * (k + .5), 0), lay: new THREE.Vector3(-51, ra + 1.05, -24 + k * 6.2), half: SL / 2 }; secs.push(g);
  for (const dx of [-7, 7]) mk(new THREE.BoxGeometry(.9, 1.0, 3.8), M.dark, -51 + dx, .95, -24 + k * 6.2, cradles);
  mk(new THREE.CylinderGeometry(rc, ra, SL, 32, 1, true), M.ghost, 0, y0 + SL * (k + .5), 0, ghost, false);
  joints.push(mk(new THREE.TorusGeometry(ra + .12, .09, 8, 64).rotateX(Math.PI / 2), amber, 0, y0 + SL * k, 0, world, false)); }
// гондола: скруглённый корпус, охладитель на крыше, фланец главного вала, опора поворота; ступица с обтекателем и тремя гнёздами под лопасти
const nac = new THREE.Group(); world.add(nac); { const sh = new THREE.Shape(), w = 2.6, h = 2.45, r = 1.05; sh.moveTo(-w + r, -h); sh.lineTo(w - r, -h); sh.quadraticCurveTo(w, -h, w, -h + r); sh.lineTo(w, h - r); sh.quadraticCurveTo(w, h, w - r, h); sh.lineTo(-w + r, h); sh.quadraticCurveTo(-w, h, -w, h - r); sh.lineTo(-w, -h + r); sh.quadraticCurveTo(-w, -h, -w + r, -h);
  const hull = new THREE.ExtrudeGeometry(sh, { depth: 12.2, bevelEnabled: true, bevelThickness: .7, bevelSize: .6, bevelSegments: 5, curveSegments: 10 }).translate(0, 0, -6.1); mk(hull, M.nac, 0, .25, -2.9, nac);
  mk(new THREE.CylinderGeometry(1.95, 2.35, 1.5, 40).rotateX(Math.PI / 2), M.nac, 0, .1, 4.5, nac); mk(new THREE.CylinderGeometry(1.55, 1.55, .5, 40).rotateX(Math.PI / 2), M.steel, 0, 0, 5.45, nac);
  mk(new THREE.BoxGeometry(3.6, .95, 3.0), M.steel, 0, 3.15, -6.4, nac); for (const x of [-1, 1]) mk(new THREE.CylinderGeometry(.62, .62, .1, 24), M.dark, x, 3.65, -6.4, nac, false);
  mk(new THREE.CylinderGeometry(.05, .05, 2.2, 6), M.dark, 1.2, 3.8, -8.4, nac, false); mk(new THREE.BoxGeometry(.5, .12, .12), M.dark, 1.2, 4.9, -8.4, nac, false); mk(new THREE.BoxGeometry(5.26, .5, 9), M.dark, 0, -1.2, -3.4, nac).scale.set(1, 1, 1);
  mk(new THREE.CylinderGeometry(1.72, 1.72, 1.2, 40), M.steel, 0, -2.75, 0, nac); mk(new THREE.BoxGeometry(1.5, 1.2, .08), M.dark, 0, 0, -9.62, nac, false); }
nac.userData = { to: new THREE.Vector3(0, H, 0), lay: new THREE.Vector3(-27, 4.0, 20), half: 3.2 }; for (const dz of [-5, 2]) mk(new THREE.BoxGeometry(5.6, .7, .9), M.dark, -27, .8, 17.1 + dz, cradles);
mk(new THREE.BoxGeometry(5.2, 4.9, 13), M.ghost, 0, H + .25, -2.9, ghost, false);
const hub = new THREE.Group(); world.add(hub); { mk(new THREE.SphereGeometry(2.25, 36, 24), M.white, 0, 0, 0, hub).scale.set(1, 1, 1.1); mk(lathe([[0, 2.9], [.9, 2.5], [1.7, 1.6], [2.0, .6]], 36).rotateX(Math.PI / 2), M.white, 0, 0, .9, hub);
  for (let q = 0; q < 3; q++) { const a = new THREE.Group(); a.rotation.z = q * 2 * Math.PI / 3; hub.add(a); mk(new THREE.CylinderGeometry(1.64, 1.64, .7, 40), M.steel, 0, 1.78, 0, a); mk(new THREE.CylinderGeometry(1.45, 1.45, .72, 40), M.dark, 0, 1.79, 0, a, false); } }
hub.userData = { to: new THREE.Vector3(0, H, 7.4), lay: new THREE.Vector3(-27, 3.2, 5), half: 2.6 }; mk(new THREE.BoxGeometry(4, .6, 4), M.dark, -27, .7, 5, cradles);
function bladeGeometry(L) { const NSg = 28, NC = 12, pos = [], idx = []; for (let k = 0; k <= NSg; k++) { const r = k / NSg, y = 2.1 + r * L, q = Math.max(0, (r - .2) / .8), chord = r < .03 ? 3.2 : r < .2 ? 3.2 + 2.0 * (r - .03) / .17 : 5.2 - 4.5 * Math.pow(q, .8), thick = r < .03 ? 3.2 : r < .2 ? 3.2 - 1.9 * (r - .03) / .17 : 1.3 * Math.pow(1 - q, 1.3) + .1, tw = (15 * (1 - r) * (1 - r) - 2) * RAD;
    for (let c = 0; c < NC; c++) { const a = c / NC * Math.PI * 2, ex = Math.cos(a) * chord / 2 - (r > .03 ? chord * .16 * Math.min(1, (r - .03) / .17) : 0), ez = Math.sin(a) * thick / 2; pos.push(ex * Math.cos(tw) - ez * Math.sin(tw), y, ex * Math.sin(tw) + ez * Math.cos(tw)); } }
  for (let k = 0; k < NSg; k++) for (let c = 0; c < NC; c++) { const a = k * NC + c, b2 = k * NC + (c + 1) % NC; idx.push(a, a + NC, b2, b2, a + NC, b2 + NC); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; }
const BL = 95.4, bladeGeo = bladeGeometry(BL), rotor = new THREE.Group(); rotor.position.set(0, H, 7.4); world.add(rotor); const blades = [], laid = [];
for (let k = 0; k < 3; k++) { const arm = new THREE.Group(); arm.rotation.z = k * 2 * Math.PI / 3; rotor.add(arm); const m = mk(bladeGeo, M.white, 0, 0, 0, arm); blades.push(m);
  const l = mk(bladeGeo, M.white, -112, 2.6, 34 + k * 5.5); l.rotation.set(0, 0, -Math.PI / 2); laid.push(l);      // лопасть на раскладке, вдоль дороги
  const gh = mk(bladeGeo, M.ghost, 0, 0, 0, new THREE.Group(), false); gh.parent.rotation.z = k * 2 * Math.PI / 3 + Math.PI / 2; gh.parent.position.set(0, H, 7.4); ghost.add(gh.parent); }

/* ---------- техника ---------- */
function machine(x, z, ry) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry || 0; world.add(g); return g; }
// общие детали техники: гусеница с катками, колесо с диском, кабина со стеклом, выносная опора
M.glass = mat(0x1d2a38, { r: .15, m: .6 }); M.tyre = mat(0x1c1f24, { r: .95 }); M.yel2 = mat(0xd99a1c, { r: .6, m: .2 }); M.blue = mat(0x2f6fb5, { r: .5 });
function track(g, len, z, w = .75, h = .95) { mk(new THREE.BoxGeometry(len - h, h, w), M.tyre, 0, h / 2, z, g); for (const s of [-1, 1]) mk(new THREE.CylinderGeometry(h / 2, h / 2, w, 20).rotateX(Math.PI / 2), M.tyre, s * (len - h) / 2, h / 2, z, g); mk(new THREE.BoxGeometry(len - h - .3, h * .5, w * .6), M.dark, 0, h / 2, z, g, false);
  const n = Math.max(3, Math.round(len / 1.1)); for (let k = 0; k < n; k++) mk(new THREE.CylinderGeometry(h * .2, h * .2, w + .06, 12).rotateX(Math.PI / 2), M.steel, -(len - h) / 2 + (k + .5) * (len - h) / n, h * .24, z, g, false); }
function wheel(g, x, z, r = .55, w = .45) { mk(new THREE.CylinderGeometry(r, r, w, 22).rotateX(Math.PI / 2), M.tyre, x, r, z, g); mk(new THREE.CylinderGeometry(r * .5, r * .5, w + .04, 14).rotateX(Math.PI / 2), M.steel, x, r, z, g, false); }
function cabin(g, x, y, z, w, h, d, m) { mk(new THREE.BoxGeometry(w, h, d), m, x, y, z, g); mk(new THREE.BoxGeometry(.06, h * .5, d * .84), M.glass, x + w / 2 + .01, y + h * .18, z, g, false); for (const s of [-1, 1]) mk(new THREE.BoxGeometry(w * .7, h * .46, .06), M.glass, x + w * .08, y + h * .2, z + s * (d / 2 + .01), g, false); mk(new THREE.BoxGeometry(w + .12, .1, d + .12), M.dark, x, y + h / 2 + .05, z, g, false); }
function outrig(g, x, z, len) { const s = Math.sign(z); mk(new THREE.BoxGeometry(.4, .35, len), M.steel, x, 1.1, z - s * len / 2 + s * .2, g); mk(new THREE.CylinderGeometry(.16, .16, 1.1, 10), M.steel, x, .55, z, g); mk(new THREE.CylinderGeometry(.55, .55, .12, 16), M.dark, x, .06, z, g); }
// экскаватор: гусеничная тележка, поворотная платформа с кабиной и противовесом, стрела, рукоять, ковш, гидроцилиндры
const exc = machine(0, 20.5, Math.PI); { track(exc, 4.9, -1.35); track(exc, 4.9, 1.35); mk(new THREE.BoxGeometry(2.6, .5, 2.2), M.dark, 0, .75, 0, exc); mk(new THREE.CylinderGeometry(1.0, 1.0, .3, 24), M.steel, 0, 1.12, 0, exc);
  mk(new THREE.BoxGeometry(3.9, 1.35, 2.9), M.yel, -.6, 1.95, 0, exc); mk(new THREE.CylinderGeometry(1.45, 1.45, 1.35, 20, 1, false, Math.PI / 2, Math.PI), M.yel2, -2.5, 1.95, 0, exc); mk(new THREE.BoxGeometry(1.6, .5, 1.6), M.dark, -1.6, 2.86, -.4, exc); mk(new THREE.CylinderGeometry(.09, .09, .9, 8), M.dark, -2.2, 3.4, -.9, exc, false);
  cabin(exc, .65, 2.45, .85, 1.5, 1.75, 1.15, M.yel); }
const excArm = new THREE.Group(); excArm.position.set(.9, 2.2, -.45); exc.add(excArm); mk(new THREE.BoxGeometry(5.6, .62, .5), M.yel, 2.8, 0, 0, excArm); mk(new THREE.BoxGeometry(1.4, .9, .56), M.yel, .7, -.1, 0, excArm); mk(new THREE.CylinderGeometry(.11, .11, 2.6, 8).rotateZ(Math.PI / 2 - .35), M.steel, 1.6, -.55, .34, excArm, false);
const excStick = new THREE.Group(); excStick.position.set(5.6, 0, 0); excArm.add(excStick); mk(new THREE.BoxGeometry(3.3, .46, .42), M.yel, 1.65, 0, 0, excStick); mk(new THREE.CylinderGeometry(.09, .09, 2.2, 8).rotateZ(Math.PI / 2), M.steel, .9, .42, 0, excStick, false);
{ const sh = new THREE.Shape(); sh.moveTo(0, .35); sh.lineTo(.9, .45); sh.quadraticCurveTo(1.5, -.2, .9, -.95); sh.lineTo(.1, -.75); sh.quadraticCurveTo(.6, -.2, 0, .35); mk(new THREE.ExtrudeGeometry(sh, { depth: 1.15, bevelEnabled: false }).translate(0, 0, -.575), M.dark, 3.2, -.05, 0, excStick); for (let k = 0; k < 4; k++) mk(new THREE.BoxGeometry(.3, .08, .12), M.steel, 4.25, -1.0, -.42 + k * .28, excStick, false); }
exc.rotation.y = -Math.PI / 2;
const dumper = machine(9, -(RT + 9), -.3); { for (const xx of [-2.6, -1.3, 2.6]) for (const zz of [-1.15, 1.15]) wheel(dumper, xx, zz, .62, .5); mk(new THREE.BoxGeometry(7.6, .4, 1.6), M.dark, 0, 1.0, 0, dumper); cabin(dumper, 2.9, 2.2, 0, 1.9, 2.0, 2.4, M.yel);
  const sh = new THREE.Shape(); sh.moveTo(-2.9, 0); sh.lineTo(2.4, 0); sh.lineTo(2.9, 1.5); sh.lineTo(-3.3, 1.5); mk(new THREE.ExtrudeGeometry(sh, { depth: 2.5, bevelEnabled: false }).translate(0, 0, -1.25), M.yel2, -1.2, 1.25, 0, dumper); mk(new THREE.SphereGeometry(1.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.spoil, -1.4, 2.6, 0, dumper).scale.set(1.7, .55, .75); }
// грунтовый каток: валец в раме, шарнир, моторный отсек, кабина с защитной рамой, задние колёса
const roller = machine(-40, 0); { mk(new THREE.CylinderGeometry(.82, .82, 2.15, 28).rotateX(Math.PI / 2), M.steel, 1.75, .82, 0, roller); for (const zz of [-1.2, 1.2]) mk(new THREE.BoxGeometry(2.3, .34, .16), M.yel, 1.45, .95, zz, roller); mk(new THREE.BoxGeometry(.35, .7, 2.5), M.yel, .35, 1.1, 0, roller);
  mk(new THREE.BoxGeometry(2.5, 1.15, 1.9), M.yel, -1.3, 1.55, 0, roller); mk(new THREE.BoxGeometry(1.2, .5, 1.7), M.dark, -1.9, 2.3, 0, roller); cabin(roller, -.5, 2.75, 0, 1.4, 1.5, 1.6, M.yel); for (const zz of [-.95, .95]) wheel(roller, -1.6, zz, .78, .6); }
// автобетононасос: шасси, кабина, выносные опоры, приёмный бункер, поворотная колонна стрелы
const pump = machine(22, -10, 0); { for (const xx of [-4.2, -2.9, 2.2, 3.6]) for (const zz of [-1.1, 1.1]) wheel(pump, xx, zz); mk(new THREE.BoxGeometry(10.6, .45, 1.5), M.dark, -.2, 1.05, 0, pump); cabin(pump, 4.1, 2.2, 0, 2.1, 1.9, 2.4, M.red); mk(new THREE.BoxGeometry(6.6, 1.3, 2.3), M.red, -1.4, 1.9, 0, pump);
  mk(new THREE.CylinderGeometry(.7, .8, 1.1, 20), M.steel, -3, 3.0, 0, pump); mk(new THREE.BoxGeometry(1.5, 1.0, 2.0), M.steel, -5.4, 1.5, 0, pump); mk(new THREE.BoxGeometry(1.2, .08, 1.7), M.dark, -5.4, 2.02, 0, pump, false); for (const [x, z] of [[2.2, 3.4], [2.2, -3.4], [-3.4, 3.8], [-3.4, -3.8]]) outrig(pump, x, z, Math.abs(z) - .9); }
const pumpBoom = [0, 1, 2].map(k => mk(new THREE.CylinderGeometry(.15 - k * .02, .21 - k * .02, 1, 8), M.red)), hose = mk(new THREE.CylinderGeometry(.11, .11, 1, 8), M.dark);
// автобетоносмесители: наклонный барабан с загрузочной воронкой и лотком
const mixers = [0, 1].map(k => { const g = machine(34 + k * 11, -10, 0); for (const xx of [-3, -1.7, 2.6]) for (const zz of [-1.1, 1.1]) wheel(g, xx, zz); mk(new THREE.BoxGeometry(8.2, .4, 1.5), M.dark, -.2, 1.0, 0, g); cabin(g, 3.1, 2.15, 0, 1.9, 1.9, 2.4, k ? M.white : M.blue); mk(new THREE.CylinderGeometry(.45, .45, 1.9, 14).rotateX(Math.PI / 2), M.steel, 1.7, 2.3, 0, g);
  const d = mk(lathe([[.5, -2.5], [1.05, -1.9], [1.3, -.4], [1.3, .9], [.75, 2.4], [.5, 2.5]], 28).rotateZ(Math.PI / 2 - .2), M.white, -1.2, 2.75, 0, g); for (const yy of [-1.1, .3]) mk(new THREE.TorusGeometry(1.31, .07, 6, 28).rotateY(Math.PI / 2).rotateZ(-.2), k ? M.blue : M.red, yy * .98, yy * .2, 0, d, false); g.userData.drum = d;
  mk(new THREE.BoxGeometry(1.0, .9, 1.2), M.steel, -4.0, 3.5, 0, g); mk(new THREE.BoxGeometry(1.8, .12, .5), M.steel, -4.7, 2.0, 0, g).rotation.z = -.5; return g; });
// главный кран: гусеничный, решётчатая стрела, мачта с оттяжками и противовес; вспомогательный кран держит низ секции при кантовке
const crane = machine(-36, -6, 0); { track(crane, 13, -4.0, 1.6, 1.7); track(crane, 13, 4.0, 1.6, 1.7); mk(new THREE.BoxGeometry(7, 1.0, 7.2), M.dark, 0, 1.6, 0, crane); mk(new THREE.CylinderGeometry(2.6, 2.6, .5, 32), M.steel, 0, 2.35, 0, crane);
  mk(new THREE.BoxGeometry(10.5, 2.6, 5.2), M.yel, -1.2, 3.95, 0, crane); for (let q = 0; q < 6; q++) mk(new THREE.BoxGeometry(.9, 1.5, .06), M.dark, -4.5 + q * 1.1, 4.0, 2.63, crane, false); mk(new THREE.BoxGeometry(3.4, 1.0, 3.2), M.yel2, -3.6, 5.75, 0, crane);
  cabin(crane, 3.1, 4.3, 3.6, 2.4, 2.5, 2.0, M.yel); for (let q = 0; q < 5; q++) { mk(new THREE.BoxGeometry(3.4, .8, 7.6), q % 2 ? M.yel2 : M.dark, -8.4, 3.0 + q * .86, 0, crane); } for (const zz of [-1.6, 1.6]) mk(new THREE.CylinderGeometry(.5, .5, 1.6, 16).rotateX(Math.PI / 2), M.steel, -4.6, 5.6, zz, crane); mk(new THREE.BoxGeometry(1.6, 1.4, 3.0), M.steel, 2.6, 4.9, 0, crane); }
function lattice() { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.strokeStyle = '#f2b632'; g.lineWidth = 7; g.strokeRect(1, -8, 62, 80); g.lineWidth = 4.5; g.beginPath(); g.moveTo(3, 0); g.lineTo(61, 32); g.lineTo(3, 64); g.moveTo(61, 0); g.lineTo(3, 32); g.lineTo(61, 64); g.stroke(); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const latA = lattice(), latB = lattice(), truss = t => new THREE.MeshStandardMaterial({ map: t, alphaTest: .45, side: THREE.DoubleSide, roughness: .6, metalness: .2 });
const boom = mk(new THREE.CylinderGeometry(.85, 1.35, 1, 4, 1, true), truss(latA)), mast = mk(new THREE.CylinderGeometry(.6, .9, 1, 4, 1, true), truss(latB)), pend = [0, 1].map(() => mk(new THREE.CylinderGeometry(.06, .06, 1, 5), M.dark, 0, 0, 0, world, false));
const rope = mk(new THREE.CylinderGeometry(.07, .07, 1, 6), M.dark, 0, 0, 0, world, false), hookB = mk(new THREE.BoxGeometry(1.3, 1.6, 1.3), M.yel), slings = [0, 1].map(() => mk(new THREE.CylinderGeometry(.045, .045, 1, 5), M.dark, 0, 0, 0, world, false)), yoke = mk(new THREE.BoxGeometry(7, 1.5, 2.6), M.yel);
const aux = machine(-66, -12, 0); { for (const xx of [-3.6, -2.2, 2.0, 3.4]) for (const zz of [-1.2, 1.2]) wheel(aux, xx, zz, .62, .5); mk(new THREE.BoxGeometry(10.4, .7, 2.4), M.yel2, -.2, 1.35, 0, aux); cabin(aux, 4.2, 2.3, 0, 1.9, 1.5, 2.5, M.yel); mk(new THREE.CylinderGeometry(1.1, 1.1, .35, 24), M.steel, -1, 1.9, 0, aux);
  mk(new THREE.BoxGeometry(3.6, 1.5, 2.3), M.yel, -1.8, 2.85, 0, aux); cabin(aux, .4, 3.0, .75, 1.3, 1.5, .95, M.yel); mk(new THREE.BoxGeometry(1.6, 1.3, 2.3), M.dark, -4.0, 2.75, 0, aux); for (const [x, z] of [[2.6, 3.6], [2.6, -3.6], [-3.0, 3.6], [-3.0, -3.6]]) outrig(aux, x, z, Math.abs(z) - 1); }
const auxBoom = mk(new THREE.CylinderGeometry(.28, .55, 1, 4), M.yel), auxRope = mk(new THREE.CylinderGeometry(.05, .05, 1, 5), M.dark, 0, 0, 0, world, false);
const stick = (m, a, b) => { m.position.copy(a).add(b).multiplyScalar(.5); m.scale.set(1, Math.max(.01, a.distanceTo(b)), 1); m.quaternion.setFromUnitVectors(UP, tv.copy(b).sub(a).normalize()); };
// кабель 35 кВ: траншея уходит к подстанции, барабан, ячейка у башни
const trench = mk(new THREE.BoxGeometry(1, .5, 1.3), M.trench, 0, -.2, 0, world, false), cableT = mk(new THREE.BoxGeometry(1, .16, .5), M.cable, 0, -.3, 0, world, false), trFill = mk(new THREE.BoxGeometry(1, .08, 1.5), M.sub, 0, .03, 0, world, false), drum = mk(new THREE.CylinderGeometry(1.5, 1.5, 1.6, 24).rotateX(Math.PI / 2), M.form, 0, 1.6, 4);
const beacon = mk(new THREE.SphereGeometry(.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 }), 0, H + 3.6, -6.6, world, false);

/* ---------- сцена как функция b ---------- */
const A = new THREE.Vector3(), B3 = new THREE.Vector3(), load = new THREE.Vector3(), tip = new THREE.Vector3(), P0 = new THREE.Vector3();
// подъём с раскладки: деталь встаёт вертикально, идёт к оси башни и опускается на место
// подъём с раскладки: кантовка в вертикаль двумя кранами, перенос к оси башни, опускание на фланец, затяжка болтов
const top3 = new THREE.Vector3(), tail3 = new THREE.Vector3(); let dockKey = '', tailing = false;
function lift(g, p, vertical, key) { const u = g.userData; if (p <= 0) { g.position.copy(u.lay); g.rotation.z = vertical ? Math.PI / 2 : 0; return false; } if (p >= 1) { g.position.copy(u.to); g.rotation.z = 0; return false; }
  const a = eio(sg(p, 0, .3)), t = eio(sg(p, .3, .68)), d = eio(sg(p, .68, .93)), top = u.to.y + 9; g.rotation.z = vertical ? Math.PI / 2 * (1 - a) : 0;
  g.position.set(lerp(u.lay.x, u.to.x, t), lerp(lerp(u.lay.y, top, a), u.to.y, d), lerp(u.lay.z, u.to.z, t)); g.updateMatrixWorld(true);
  top3.set(0, u.half, 0).applyMatrix4(g.matrixWorld); load.copy(top3); load.y += vertical ? 3.4 : 4.2; if (vertical && a < 1) { tailing = true; tail3.set(0, -u.half, 0).applyMatrix4(g.matrixWorld); } if (p > .66) dockKey = key; return true; }
const secWin = k => k < 3 ? [4.05 + k * .317, 4.05 + (k + 1) * .317] : [5 + (k - 3) / 2, 5 + (k - 2) / 2], bladeAng = j => (90 - 120 * j) * RAD;
let spin = 0, rot = 0, lastT = 0;
function build(b, t) { let k;
  k = sg(b, 0, .55); roadSub.visible = k > 0; roadSub.scale.x = Math.max(.01, 260 * k); roadSub.position.x = -323 + 130 * k; k = sg(b, .5, 1); roadTop.visible = k > 0; roadTop.scale.x = Math.max(.01, 260 * k); roadTop.position.x = -323 + 130 * k;
  k = eio(sg(b, 1, 1.5)); padSub.visible = k > 0; padSub.scale.z = Math.max(.01, k); padSub.position.z = -31 + 31 * k; k = eio(sg(b, 1.45, 2)); padTop.visible = k > 0; padTop.scale.z = Math.max(.01, k); padTop.position.z = -30.5 + 30.5 * k;
  roller.visible = b > .45 && b < 2.05; if (roller.visible) { if (b < 1) roller.position.set(-323 + 260 * sg(b, .5, 1) - 6, .45, 0); else roller.position.set(-40 + 14 * Math.sin(t * .7), .55, -31 + 61 * eio(sg(b, 1.05, 2)) - 4); roller.rotation.y = b < 1 ? 0 : Math.PI / 2; }
  // котлован
  const dig = eio(sg(b, 2, 2.25)); lid.visible = dig <= 0; pit.visible = dig > 0; pit.scale.y = Math.max(.001, dig);
  exc.visible = b >= 1.95 && b < 2.3 || b >= 3.84 && b < 4.02; dumper.visible = exc.visible; if (exc.visible) { const w = Math.sin(t * 1.6); exc.position.set(0, 0, -(RT + 4.2)); excArm.rotation.z = .25 + .3 * w; excStick.rotation.z = -1.5 - .5 * w; exc.rotation.y = -Math.PI / 2 + .5 * Math.sin(t * .5); }
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
  load.set(-20, H + 20, 0); let lifting = false; ghost.visible = !opts.aerial && b < 9.4;
  dockKey = ''; tailing = false; let bladeLift = false; cradles.visible = b >= 3.9 && b < 9.3;
  secs.forEach((s, j) => { const [a, c] = secWin(j); s.visible = b >= 3.9; if (lift(s, sg(b, a, c), true, 's' + j)) lifting = true; ghost.children[j].visible = b < c; });
  nac.visible = hub.visible = b >= 3.9; if (lift(nac, sg(b, 6.02, 6.6), false, 'n')) lifting = true; ghost.children[NS].visible = b < 6.6; if (lift(hub, sg(b, 6.62, 7), false, 'h')) lifting = true; hub.rotation.z = b >= 6.62 ? rot : 0;
  rotor.visible = b >= 7; if (b < 8) { const j = Math.max(0, Math.min(2, Math.floor((b - 7) * 3))), pj = b < 7 ? 1 : (b - 7) * 3 - j, from = j ? bladeAng(j - 1) : bladeAng(0); rot = from + (bladeAng(j) - from) * eio(sg(pj, 0, .2)); }
  for (let j = 0; j < 3; j++) { const a = 7 + j / 3, p = sg(b, a, a + 1 / 3), q = eio(sg(p, .3, 1)), up = eio(sg(p, .08, .3)); blades[j].visible = p > .3; blades[j].position.set(0, 55 * (1 - q), 0); laid[j].visible = b >= 3.9 && p <= .3; laid[j].position.y = 2.6 + up * 26; ghost.children[NS + 1 + j].visible = p < 1;
    if (p > 0 && p < 1) { lifting = true; bladeLift = true; if (p > .7) dockKey = 'b' + j; if (p <= .3) load.set(-112 + 38, 2.6 + up * 26 + 2.5, 34 + j * 5.5); else load.set(-(36 + 55 * (1 - q)), H + 2.4, 7.4); } }
  rotor.rotation.z = rot;
  const cin = eio(sg(b, 3.9, 4.05)), cout = eio(sg(b, 9.02, 9.3)), con = b >= 3.9 && b < 9.3; crane.visible = boom.visible = rope.visible = hookB.visible = con; crane.position.x = -36 - (1 - cin) * 70 - cout * 80;
  if (con) { if (!lifting) load.set(-14, 30 + 8 * Math.sin(t * .4), -4); P0.set(crane.position.x + 3, 6, crane.position.z); tip.set(load.x, Math.max(H + 46, load.y + 14), load.z); stick(boom, P0, tip); latA.repeat.set(4, boom.scale.y / 3.2);
    A.set(crane.position.x - 17, 48, crane.position.z); stick(mast, P0, A); latB.repeat.set(4, mast.scale.y / 3.2); stick(pend[0], A, tip); B3.set(crane.position.x - 8, 6.5, crane.position.z); stick(pend[1], A, B3); stick(rope, tip, load); hookB.position.copy(load);
    const sl = lifting && !bladeLift; slings.forEach((o, q) => { o.visible = sl; if (sl) { B3.copy(top3); B3.x += (q ? 1 : -1) * 1.5; stick(o, load, B3); } }); }
  mast.visible = pend[0].visible = pend[1].visible = con; if (!con) slings.forEach(o => o.visible = false); yoke.visible = bladeLift; if (bladeLift) { yoke.position.copy(load); yoke.position.y -= 2.2; }
  aux.visible = b >= 3.9 && b < 6.05; auxBoom.visible = auxRope.visible = aux.visible; if (aux.visible) { A.set(aux.position.x - 1, 3.4, aux.position.z); if (tailing) { B3.set(tail3.x, tail3.y + 9, tail3.z); stick(auxBoom, A, B3); stick(auxRope, B3, tail3); } else { B3.set(aux.position.x + 12, 16, aux.position.z); stick(auxBoom, A, B3); tv.set(B3.x, 9, B3.z); stick(auxRope, B3, tv); } }
  joints.forEach((jn, j) => { const [a, c] = secWin(j), p = sg(b, a, c); jn.visible = p > .93 && p < 1 || (b >= c && b < c + .03); jn.scale.setScalar(1 + .04 * Math.sin(t * 9)); });
  // кабель и пуск
  k = sg(b, 8, 8.55); trench.visible = k > 0 && b < 8.95; trench.scale.x = Math.max(.01, 170 * k); trench.position.x = 17 + 85 * k; const kc = sg(b, 8.15, 8.65); cableT.visible = kc > 0 && b < 8.95; cableT.scale.x = Math.max(.01, 170 * kc); cableT.position.x = 17 + 85 * kc;
  const kf = sg(b, 8.6, 8.95); trFill.visible = kf > 0; trFill.scale.x = Math.max(.01, 170 * kf); trFill.position.x = 17 + 85 * kf; drum.visible = b >= 8.05 && b < 8.7; drum.position.x = 20 + 170 * kc; drum.rotation.z = -kc * 40;
  spin = b < 9.3 ? 0 : eio(sg(b, 9.3, 10)); beacon.visible = b >= 9.3 && Math.sin(t * 5) > 0;
}
const tc = new THREE.Color();
// съёмка сверху: земля — спутниковый снимок места ВЭУ, натянутый по границам кадра
let gTex = null, gPlane = null;
function setGround(tex, x0, x1, z0, z1) { if (!gPlane) { const sh = new THREE.Shape(); sh.moveTo(x0 - 40, -z1 - 40); sh.lineTo(x1 + 40, -z1 - 40); sh.lineTo(x1 + 40, -z0 + 40); sh.lineTo(x0 - 40, -z0 + 40); const hole = new THREE.Path(); hole.absarc(0, 0, RT, 0, Math.PI * 2, true); sh.holes.push(hole);
    const uv = g => { const p = g.attributes.position, a = new Float32Array(p.count * 2); for (let k = 0; k < p.count; k++) { a[k * 2] = (p.getX(k) - x0) / (x1 - x0); a[k * 2 + 1] = 1 - (p.getZ(k) - z0) / (z1 - z0); } g.setAttribute('uv', new THREE.BufferAttribute(a, 2)); return g; };
    gTex = new THREE.MeshStandardMaterial({ roughness: 1, color: 0xffffff }); gPlane = mk(uv(new THREE.ShapeGeometry(sh, 48).rotateX(-Math.PI / 2)), gTex, 0, 0, 0, world, false); uv(lid.geometry); lid.material = gTex; groundOut.visible = groundIn.visible = false; }
  gTex.map = tex; gTex.color.setHex(tex ? 0xffffff : 0xcbc3ad); gTex.needsUpdate = true; }
function tick(dt, b) { rot += spin * 8.3 * Math.PI / 30 * dt; if (b >= 8) rotor.rotation.z = rot; }
return { scene, sun, build, tick, setGround, setSection(v) { section = v; applyClip(); }, get section() { return section; }, get dockKey() { return dockKey; }, ghost, K: { RT, R1, rb, y0, SL } };
}