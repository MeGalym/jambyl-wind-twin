/* Снимки облёта: та же 3D-сцена стройки, снятая сверху ортокамерой на спутниковом снимке места ВЭУ.
   Кадр 320 × 220 м, север вверху, ось башни в точке (230, 112) от левого верхнего угла — как у слоя аэросъёмки на карте.
   Это рендер модели, а не фотография с дрона: состояние стройки берётся из хода работ на дату облёта. */
import * as THREE from 'three';
import { createSite } from './site3d.js?v=2';

const W = 640, Hh = 440, X0 = -230, X1 = 90, Z0 = -112, Z1 = 108, cache = new Map(), tiles = new Map();
let R = null, chain = Promise.resolve();
function init() { const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = Hh;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(1); renderer.setSize(W, Hh, false); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; renderer.localClippingEnabled = true;
  const site = createSite({ aerial: true }); site.scene.fog = null; const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, cam = new THREE.OrthographicCamera(-(X1 - X0) / 2, (X1 - X0) / 2, (Z1 - Z0) / 2, -(Z1 - Z0) / 2, 10, 900); cam.position.set(cx, 500, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz);
  const s = site.sun, sc = s.shadow.camera; s.target.position.set(cx, 0, cz); s.position.set(cx - 150, 330, cz + 190); sc.left = -230; sc.right = 230; sc.top = 230; sc.bottom = -230; sc.near = 10; sc.far = 900; sc.updateProjectionMatrix(); s.shadow.mapSize.set(2048, 2048);
  return { canvas, renderer, site, cam }; }
// спутниковая подложка кадра: плитки Esri World Imagery, уровень 17
const loadImg = url => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
async function ground(key, nw, se) { if (tiles.has(key)) return tiles.get(key); const z = 17, n = 2 ** z, fx = lon => (lon + 180) / 360 * n, fy = lat => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  const x0 = fx(nw[1]), x1 = fx(se[1]), y0 = fy(nw[0]), y1 = fy(se[0]), cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const g = cv.getContext('2d'); g.fillStyle = '#b9ab8a'; g.fillRect(0, 0, W, Hh); const jobs = []; let ok = 0;
  for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) for (let ty = Math.floor(y0); ty <= Math.floor(y1); ty++) jobs.push(loadImg(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`).then(im => { if (!im) return; ok++; const sx = W / (x1 - x0), sy = Hh / (y1 - y0); g.drawImage(im, (tx - x0) * sx, (ty - y0) * sy, sx + .6, sy + .6); }));
  await Promise.all(jobs); let tex = null; if (ok) { tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; } tiles.set(key, tex); return tex; }
/* снимок: key — ВЭУ, b — ход стройки 0…10, nw и se — [широта, долгота] углов кадра. Возвращает адрес картинки JPEG */
export function photo(key, b, nw, se) { const q = Math.round(b * 50) / 50, id = key + '|' + q; if (cache.has(id)) return cache.get(id);
  const job = chain.then(async () => { R = R || init(); const tex = await ground(key, nw, se); R.site.setGround(tex, X0, X1, Z0, Z1); R.site.build(q, 3.1); R.site.tick(q >= 9.3 ? 2 : 0, q); R.renderer.render(R.site.scene, R.cam); return R.canvas.toDataURL('image/jpeg', .84); });
  chain = job.catch(() => {}); cache.set(id, job); if (cache.size > 260) cache.delete(cache.keys().next().value); return job; }
// что распознано на кадре: рамки в долях кадра, по состоянию стройки
export function boxes(b) { const px = (x0, z0, x1, z1, t) => ({ l: (x0 - X0) / (X1 - X0) * 100, t: (z0 - Z0) / (Z1 - Z0) * 100, w: (x1 - x0) / (X1 - X0) * 100, h: (z1 - z0) / (Z1 - Z0) * 100, text: t }), pc = v => Math.round((v % 1) * 100) + ' %', o = [];
  if (b <= 0) return o; if (b < 1) o.push(px(-228, -9, -62, 9, 'подъезд: ' + pc(b))); else if (b < 2) o.push(px(-65, -33, -15, 33, 'площадка: ' + pc(b)));
  else if (b < 3) o.push(px(-17, -17, 17, 17, b < 2.25 ? 'котлован' : b < 2.5 ? 'анкерная корзина' : 'арматура фундамента')); else if (b < 4) o.push(px(-17, -17, 17, 17, b < 3.6 ? 'бетонирование' : b < 3.86 ? 'бетон набирает прочность' : 'обратная засыпка'));
  else if (b < 6) { const n = b < 5 ? Math.min(3, Math.floor((b - 4.05) / .317) + (b >= 4.05 ? 0 : 0)) : 3 + Math.floor((b - 5) * 2); o.push(px(-9, -9, 9, 9, 'башня: ' + Math.max(0, n) + ' из 5 секций'), px(-50, -16, -22, 4, 'кран')); }
  else if (b < 7) o.push(px(-9, -16, 9, 14, b < 6.6 ? 'подъём гондолы' : 'гондола, ступица'), px(-50, -16, -22, 4, 'кран')); else if (b < 8) o.push(px(-12, -16, 12, 16, 'лопастей: ' + Math.floor((b - 7) * 3) + ' из 3'), px(-50, -16, -22, 4, 'кран'));
  else if (b < 9) o.push(px(16, -5, 90, 5, 'траншея и кабель 35 кВ'), px(-12, -16, 12, 16, 'ВЭУ смонтирована')); else o.push(px(-12, -16, 12, 16, b >= 9.3 ? 'ВЭУ в работе' : 'ВЭУ смонтирована'));
  return o; }
