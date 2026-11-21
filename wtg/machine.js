// Геометрия ветроустановки из кода и студия. Корпуса — полые тела вращения, чтобы разрез показывал стенку.
// Ось ротора направлена вдоль +Z (навстречу ветру), ось Y — вверх, начало координат — уровень земли под осью башни.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { NOM, BEARINGS } from './model.js';

const H = NOM.hubH, RAD = Math.PI / 180;
export const UNITS = [    // узел, название, вектор разборки (м), точка выноски
  ['blades', 'Лопасти', [0, 0, 9], [0, H + 30, 14]], ['hub', 'Ступица и приводы лопастей', [0, 0, 9], [0, H + 3.4, 7.4]],
  ['bear1', 'Главный подшипник ГП1', [0, 0, 5.4], [0, H + 1.9, 3.2]], ['shaft', 'Главный вал', [0, 0, 3.6], [0, H + 1.0, 2.2]], ['bear2', 'Главный подшипник ГП2', [0, 0, 1.8], [0, H + 1.9, 1.0]],
  ['gear', 'Редуктор', [0, 0, 0], [0, H + 2.0, -1.3]], ['brake', 'Тормоз и муфта', [0, 0, -1.7], [0, H + 1.2, -3.2]], ['gen', 'Генератор', [0, 0, -3.6], [0, H + 1.7, -5.0]],
  ['conv', 'Преобразователь', [-3.4, 0, -5.4], [-1.25, H + 1.3, -7.7]], ['trf', 'Трансформатор', [3.4, 0, -5.4], [1.25, H + 1.3, -7.7]], ['cool', 'Охладитель', [0, 6.5, -5], [0, H + 3.4, -7.2]],
  ['cover', 'Кожух гондолы', [0, 9.5, 0], [0, H + 3.2, -3]], ['bed', 'Рама гондолы', [0, -2.4, 0], [1.9, H - 1.6, -2]], ['yaw', 'Опорно-поворотное устройство', [0, -4.6, 0], [2.4, H - 2.2, 0]],
  ['tower', 'Башня', [0, -8, 0], [2.6, H - 14, 0]], ['anchor', 'Анкерная корзина', [0, -31, 0], [2.6, 0.2, 0]], ['fnd', 'Фундамент', [0, -39, 0], [9, -1.2, 0]],
];

export function buildMachine(renderer) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0b0d); scene.fog = new THREE.Fog(0x0a0b0d, 520, 1700);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1b1e24, 0.3));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-60, H + 70, 80); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 10, far: 400 }); key.shadow.bias = -0.0006; key.target.position.set(0, H, 0); scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.1); rim.position.set(70, H + 20, -90); scene.add(rim);
  const grid = new THREE.GridHelper(600, 600, 0x2a3038, 0x171a1f); grid.material.transparent = true; grid.material.opacity = .8; scene.add(grid);
  grid.material.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('void main() {', 'void main() {\nif (length(vWp.xz) < 14.6) discard;'); };   // сетка пола 1 м
  // пол с открытым котлованом: фундамент виден целиком
  const soil = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 1 }), soilIn = new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 1, side: THREE.BackSide });
  const floor = new THREE.Group(); floor.position.y = -0.02; scene.add(floor);
  const top = new THREE.Mesh(new THREE.RingGeometry(14.6, 420, 96).rotateX(-Math.PI / 2), soil); top.receiveShadow = true; floor.add(top);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(14.6, 13.7, 3.8, 96, 1, true), soilIn); wall.position.y = -1.9; floor.add(wall);
  const pit = new THREE.Mesh(new THREE.CircleGeometry(13.7, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 1 })); pit.position.y = -3.8; pit.receiveShadow = true; floor.add(pit);

  // материалы; у корпусов — срез: задние грани в плоскости разреза закрашиваются графитовой штриховкой
  const clip = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), cutMats = [], CUT = { value: 0 };
  const mat = (color, metal, rough, cut) => { const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
    if (cut) { m.side = THREE.DoubleSide; cutMats.push(m); m.onBeforeCompile = sh => { sh.uniforms.uCut = CUT; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uCut;').replace('#include <color_fragment>', '#include <color_fragment>\nif (!gl_FrontFacing && uCut > 0.5) { float h = step(0.5, fract((vWp.y + vWp.z) * 4.0)); diffuseColor.rgb = mix(vec3(0.10, 0.11, 0.12), vec3(0.20, 0.21, 0.23), h); }'); }; }
    return m; };
  const paint = mat(0xc4c9cf, 0.05, 0.55, true), paintGlass = paint.clone(), steel = mat(0x9aa0a8, 0.9, 0.45), iron = mat(0x3d444d, 0.6, 0.6, true), ironSolid = mat(0x3d444d, 0.6, 0.6), gearM = mat(0x51606f, 0.7, 0.5, true), genM = mat(0x3a516c, 0.6, 0.5, true),
    copper = mat(0xb8733a, 0.8, 0.4), concrete = mat(0x6f6c64, 0, 1, true), cab = mat(0xcfd4d9, 0.2, 0.6), dark = mat(0x23272d, 0.5, 0.6), gearTeeth = mat(0xc8ccd2, 0.95, 0.35);
  const bladeM = mat(0xc4c9cf, 0.05, 0.55);   // лопасти не рассекаются
  paintGlass.onBeforeCompile = paint.onBeforeCompile; cutMats.push(paintGlass);

  const units = {}, root = new THREE.Group(); scene.add(root);
  for (const [id, name, ex, tag] of UNITS) { const g = new THREE.Group(); g.name = id; root.add(g); units[id] = { id, name, g, ex: new THREE.Vector3(...ex), tag: new THREE.Vector3(...tag), meshes: [] }; }
  const add = (id, geo, m, x = 0, y = 0, z = 0, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; (parent || units[id].g).add(o); units[id].meshes.push(o); o.userData.unit = id; return o; };
  // полое тело вращения вокруг оси Z: профиль [z, rНаруж, rВнутр]
  const hollowZ = (prof, seg = 48) => { const pts = prof.map(p => new THREE.Vector2(p[1], p[0])).concat(prof.slice().reverse().map(p => new THREE.Vector2(p[2], p[0]))); pts.push(pts[0].clone()); return new THREE.LatheGeometry(pts, seg).rotateX(Math.PI / 2); };
  const hollowY = (prof, seg = 64) => { const pts = prof.map(p => new THREE.Vector2(p[1], p[0])).concat(prof.slice().reverse().map(p => new THREE.Vector2(p[2], p[0]))); pts.push(pts[0].clone()); return new THREE.LatheGeometry(pts, seg); };
  const cylZ = (r, l, seg = 32) => new THREE.CylinderGeometry(r, r, l, seg).rotateX(Math.PI / 2);

  // фундамент по чертежу: плита Ø26 м, подколонник Ø6,6 м
  const F = NOM.fnd; add('fnd', hollowY([[-3.7, 13, 0], [-3.0, 13, 0], [-0.6, 3.3, 0], [0.5, 3.3, 0]].map(p => [p[0], p[1], 0.001]), 72), concrete);
  // анкерная корзина: два кольца и 2 × 100 болтов
  { const r1 = F.ringOuterD / 2, r2 = F.ringInnerD / 2; for (const y of [0.52, -2.4]) add('anchor', hollowY([[y, r1 + .12, r2 - .12], [y + .08, r1 + .12, r2 - .12]]), steel);
    const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.03, .03, 3.2, 6), steel, F.bolts), d = new THREE.Object3D(); for (let k = 0; k < F.bolts; k++) { const a = Math.floor(k / 2) / (F.bolts / 2) * Math.PI * 2, r = k % 2 ? r1 : r2; d.position.set(Math.cos(a) * r, -0.9, Math.sin(a) * r); d.updateMatrix(); bolts.setMatrixAt(k, d.matrix); } bolts.userData.unit = 'anchor'; units.anchor.g.add(bolts); units.anchor.meshes.push(bolts); }
  // башня: пять полых секций, стенка от 45 до 20 мм (показана утолщённой, чтобы читалась в разрезе)
  const rb = NOM.towerBaseD / 2, rt = NOM.towerTopD / 2, y0 = 0.6, y1 = H - 2.5, towerSecs = [];
  for (let k = 0; k < NOM.towerSections; k++) { const a = k / NOM.towerSections, b = (k + 1) / NOM.towerSections, ra = rb + (rt - rb) * a, rbb = rb + (rt - rb) * b, w = 0.12 - 0.05 * a;
    const s = add('tower', hollowY([[y0 + (y1 - y0) * a, ra, ra - w], [y0 + (y1 - y0) * b - 0.05, rbb, rbb - w]]), paint); s.userData.exK = NOM.towerSections - 1 - k; towerSecs.push(s);
    add('tower', hollowY([[y0 + (y1 - y0) * b - 0.12, rbb, rbb - 0.3], [y0 + (y1 - y0) * b, rbb, rbb - 0.3]]), steel).userData.exK = NOM.towerSections - 1 - k; }
  // опорно-поворотное устройство: зубчатый венец и шесть приводов
  add('yaw', hollowY([[H - 2.45, rt + .25, rt - .45], [H - 1.95, rt + .25, rt - .45]]), gearTeeth); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + .5; add('yaw', new THREE.CylinderGeometry(.22, .22, 1.1, 14), ironSolid, Math.cos(a) * (rt - .1), H - 1.4, Math.sin(a) * (rt - .1)); }
  // рама гондолы
  add('bed', new THREE.BoxGeometry(3.4, .45, 12.6), ironSolid, 0, H - 1.72, -2.6); for (const x of [-1.5, 1.5]) add('bed', new THREE.BoxGeometry(.3, .7, 12.6), ironSolid, x, H - 1.3, -2.6);
  // главный вал и два подшипника
  add('shaft', hollowZ([[-2.1, .46, .2], [1.6, .62, .28], [2.1, .95, .28]]), steel, 0, H, 2.3);
  const rings = {};
  const bearing = (unit, id, z) => { add(unit, hollowZ([[-.45, 1.25, .62], [.45, 1.25, .62]]), iron, 0, H, z); add(unit, new THREE.BoxGeometry(2.9, .9, .8), ironSolid, 0, H - 1.05, z);
    const rollers = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .12, .5, 10).rotateX(Math.PI / 2), gearTeeth, 22), d = new THREE.Object3D(); for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2; d.position.set(Math.cos(a) * .78, H + Math.sin(a) * .78, z); d.updateMatrix(); rollers.setMatrixAt(k, d.matrix); } rollers.userData.unit = unit; units[unit].g.add(rollers); units[unit].meshes.push(rollers);
    const ring = add(unit, new THREE.TorusGeometry(1.33, .06, 10, 60), new THREE.MeshStandardMaterial({ color: 0x2bd67b, emissive: 0x2bd67b, emissiveIntensity: .7, roughness: .4 }), 0, H, z + .5); rings[id] = ring; };
  bearing('bear1', 'ГП1', 3.2); bearing('bear2', 'ГП2', 1.0);
  // редуктор: полый корпус, внутри водило с сателлитами и быстроходная ступень
  add('gear', hollowZ([[-1.6, 1.25, 1.1], [-0.6, 1.45, 1.3], [1.2, 1.45, 1.3], [1.6, 1.0, .5]]), gearM, 0, H, -1.2); add('gear', new THREE.BoxGeometry(3.1, .7, 1.6), ironSolid, 0, H - 1.4, -1.2);
  const planets = new THREE.Group(); planets.position.set(0, H, -0.7); units.gear.g.add(planets); add('gear', cylZ(.42, 1.0, 28), gearTeeth, 0, 0, 0, planets); for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; add('gear', cylZ(.38, .8, 24), gearTeeth, Math.cos(a) * .82, Math.sin(a) * .82, 0, planets); }
  const hss = add('gear', cylZ(.3, 1.3, 24), gearTeeth, 0.45, H + .2, -2.2); rings['Р1'] = add('gear', new THREE.TorusGeometry(.7, .05, 8, 40), rings['ГП1'].material.clone(), 0, H, .42); rings['Р2'] = add('gear', new THREE.TorusGeometry(.48, .05, 8, 40), rings['ГП1'].material.clone(), .45, H + .2, -2.86);
  // тормоз и муфта
  const disc = add('brake', cylZ(.62, .08, 40), steel, .45, H + .2, -3.05); add('brake', new THREE.BoxGeometry(.5, .5, .34), mat(0xc0392b, .3, .6), .45, H + .82, -3.05); add('brake', cylZ(.2, .7, 20), steel, .45, H + .2, -3.5);
  // генератор: статор с обмоткой и ротор
  add('gen', hollowZ([[-1.45, 1.18, .98], [1.45, 1.18, .98]]), genM, .45, H + .2, -5.35); add('gen', hollowZ([[-1.2, .98, .8], [1.2, .98, .8]]), copper, .45, H + .2, -5.35);
  const genRotor = add('gen', cylZ(.74, 2.3, 36), steel, .45, H + .2, -5.35); for (const z of [-3.86, -6.84]) add('gen', hollowZ([[-.06, 1.18, .3], [.06, 1.18, .3]]), genM, .45, H + .2, z); add('gen', new THREE.BoxGeometry(2.6, .6, 2.2), ironSolid, .45, H - 1.25, -5.35);
  rings['Г1'] = add('gen', new THREE.TorusGeometry(.42, .05, 8, 40), rings['ГП1'].material.clone(), .45, H + .2, -3.78); rings['Г2'] = add('gen', new THREE.TorusGeometry(.42, .05, 8, 40), rings['ГП1'].material.clone(), .45, H + .2, -6.92);
  // преобразователь, трансформатор, охладитель
  add('conv', new THREE.BoxGeometry(1.3, 2.3, 2.3), cab, -1.25, H - .35, -8.4); add('conv', new THREE.BoxGeometry(.04, 1.9, 2.0), dark, -.58, H - .35, -8.4);
  add('trf', new THREE.BoxGeometry(1.45, 2.0, 2.2), mat(0x6b7480, .4, .6), 1.25, H - .5, -8.4); for (let k = 0; k < 3; k++) add('trf', new THREE.CylinderGeometry(.09, .13, .6, 12), mat(0x7a4b2a, .1, .5), 1.25 - .45 + k * .45, H + .8, -8.4);
  add('cool', new THREE.BoxGeometry(3.4, .9, 2.4), mat(0x4a525c, .6, .5), 0, H + 3.0, -7.4); for (let k = 0; k < 3; k++) add('cool', new THREE.CylinderGeometry(.5, .5, .1, 24), dark, -1.1 + k * 1.1, H + 3.47, -7.4);
  // кожух гондолы: полая оболочка
  const cover = add('cover', hollowZ([[-7.6, .4, .32], [-7.3, 2.3, 2.22], [-4, 2.62, 2.54], [3.6, 2.62, 2.54], [5.4, 2.2, 2.12], [5.9, 1.9, 1.82]], 56), paint, 0, H + .25, -3.2);
  // ротор: ступица, обтекатель, подшипники и приводы лопастей, лопасти
  const rotor = new THREE.Group(); rotor.position.set(0, H, 5.6); units.hub.g.add(rotor);
  add('hub', hollowZ([[-1.9, 1.5, 1.3], [-1.2, 2.25, 2.0], [0.6, 2.25, 2.0], [1.7, 1.5, 1.3], [2.6, .35, .25]], 48), paint, 0, 0, 0, rotor);
  const bladeRot = new THREE.Group(); bladeRot.position.set(0, H, 5.6); units.blades.g.add(bladeRot); const bladeGeo = bladeGeometry(NOM.bladeL), bladeMeshes = [];
  for (let k = 0; k < 3; k++) { const arm = new THREE.Group(); arm.rotation.z = k * 2 * Math.PI / 3; rotor.add(arm);
    add('hub', new THREE.CylinderGeometry(1.62, 1.62, .34, 48, 1, true), gearTeeth, 0, 2.05, 0, arm); add('hub', new THREE.CylinderGeometry(.2, .2, .7, 12), ironSolid, 1.0, 1.7, 0, arm);
    const arm2 = new THREE.Group(); arm2.rotation.z = k * 2 * Math.PI / 3; bladeRot.add(arm2); const b = add('blades', bladeGeo, bladeM, 0, 0, 0, arm2); b.userData.radial = true; bladeMeshes.push(b); }

  // состояние узлов
  const base = new Map(); for (const u of Object.values(units)) for (const m of u.meshes) base.set(m, m.position.clone());
  const eases = t => t * t * (3 - 2 * t);
  function explode(e) { const k = eases(Math.max(0, Math.min(1, e)));
    for (const u of Object.values(units)) { u.g.position.copy(u.ex).multiplyScalar(k); for (const m of u.meshes) { if (m.userData.exK !== undefined) m.position.copy(base.get(m)).add(new THREE.Vector3(0, -m.userData.exK * 4.2 * k, 0)); if (m.userData.radial) m.position.set(0, 7 * k, 0); } }
    grid.position.y = -39 * k; floor.position.y = -39 * k - 0.02; }
  let mode = 'out';
  function setMode(m) { mode = m; CUT.value = m === 'cut' ? 1 : 0; renderer.localClippingEnabled = m === 'cut'; for (const c of cutMats) { c.clippingPlanes = m === 'cut' ? [clip] : []; c.needsUpdate = true; }
    cover.visible = m !== 'open'; paint.transparent = paintGlass.transparent = false; paintGlass.opacity = 1; cover.material = paint;
    if (m === 'glass') { cover.material = paintGlass; paintGlass.transparent = true; paintGlass.opacity = .16; paintGlass.depthWrite = false; } else paintGlass.depthWrite = true; paintGlass.needsUpdate = true; }
  const COL = { ok: 0x2bd67b, warn: 0xf2b632, alarm: 0xff3b30 };
  function setBearing(id, st) { const r = rings[id]; if (!r) return; r.material.color.setHex(COL[st]); r.material.emissive.setHex(COL[st]); r.material.emissiveIntensity = st === 'ok' ? .7 : 1.6; r.scale.setScalar(st === 'alarm' ? 1.12 : 1); }
  let selBox = null;
  function highlight(id) { if (selBox) { scene.remove(selBox); selBox.geometry.dispose(); selBox = null; } if (id && id !== 'blades' && id !== 'tower') { selBox = new THREE.BoxHelper(units[id].g, 0xf2b632); selBox.material.toneMapped = false; scene.add(selBox); } }
  function update(st, dt, e) { const w = e < 0.02 ? st.rpm * Math.PI / 30 * dt * spin : 0; rotor.rotation.z += w; bladeRot.rotation.z += w; planets.rotation.z += w * 6; hss.rotation.z += w * 40; genRotor.rotation.z += w * 40; disc.rotation.z += w * 40;
    for (const b of bladeMeshes) b.rotation.y = -st.pitch * RAD; if (selBox) selBox.update(); }

  /* ---------- стройка: один вход b = 0…10, десять шагов от подъезда до пуска; каждая деталь встаёт на место как функция b ---------- */
  const NAC = ['yaw', 'bed', 'shaft', 'bear1', 'bear2', 'gear', 'brake', 'gen', 'conv', 'trf', 'cool', 'cover'], UP = new THREE.Vector3(0, 1, 0), tv = new THREE.Vector3();
  const bg = new THREE.Group(); bg.visible = false; scene.add(bg);
  const yel = new THREE.MeshStandardMaterial({ color: 0xf2b632, roughness: .55, metalness: .25 }), gravel = new THREE.MeshStandardMaterial({ color: 0x4b453a, roughness: 1 }), soilTop = new THREE.MeshStandardMaterial({ color: 0x17140f, roughness: 1 });
  const mk = (geo, m, x = 0, y = 0, z = 0, parent = bg) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  const lid = mk(new THREE.CircleGeometry(14.62, 96).rotateX(-Math.PI / 2), soilTop, 0, 0.012, 0), back = mk(new THREE.RingGeometry(3.32, 14.62, 96).rotateX(-Math.PI / 2), soilTop);
  const pad = mk(new THREE.BoxGeometry(44, .5, 58), gravel), road = mk(new THREE.BoxGeometry(1, .3, 7), gravel), trench = mk(new THREE.BoxGeometry(1, .14, 1.4), new THREE.MeshStandardMaterial({ color: 0x2f8f88, roughness: .8 }));
  lid.castShadow = back.castShadow = pad.castShadow = road.castShadow = trench.castShadow = false;
  // арматура фундамента: нижняя и верхняя сетки, радиальные стержни, выпуски под подколонник
  const rb3 = []; { const top = r => r < 3.3 ? 0.3 : -0.5 - (r - 3.3) / 9.7 * 2.4;
    for (const lay of [0, 1]) { for (let r = 2; r <= 12.6; r += 1.5) for (let k = 0; k < 48; k++) { const a = k / 48 * 6.2832, c = (k + 1) / 48 * 6.2832, y = lay ? top(r) : -3.55; rb3.push(Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(c) * r, y, Math.sin(c) * r); }
      for (let k = 0; k < 36; k++) { const a = k / 36 * 6.2832; rb3.push(Math.cos(a) * 1.5, lay ? top(1.5) : -3.55, Math.sin(a) * 1.5, Math.cos(a) * 12.6, lay ? top(12.6) : -3.55, Math.sin(a) * 12.6); } }
    for (let k = 0; k < 40; k++) { const a = k / 40 * 6.2832; rb3.push(Math.cos(a) * 3.0, -3.55, Math.sin(a) * 3.0, Math.cos(a) * 3.0, 0.4, Math.sin(a) * 3.0); } }
  const rebarG = new THREE.BufferGeometry(); rebarG.setAttribute('position', new THREE.Float32BufferAttribute(rb3, 3)); const rebar = new THREE.LineSegments(rebarG, new THREE.LineBasicMaterial({ color: 0xc8733c })); bg.add(rebar);
  // гусеничный кран: стоит на площадке, стрела следит за грузом
  const crane = new THREE.Group(); bg.add(crane); const CP = new THREE.Vector3(-34, 0, -24), P0 = new THREE.Vector3();
  for (const z of [-3.4, 3.4]) mk(new THREE.BoxGeometry(11, 1.5, 1.8), dark, 0, .75, z, crane); mk(new THREE.BoxGeometry(8, 3, 6.4), yel, -.5, 3.1, 0, crane); mk(new THREE.BoxGeometry(3.2, 2.6, 6), dark, -5.6, 3.3, 0, crane); mk(new THREE.BoxGeometry(2.2, 2.3, 2.2), cab, 3.2, 3.9, 2.4, crane);
  const boom = mk(new THREE.CylinderGeometry(.5, .95, 1, 8), yel), rope = mk(new THREE.CylinderGeometry(.09, .09, 1, 6), dark), hook = mk(new THREE.BoxGeometry(1.3, .9, 1.3), yel);
  const stick = (m, a, b) => { m.position.copy(a).add(b).multiplyScalar(.5); m.scale.set(1, Math.max(.01, a.distanceTo(b)), 1); m.quaternion.setFromUnitVectors(UP, tv.copy(b).sub(a).normalize()); };
  const fndMesh = units.fnd.meshes[0], NS = NOM.towerSections, secTop = k => y0 + (y1 - y0) * (k + 1) / NS;
  const eio = t => { t = Math.max(0, Math.min(1, t)); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }, sg = (b, a, c) => Math.max(0, Math.min(1, (b - a) / (c - a)));
  const secWin = k => k < 3 ? [4 + k / 3, 4 + (k + 1) / 3] : [5 + (k - 3) / 2, 5 + (k - 2) / 2], bladeAng = j => (90 - 120 * j) * RAD;
  let bOn = false, spin = 1; const load = new THREE.Vector3(), tip = new THREE.Vector3();
  function build(b) {
    if (b == null) { if (bOn) { bOn = false; bg.visible = false; spin = 1; for (const u of Object.values(units)) u.g.visible = true; for (const m of units.tower.meshes) m.visible = true; for (const m of bladeMeshes) m.visible = true; fndMesh.scale.y = 1; fndMesh.position.y = 0; floor.visible = true; } return; }
    bOn = true; bg.visible = true; let k;
    k = sg(b, 0, 1); road.visible = k > 0; road.scale.x = Math.max(.01, 240 * k); road.position.set(-300 + 120 * k, .15, -14);
    k = eio(sg(b, 1, 2)); pad.visible = k > 0; pad.scale.x = Math.max(.01, k); pad.position.set(-60 + 22 * k, .25, -14);
    k = 1 - eio(sg(b, 2, 2.45)); lid.visible = k > .01; lid.scale.setScalar(Math.max(.01, k));
    k = sg(b, 2.45, 2.8); rebar.visible = k > 0 && b < 3.62; rebarG.setDrawRange(0, Math.floor(k * rb3.length / 6) * 2);
    k = eio(sg(b, 2.75, 3)); units.anchor.g.visible = k > 0; units.anchor.g.position.y = (1 - k) * 14;
    k = sg(b, 3, 3.6); units.fnd.g.visible = k > 0; fndMesh.scale.y = Math.max(.001, k); fndMesh.position.y = -3.7 * (1 - k);
    k = eio(sg(b, 3.65, 4)); back.visible = k > 0; back.position.y = -2.6 * (1 - k) + 0.006;
    load.set(-8, H + 24, 0);
    for (const m of units.tower.meshes) { const s = NS - 1 - m.userData.exK, [a, c] = secWin(s), p = sg(b, a, c), q = eio(sg(p, .08, .92)); m.visible = p > 0; m.position.y = base.get(m).y + (1 - q) * 46; if (p > 0 && p < 1) load.set(0, secTop(s) + (1 - q) * 46 + .4, 0); }
    k = eio(sg(b, 6, 6.6)); for (const id of NAC) { units[id].g.visible = b > 6; units[id].g.position.y = (1 - k) * 44; } if (b > 6 && b < 6.6) load.set(0, H + 3.2 + (1 - k) * 44, -3);
    k = eio(sg(b, 6.62, 7)); units.hub.g.visible = b > 6.62; units.hub.g.position.y = (1 - k) * 44; if (b > 6.62 && b < 7) load.set(0, H + 2.6 + (1 - k) * 44, 5.6);
    units.blades.g.visible = b > 7;
    for (let j = 0; j < 3; j++) { const a = 7 + j / 3, p = sg(b, a, a + 1 / 3), q = eio(sg(p, .25, 1)); bladeMeshes[j].visible = p > 0; bladeMeshes[j].position.set(0, 62 * (1 - q), 0); if (p > 0 && p < 1) load.set(-(34 + 62 * (1 - q)), H + 1.8, 5.6); }
    if (b < 8) { const j = Math.max(0, Math.min(2, Math.floor((b - 7) * 3))), pj = b < 7 ? 1 : (b - 7) * 3 - j, from = j ? bladeAng(j - 1) : bladeAng(0), ang = from + (bladeAng(j) - from) * eio(sg(pj, 0, .22)); rotor.rotation.z = bladeRot.rotation.z = ang; }
    k = sg(b, 8, 9); trench.visible = k > 0; trench.scale.x = Math.max(.01, 150 * k); trench.position.set(3 + 75 * k, .07, 0);
    const cin = eio(sg(b, 3.82, 4)), cout = eio(sg(b, 9, 9.3)); crane.visible = boom.visible = rope.visible = hook.visible = b > 3.82 && b < 9.3; crane.position.set(CP.x - (1 - cin) * 60 - cout * 60, 0, CP.z);
    if (crane.visible) { P0.set(crane.position.x + 1.5, 5, CP.z); tip.set(load.x, H + 44, load.z); stick(boom, P0, tip); stick(rope, tip, load); hook.position.copy(load); }
    spin = b < 9.3 ? 0 : eio(sg(b, 9.3, 10)); floor.visible = true;
  }
  const anchorOf = id => units[id].tag.clone().add(units[id].g.position);
  return { scene, units, rings, explode, build, setMode, setBearing, highlight, update, anchorOf, key, get mode() { return mode; }, pickables: () => Object.values(units).flatMap(u => u.meshes) };
}

// лопасть: сечения от комля к законцовке — хорда, толщина и крутка (форма принята*)
function bladeGeometry(L) {
  const NS = 30, NC = 14, pos = [], idx = [];
  for (let k = 0; k <= NS; k++) { const r = k / NS, y = 2.1 + r * L, q = Math.max(0, (r - .2) / .8);
    const chord = r < .03 ? 3.2 : r < .2 ? 3.2 + 2.0 * (r - .03) / .17 : 5.2 - 4.5 * Math.pow(q, .8), thick = r < .03 ? 3.2 : r < .2 ? 3.2 - 1.9 * (r - .03) / .17 : 1.3 * Math.pow(1 - q, 1.3) + .1, tw = (15 * (1 - r) * (1 - r) - 2) * RAD;
    for (let c = 0; c < NC; c++) { const a = c / NC * Math.PI * 2, ex = Math.cos(a) * chord / 2 - (r > .03 ? chord * .16 * Math.min(1, (r - .03) / .17) : 0), ez = Math.sin(a) * thick / 2; pos.push(ex * Math.cos(tw) - ez * Math.sin(tw), y, ex * Math.sin(tw) + ez * Math.cos(tw)); } }
  for (let k = 0; k < NS; k++) for (let c = 0; c < NC; c++) { const a = k * NC + c, b = k * NC + (c + 1) % NC; idx.push(a, a + NC, b, b, a + NC, b + NC); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
export { BEARINGS };
