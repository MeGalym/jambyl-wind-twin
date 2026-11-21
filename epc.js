/* Экран стройки ВЭС: общее состояние, раздел «Карта» и карточка ВЭУ.
   Разделы «Дашборд», «График», «Замечания», «Склад» — в epc-views.js. Модель хода работ — epcw.js. */
(function () {
  const SITE = window.SITE, W = window.WIND, E = window.EPCW, IO = window.FACTIO, N = W.N;
  const $ = q => document.querySelector(q), fmt = (v, d = 0) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fd = d => d == null ? '—' : E.dateOf(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(' г.', '');
  const fm = d => E.dateOf(d).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace(' г.', '').replace('.', '');
  const name = i => SITE.wtg[i][0], esc = s => String(s).replace(/[<>&"]/g, ''), clampD = d => Math.max(0, Math.min(E.MAXD, Math.round(d)));
  const load = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } };
  const save = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  /* ---------- состояние экрана ---------- */
  const today = clampD((Date.now() - E.DAY0) / 864e5);
  const S = { D: today, sel: null, view: 'dash', tab: 'cls', rtab: 'steps', color: 'stage', off: new Set(), on: { civil: true, cable: true, ss: true }, flt: { feeder: '', late: false, qc: false, now: false } };
  let JOURNAL = load('jambyl-journal', []), PUNCH = load('jambyl-punch', []);
  { const saved = load('jambyl-fact', null); if (saved && saved.day != null) { E.loadFact(saved); S.D = clampD(saved.day); } }
  const J_KIND = { qa: 'Запрошена приёмка ОТК', report: 'Суточный отчёт', mob: 'Заявка на материалы и кран', punch: 'Выдано замечание' };
  const T_STATUS = { new: 'Выдано', work: 'В работе', review: 'На проверке', closed: 'Закрыто' };

  /* ---------- расчёт на дату ---------- */
  const C = { st: [], det: [], gt: [], M: null, BN: null, L: null, queue: new Map(), tasks: [], open: new Map() };
  function allTasks() { const sc = E.tasks(S.D).map(t => ({ id: 's' + t.n, i: t.i, text: t.text, disc: t.disc, sev: t.sev, status: t.status, age: t.age, day: t.found, user: false }));
    const us = PUNCH.filter(p => p.day <= S.D).map(p => ({ ...p, age: Math.round(S.D - p.day), user: true })); return sc.concat(us); }
  function calc() { C.st = []; C.det = []; C.gt = []; for (let i = 0; i < N; i++) { C.st.push(E.wtgState(i, S.D)); C.det.push(E.detail(i, S.D)); C.gt.push(E.gates(i, S.D)); }
    C.M = E.metrics(S.D); C.BN = E.bottlenecks(S.D); C.L = E.layers(S.D); C.tasks = allTasks(); C.open = new Map(); for (const t of C.tasks) if (t.status !== 'closed') { if (!C.open.has(t.i)) C.open.set(t.i, []); C.open.get(t.i).push(t); }
    C.queue = new Map(); Array.from({ length: N }, (_, i) => i).filter(i => S.D < E.fact.erect.s[i]).sort((a, b) => E.fact.erect.s[a] - E.fact.erect.s[b]).forEach((i, k) => C.queue.set(i, k + 1)); }

  /* ---------- раскраска: наборы классов, как стадии объекта на карте ---------- */
  const READY = ['civil', 'cure', 'parts', 'ready', 'erect', 'waitCable', 'waitGrid', 'test', 'live'];
  const SETS = {
    stage: { name: 'Стадия работ', cls: [['#c5cad1', 'Не начато'], ['#b08d57', 'Подъезд готов'], ['#dcc07a', 'Площадка готова'], ['#a39b8d', 'Арматура фундамента'], ['#78838f', 'Фундамент забетонирован'], ['#f4b860', 'Башня: низ и середина'], ['#e8870f', 'Башня собрана'], ['#b06ad9', 'Гондола и ступица'], ['#3f7fe0', 'Лопасти установлены'], ['#17a398', 'Кабель подключён'], ['#1f9d55', 'В работе']],
      of: i => { const d = C.det[i]; return d.next ? d.steps.indexOf(d.next) : 10; } },
    ready: { name: 'Что держит', cls: [['#c5cad1', E.GATE_STATE.civil], ['#a39b8d', E.GATE_STATE.cure], ['#d1432f', E.GATE_STATE.parts], ['#f2a516', E.GATE_STATE.ready], ['#3f7fe0', E.GATE_STATE.erect], ['#b06ad9', E.GATE_STATE.waitCable], ['#7c5cd6', E.GATE_STATE.waitGrid], ['#17a398', E.GATE_STATE.test], ['#1f9d55', E.GATE_STATE.live]],
      of: i => READY.indexOf(C.gt[i].state) },
    late: { name: 'Отставание', cls: [['#c5cad1', 'По плану ещё не начата'], ['#1f9d55', 'В срок'], ['#f2a516', 'Отстаёт до 14 дней'], ['#e8700f', 'Отстаёт до 45 дней'], ['#d1432f', 'Отстаёт больше 45 дней']],
      of: i => { const b = C.st[i]; return !b.due ? 0 : b.late > 45 ? 4 : b.late > 14 ? 3 : b.late > 0 ? 2 : 1; } },
  };
  const clsOf = i => SETS[S.color].of(i), colOf = i => SETS[S.color].cls[clsOf(i)][0];
  const pass = i => { const f = S.flt, b = C.st[i]; if (f.feeder !== '' && W.feeder[i] !== +f.feeder) return false; if (f.late && !(b.late > 0)) return false; if (f.qc && !C.open.has(i)) return false; if (f.now && !/^В работе/.test(C.det[i].stage)) return false; if (f.act && S.D >= E.fact[f.act].e[i]) return false; return true; };
  const shown = () => { let n = 0; for (let i = 0; i < N; i++) if (!S.off.has(clsOf(i)) && pass(i)) n++; return n; };

  /* ---------- карта площадки: настоящая подложка (спутник или рельеф) либо схема; рядом — матрица ВЭУ по фидерам.
     Издалека ВЭУ — метка класса, вблизи — площадка, фундамент, башня, лопасти и кран в масштабе. ---------- */
  const L = window.L, MT = SITE.meta, LL = (x, z) => [MT.lat0 - z / MT.kz, MT.lon0 + x / MT.kx], X = i => SITE.wtg[i][1], Z = i => SITE.wtg[i][2], P = i => LL(X(i), Z(i));
  const BASES = { sat: ['Спутник', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 18, 'Снимки: Esri, Maxar, Earthstar Geographics'], topo: ['Рельеф', 'https://tile.opentopomap.org/{z}/{x}/{y}.png', 17, '© OpenTopoMap, участники OpenStreetMap'], plan: ['Схема', 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}', 13, 'Рельеф: Esri, USGS, NASA'] };      // схема лежит на отмывке рельефа: формы склонов настоящие
  const lineLL = a => { const o = []; for (let k = 0; k < a.length; k += 2) o.push(LL(a[k], a[k + 1])); return o; };
  function setBase(m, id) { if (m._b) m.removeLayer(m._b); m._b = null; const b = BASES[id] || BASES.sat; m.getContainer().dataset.base = id; if (b[1]) { m._b = L.tileLayer(b[1], { maxZoom: 18, maxNativeZoom: b[2], attribution: b[3], opacity: id === 'plan' ? .75 : 1 }).addTo(m); m._b.bringToBack(); } }
  const BOUNDS = L.latLngBounds(SITE.wtg.map((w, i) => P(i))).pad(.07);
  function mkMap(el, base) { const m = L.map(el, { zoomControl: false, zoomSnap: .25, zoomDelta: .5, wheelPxPerZoomLevel: 90, maxZoom: 18, minZoom: 9, maxBounds: BOUNDS.pad(1.2) }); m.attributionControl.setPrefix(''); setBase(m, base); m.fitBounds(BOUNDS); return m; }
  const mppOf = m => 156543.03392 * Math.cos(MT.lat0 * Math.PI / 180) / Math.pow(2, m.getZoom());
  S.base = load('jambyl-base', 'sat'); if (!BASES[S.base]) S.base = 'sat'; S.mview = 'map'; S.grp = false; S.aer = { on: false, k: null, auto: true, cmp: false, sx: .5 };
  const map = mkMap('map', S.base), rot = i => (i * 47) % 120, num = i => name(i).replace(/\D/g, '').replace(/^0+/, '');
  const roadsLL = [...SITE.roads, ...SITE.access].map(lineLL), trenchLL = Object.values(SITE.trench).flat().map(lineLL);
  const gCivil = L.layerGroup([L.polyline(roadsLL, { color: '#3b3324', weight: 5, opacity: .75, interactive: false }), L.polyline(roadsLL, { color: '#ecd9a6', weight: 2.6, interactive: false })]).addTo(map);
  const gCable = L.polyline(trenchLL, { color: '#4fd1c5', weight: 1.4, dashArray: '5 5', interactive: false }).addTo(map);
  const gSS = L.layerGroup().addTo(map), gW = L.layerGroup().addTo(map), gG = L.layerGroup().addTo(map);
  const paneA = map.createPane('aerA'), paneB = map.createPane('aerB'), gA = L.layerGroup().addTo(map), gB = L.layerGroup().addTo(map); paneA.style.zIndex = 350; paneB.style.zIndex = 351; paneA.style.pointerEvents = paneB.style.pointerEvents = 'none';
  const fitAll = () => { map.invalidateSize(); map.fitBounds(BOUNDS, { animate: false }); }, fitAspect = () => map.invalidateSize();
  let raf = 0; const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawMap(); }); };
  // значок ВЭУ: издалека — кружок класса, вблизи — чертёж площадки в масштабе карты
  function glyph(i, u, on) { const b = C.st[i], d = C.det[i], col = colOf(i), far = u > 3.3, z = map.getZoom(), open = C.open.get(i);
    if (far && u <= 9) { const si = d.next ? d.steps.indexOf(d.next) : 10, r = on ? 10 : 8, R = r + 6, s = R * 2 + 8; let ring = '';
      for (let k = 0; k < 10; k++) { const a0 = (k * 36 - 90 + 5) * Math.PI / 180, a1 = ((k + 1) * 36 - 90 - 5) * Math.PI / 180; ring += `<path d="M${(Math.cos(a0) * R).toFixed(1)} ${(Math.sin(a0) * R).toFixed(1)}A${R} ${R} 0 0 1 ${(Math.cos(a1) * R).toFixed(1)} ${(Math.sin(a1) * R).toFixed(1)}" fill="none" stroke="${k < si ? SETS.stage.cls[k + 1][0] : 'rgba(255,255,255,.35)'}" stroke-width="3.2"/>`; }
      return { s, html: `<svg width="${s}" height="${s}" viewBox="${-s / 2} ${-s / 2} ${s} ${s}"><circle r="${R + 2.5}" fill="rgba(16,21,31,.6)"/>${ring}<circle r="${r}" fill="${col}" stroke="${on ? '#f5b544' : '#10151f'}" stroke-width="${on ? 3 : 1.4}"/><text y="3.4" font-size="8.5" text-anchor="middle" font-weight="700" fill="#10151f">${si}</text>${b.erecting ? `<path d="M${-r * .2} ${r * .9}L${r * 1.4} ${-r * 1.5}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>` : ''}${open ? `<circle cx="${R * .8}" cy="${-R * .8}" r="4.5" fill="#ff6452" stroke="#10151f" stroke-width="1"/>` : ''}</svg><b>${num(i)}</b>` }; }
    if (far) { const r = on ? 9 : z < 11.6 ? 5 : 6.5, s = r * 2 + 12, lbl = z >= 13.4 || on;
      return { s, html: `<svg width="${s}" height="${s}" viewBox="${-s / 2} ${-s / 2} ${s} ${s}"><circle r="${r}" fill="${col}" stroke="${on ? '#f5b544' : '#10151f'}" stroke-width="${on ? 3 : 1.4}"/>${b.erecting ? `<path d="M${-r * .2} ${r * .9}L${r * 1.4} ${-r * 1.5}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>` : ''}${open ? `<circle cx="${r * .9}" cy="${-r * .9}" r="${Math.max(3, r * .5)}" fill="#ff6452" stroke="#10151f" stroke-width="1"/>` : ''}</svg>${lbl ? `<b>${num(i)}</b>` : ''}` }; }
    /* вблизи — чертёж площадки: подъезд, крановая площадка, котлован, арматура, бетон, детали на раскладке, кран, башня, гондола, лопасти, кабель.
       Кольцо из десяти делений — десять шагов стройки: сделанные закрашены, текущий мигает. */
    const s = Math.round(280 / u), si = d.next ? d.steps.indexOf(d.next) : 10, fr = id => { const a = E.fact[id].s[i], e = E.fact[id].e[i]; return S.D >= e ? 1 : S.D <= a ? 0 : (S.D - a) / (e - a); }, rd = fr('road'), pd = fr('pad'), fn = b.found, mv = fr('mv'), pt = Object.fromEntries(d.parts.map(p => [p.k, p])), doing = d.next && S.D >= E.fact[d.next.id].s[i];
    let h = `<circle r="118" fill="rgba(16,21,31,.34)"/>`;
    if (rd > 0) h += `<path d="M-128 34H${(-128 + 30 * Math.min(1, rd)).toFixed(0)}" stroke="#ecd9a6" stroke-width="9" ${rd >= 1 ? '' : 'stroke-dasharray="7 5"'}/>`;
    if (pd > 0) h += `<rect x="-98" y="-42" width="${(78 * Math.min(1, pd)).toFixed(0)}" height="84" rx="4" fill="${pd >= 1 ? 'rgba(236,217,166,.62)' : 'rgba(236,217,166,.3)'}" stroke="#ecd9a6" stroke-width="2" ${pd >= 1 ? '' : 'stroke-dasharray="8 6"'}/>`; else h += `<rect x="-98" y="-42" width="78" height="84" rx="4" fill="none" stroke="rgba(236,217,166,.45)" stroke-width="1.6" stroke-dasharray="4 7"/>`;
    if (fn > 0) { h += `<circle r="15" fill="${fn >= 1 ? '#7d776a' : '#3a3327'}" stroke="#1b1712" stroke-width="2"/>`;
      if (fn < 1) { if (fn > 0.12) for (let k = -2; k <= 2; k++) { const w = Math.sqrt(169 - 36 * k * k).toFixed(1); h += `<path d="M${k * 6} ${-w}V${w}M${-w} ${k * 6}H${w}" stroke="#d07a45" stroke-width="1.1" opacity="${fn > 0.45 ? .4 : 1}"/>`; }
        if (fn > 0.45) h += `<circle r="${(13 * (fn - 0.45) / 0.55).toFixed(1)}" fill="#aeb3b8" opacity=".92"/>`; }
      h += `<circle r="3.6" fill="${fn >= 1 ? '#c2c6ca' : '#8d8a82'}" stroke="#1b1712" stroke-width="1"/>`; }
    else h += `<circle r="15" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.4" stroke-dasharray="3 5"/>`;
    if (mv > 0) h += `<path d="M0 16V118" stroke="#4fd1c5" stroke-width="${mv >= 1 ? 3 : 2.2}" ${mv >= 1 ? '' : 'stroke-dasharray="6 5"'}/>`;
    if (!b.com) { if (pt.tower.here && !pt.tower.mounted) { const n = Math.round(5 * (1 - b.tower)); for (let k = 0; k < n; k++) h += `<rect x="-90" y="${-36 + k * 9}" width="${40 - k * 3}" height="6.5" rx="3" fill="#eef0f2" stroke="#1b1712" stroke-width=".8"/>`; }
      if (pt.nacelle.here && !pt.nacelle.mounted) h += `<rect x="-44" y="-36" width="17" height="9" rx="2" fill="#dfe3e8" stroke="#1b1712" stroke-width=".8"/>`;
      if (pt.blades.here && b.blades < 3) for (let k = 0; k < 3 - b.blades; k++) h += `<path d="M-92 ${18 + k * 8}q30 -4 66 0q-36 3.4 -66 0z" fill="#f4f5f6" stroke="#1b1712" stroke-width=".7"/>`; }
    if (b.tower > 0) { const spinning = b.com;
      h += `<g>${spinning ? '<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="7s" repeatCount="indefinite"/>' : ''}`;
      for (let k = 0; k < b.blades; k++) { const a = (rot(i) + k * 120) * Math.PI / 180, bx = (Math.sin(a) * 62).toFixed(1), by = (-Math.cos(a) * 62).toFixed(1); h += `<path d="M0 0L${bx} ${by}" stroke="#10151f" stroke-width="9" stroke-linecap="round"/><path d="M0 0L${bx} ${by}" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/>`; }
      h += `</g><circle r="${b.nacelle ? 8.5 : 4 + 2.5 * b.tower}" fill="${b.com ? '#62d6a0' : '#fff'}" stroke="#10151f" stroke-width="2.4"/>${!b.nacelle ? `<text y="3.6" font-size="8" text-anchor="middle" font-weight="700" fill="#10151f">${Math.round(b.tower * 5)}</text>` : ''}`; }
    if (b.erecting) h += `<rect x="-66" y="-8" width="20" height="16" rx="3" fill="#f5b544" stroke="#10151f" stroke-width="2"/><g><animateTransform attributeName="transform" type="rotate" values="-5 -56 0;5 -56 0;-5 -56 0" dur="5s" repeatCount="indefinite"/><path d="M-56 0L-2 -2" stroke="#f5b544" stroke-width="6" stroke-linecap="round"/><path d="M-56 0L-2 -2" stroke="#10151f" stroke-width="1.4" stroke-dasharray="6 6"/></g>`;
    for (let k = 0; k < 10; k++) { const a0 = (k * 36 - 90 + 3) * Math.PI / 180, a1 = ((k + 1) * 36 - 90 - 3) * Math.PI / 180, R = 124, arc = `M${(Math.cos(a0) * R).toFixed(1)} ${(Math.sin(a0) * R).toFixed(1)}A${R} ${R} 0 0 1 ${(Math.cos(a1) * R).toFixed(1)} ${(Math.sin(a1) * R).toFixed(1)}`, done = d.steps[k].done, cur = k === si && doing;
      h += `<path d="${arc}" fill="none" stroke="#10151f" stroke-width="11" stroke-linecap="round" opacity=".55"/><path d="${arc}" fill="none" stroke="${done ? SETS.stage.cls[k + 1][0] : cur ? '#f5b544' : 'rgba(255,255,255,.3)'}" stroke-width="7" stroke-linecap="round">${cur ? '<animate attributeName="opacity" values="1;.25;1" dur="1.4s" repeatCount="indefinite"/>' : ''}</path>`; }
    if (open) h += `<circle cx="86" cy="-86" r="15" fill="#ff6452" stroke="#10151f" stroke-width="2.5"/><text x="86" y="-79" font-size="19" text-anchor="middle" fill="#fff" font-weight="700">${open.length}</text>`;
    if (on) h += `<circle r="136" fill="none" stroke="#f5b544" stroke-width="3" stroke-dasharray="4 5"/>`;
    return { s, html: `<svg width="${s}" height="${s}" viewBox="-140 -140 280 280">${h}</svg><b>${name(i)}<small>${si >= 10 ? 'в работе' : 'шаг ' + (si + 1) + ' из 10 · ' + esc((doing ? d.next.name : d.stage).toLowerCase())}</small></b>` }; }
  const tipOf = i => { const d = C.det[i], b = C.st[i]; return `<b>${name(i)}</b> · фидер ${W.feeder[i] + 1}<br>${esc(SETS[S.color].cls[clsOf(i)][1])}<br>готовность ${Math.round(d.pct * 100)} %${b.late > 0 ? ' · отстаёт на ' + fmt(b.late) + ' дн.' : ''}${C.open.has(i) ? '<br>открытых замечаний: ' + C.open.get(i).length : ''}`; };
  function drawMap() { if (S.view !== 'map') return; $('#mapbox').dataset.view = S.mview; if (S.mview === 'grid') return drawGrid();
    const u = mppOf(map), z = map.getZoom(), groups = S.grp && z < 12.6;
    S.on.civil ? gCivil.addTo(map) : gCivil.remove(); S.on.cable && z > 11.2 ? gCable.addTo(map) : gCable.remove(); gSS.clearLayers(); gW.clearLayers(); gG.clearLayers();
    if (S.on.ss) { const lab = (x, t, cls) => L.marker(LL(x, SITE.ss[1]), { interactive: false, icon: L.divIcon({ className: 'sslab ' + cls, html: `<span>${t}</span>`, iconSize: [0, 0] }) }).addTo(gSS);
      lab(SITE.ss[0], z < 11.6 ? 'ПС' : 'ПС 220/35 кВ · ' + fmt(C.L.ss * 100) + ' %', ''); if (z >= 12.4) lab(SITE.ss[0] + 378, 'СНЭ · ' + fmt(C.L.bess * 100) + ' %', 'bess'); }
    if (groups) { for (let f = 0; f < W.NF; f++) { const m = W.feeders[f]; if (!m.length) continue; let p = 0, late = 0, cx = 0, cz = 0; for (const i of m) { p += C.det[i].pct; late += C.st[i].late > 0; cx += X(i); cz += Z(i); } p /= m.length;
        L.marker(LL(cx / m.length, cz / m.length), { icon: L.divIcon({ className: 'fgrp' + (late ? ' late' : ''), html: `<i style="--p:${Math.round(p * 100)}"></i><b>Ф${f + 1}</b><span>${Math.round(p * 100)} % · ${m.length} ВЭУ</span>`, iconSize: [0, 0] }) }).on('click', () => map.fitBounds(L.latLngBounds(m.map(P)).pad(.5))).bindTooltip(`Фидер ${f + 1}: ${m.map(num).join(', ')}${late ? '<br>отстают от плана: ' + late : ''}`, { direction: 'top', className: 'wtip' }).addTo(gG); } }
    else for (let i = 0; i < N; i++) { const on = S.sel === i; if (S.off.has(clsOf(i)) && !on) continue; const g = S.aer.on && u <= 5 && UI.fl ? aerTag(i, on) : glyph(i, u, on), dim = !pass(i) && !on;
      const mk = L.marker(P(i), { icon: L.divIcon({ className: 'wm' + (dim ? ' dim' : '') + (on ? ' on' : ''), html: g.html, iconSize: [g.s, g.s], iconAnchor: [g.s / 2, g.s / 2] }), zIndexOffset: on ? 1000 : 0, keyboard: false }).on('click', e => { L.DomEvent.stopPropagation(e); select(i, false); }).addTo(gW);
      mk.bindTooltip(tipOf(i), { direction: 'top', offset: [0, -g.s / 2 + 4], className: 'wtip' + (on ? ' sel' : ''), permanent: on && u > 3.3 }); }
    drawAer(u);
    const n = shown(); $('#mapnote').textContent = groups ? 'Группы по фидерам: приблизьте карту, чтобы увидеть ВЭУ' : n < N ? `Показано ${n} из ${N} ВЭУ` : ''; $('#mapnote').hidden = !groups && n >= N; }
  // матрица: все ВЭУ плитками по фидерам — вся площадка на одном экране, без карты
  function drawGrid() { let h = ''; for (let f = 0; f < W.NF; f++) { const m = W.feeders[f].slice().sort((a, b) => W.fpos[b] - W.fpos[a]); if (!m.length) continue; let p = 0; for (const i of m) p += C.det[i].pct;
      h += `<div class="frow"><span>Ф${f + 1}<small>${Math.round(p / m.length * 100)} %</small></span><div>${m.map(i => { const on = S.sel === i, hide = S.off.has(clsOf(i)) && !on, dim = hide || (!pass(i) && !on);
        return `<button class="wt${on ? ' on' : ''}${dim ? ' dim' : ''}" data-i="${i}" style="--c:${colOf(i)}" title="${name(i)}: ${esc(SETS[S.color].cls[clsOf(i)][1])}, готовность ${Math.round(C.det[i].pct * 100)} %"><b>${num(i)}</b>${C.st[i].erecting ? '<u></u>' : ''}${C.open.has(i) ? '<i></i>' : ''}<em style="width:${Math.round(C.det[i].pct * 100)}%"></em></button>`; }).join('')}</div></div>`; }
    $('#grid').innerHTML = `<p class="hint">Фидеры 35 кВ, в каждом ВЭУ идут от подстанции к дальней. Цвет — «${SETS[S.color].name.toLowerCase()}», полоска внизу — готовность.</p>` + h; const n = shown(); $('#mapnote').textContent = n < N ? `Показано ${n} из ${N} ВЭУ` : ''; $('#mapnote').hidden = n >= N; }
  $('#grid').addEventListener('click', e => { const b = e.target.closest('.wt'); if (b) select(+b.dataset.i, false); });
  function focus(i) { if (S.mview !== 'map') return; map.invalidateSize(); map.setView(P(i), Math.max(map.getZoom(), 15.5), { animate: false }); }
  /* аэросъёмка на карте: снимки облёта лежат на своих местах в масштабе карты; издалека — контуры кадров в цвете стадии.
     «Было — стало» делит карту шторкой: слева предыдущий облёт, справа выбранный. Сами снимки рисует epc-drone.js. */
  const aerBox = i => [LL(X(i) - 230, Z(i) + 108), LL(X(i) + 90, Z(i) - 112)];
  function aerTag(i, on) { const o = UI.fl.look(i, S.aer.k || UI.fl.lastK(S.D) || 1); return { s: 0, html: `<span class="atag${o.diff > 0 ? ' bad' : o.diff < 0 ? ' warn' : ''}${on ? ' on' : ''}" style="--dy:${Math.round(112 / mppOf(map)) + 5}px"><b>${name(i)}</b> ${esc(UI.fl.STG[o.ai][1].toLowerCase())}${o.diff ? ' · расхождение с отчётом' : ''}</span>` }; }
  function aerClip() { const A = S.aer; if (!A.on || !A.cmp) { paneA.style.clip = paneB.style.clip = 'auto'; return; } const nw = map.containerPointToLayerPoint([0, 0]), se = map.containerPointToLayerPoint(map.getSize()), x = nw.x + (se.x - nw.x) * A.sx;
    paneA.style.clip = `rect(${nw.y}px,${x}px,${se.y}px,${nw.x}px)`; paneB.style.clip = `rect(${nw.y}px,${se.x}px,${se.y}px,${x}px)`; $('#aerline').style.left = A.sx * 100 + '%'; }
  function drawAer(u) { gA.clearLayers(); gB.clearLayers(); const A = S.aer, bar = $('#aerbar'), F = UI.fl; bar.hidden = !A.on; $('#aerline').hidden = !(A.on && A.cmp); $('#m-aer').classList.toggle('on', A.on); if (!A.on || !F) return aerClip();
    const K = F.lastK(S.D); if (!K) { bar.innerHTML = `<span>На ${fd(S.D)} облётов ещё не было</span>`; return aerClip(); } if (A.k == null || A.k > K || A.auto) A.k = K; const k = A.k, pk = Math.max(1, k - 1), vb = map.getBounds().pad(.2), det = u < 5.2; let diff = 0;
    for (let i = 0; i < N; i++) { const o = F.look(i, k); if (o.diff) diff++; if (!vb.contains(P(i))) continue;
      const put = (g, pane, kk, boxes) => { const ov = (det ? L.svgOverlay(F.el(i, F.dayOf(kk), boxes), aerBox(i), { pane, interactive: false }) : L.rectangle(aerBox(i), { pane, color: '#fff', weight: 1, fillColor: F.STG[F.look(i, kk).ai][0], fillOpacity: .9, interactive: false })).addTo(g);
        if (det) F.photo(i, F.dayOf(kk)).then(url => { if (url && g.hasLayer(ov)) { g.removeLayer(ov); L.imageOverlay(url, aerBox(i), { pane, interactive: false, className: 'aerph' }).addTo(g); } }); };
      put(gB, 'aerB', k, true); if (A.cmp) put(gA, 'aerA', pk, false); }
    bar.innerHTML = `<button data-ak="prev" aria-label="Предыдущий облёт"${k <= 1 ? ' disabled' : ''}>‹</button><span><b>Облёт № ${k}</b> · ${fd(F.dayOf(k))}</span><button data-ak="next" aria-label="Следующий облёт"${k >= K ? ' disabled' : ''}>›</button>
      <button data-ak="cmp" class="${A.cmp ? 'on' : ''}">Было — стало</button>${A.cmp ? `<input type="range" id="aer-sx" min="5" max="95" value="${Math.round(A.sx * 100)}" aria-label="Положение шторки"><span class="lr">слева № ${pk} · ${fd(F.dayOf(pk))}</span>` : `<span class="lr">${det ? 'расхождений с отчётом: ' + diff : 'приблизьте карту — откроются снимки'}</span>`}<button data-ak="list">Сверка</button>`;
    aerClip(); }
  $('#aerbar').addEventListener('click', e => { const b = e.target.closest('[data-ak]'); if (!b) return; const A = S.aer, k = b.dataset.ak, K = UI.fl.lastK(S.D);
    if (k === 'prev') { A.k = Math.max(1, A.k - 1); A.auto = false; } else if (k === 'next') { A.k = Math.min(K, A.k + 1); A.auto = A.k === K; } else if (k === 'cmp') A.cmp = !A.cmp; else if (k === 'list') return go('drone'); redraw(); });
  $('#aerbar').addEventListener('input', e => { if (e.target.id === 'aer-sx') { S.aer.sx = +e.target.value / 100; aerClip(); } });
  $('#m-aer').onclick = () => { S.aer.on = !S.aer.on; if (S.aer.on && S.mview !== 'map') { S.mview = 'map'; mapHead(); $('#mapbox').dataset.view = 'map'; map.invalidateSize(); } redraw(); };
  map.on('move', aerClip); map.on('moveend', () => { if (S.aer.on) redraw(); });
  map.on('zoomend', redraw); map.on('click', () => { if (S.sel != null) select(null, false); });
  function mapHead() { $('#m-base').innerHTML = Object.entries(BASES).map(([k, b]) => `<button data-base="${k}" class="${S.base === k && S.mview === 'map' ? 'on' : ''}">${b[0]}</button>`).join('') + `<button data-mv="grid" class="${S.mview === 'grid' ? 'on' : ''}">Матрица</button>`; $('#m-grp').classList.toggle('on', S.grp); $('#m-grp').hidden = S.mview !== 'map'; $('.zoom').hidden = S.mview !== 'map'; }
  $('#m-base').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.mv) S.mview = 'grid'; else { S.mview = 'map'; S.base = b.dataset.base; save('jambyl-base', S.base); setBase(map, S.base); } mapHead(); $('#mapbox').dataset.view = S.mview; if (S.mview === 'map') map.invalidateSize(); redraw(); });
  $('#m-grp').onclick = () => { S.grp = !S.grp; if (S.grp && map.getZoom() >= 12.6) fitAll(); mapHead(); redraw(); };
  $('#z-in').onclick = () => map.zoomIn(1); $('#z-out').onclick = () => map.zoomOut(1); $('#z-fit').onclick = () => { fitAll(); redraw(); };
  $('#m-color').addEventListener('change', e => { S.color = e.target.value; S.off.clear(); S.tab = 'cls'; renderLeft(); redraw(); });
  addEventListener('resize', () => { if (S.view === 'map') { fitAspect(); redraw(); } });
  mapHead();

  /* ---------- левая колонка: стадии, слои, фильтры ---------- */
  function renderLeft() { const L = C.L, set = SETS[S.color], cnt = set.cls.map(() => 0); for (let i = 0; i < N; i++) cnt[clsOf(i)]++; let body;
    if (S.tab === 'cls') body = `<p class="hint">${set.hint ? set.hint : S.color === 'stage' ? 'Цвет метки — последний законченный шаг.' : S.color === 'ready' ? 'Цвет метки — что сейчас мешает начать монтаж или пустить ВЭУ.' : 'Цвет метки — насколько ВЭУ отстаёт от плана.'} Нажмите на строку, чтобы скрыть класс.</p>
      <div class="classes">${set.cls.map((c, k) => `<button data-cls="${k}" class="${S.off.has(k) ? 'off' : ''}" aria-pressed="${!S.off.has(k)}"><i style="background:${c[0]}"></i><span>${c[1]}</span><b>${cnt[k]}</b></button>`).join('')}</div>${S.off.size ? '<button class="btn small" data-cls="all">Показать все</button>' : ''}`;
    else if (S.tab === 'lay') { const row = (k, title, sum, p, extra) => `<div class="layer"><label>${k ? `<input type="checkbox" data-layer="${k}" ${S.on[k] ? 'checked' : ''}>` : '<span></span>'}<b>${title}</b><em>${sum}</em><span class="bar"><i style="width:${Math.round(p * 100)}%"></i></span></label>${extra || ''}</div>`;
      body = row('civil', 'Дороги и площадки', fmt((L.road / L.roadQty + L.pad.done / N) * 50) + ' %', (L.road / L.roadQty + L.pad.done / N) / 2, `<p>Дороги ${fmt(L.road)} из ${fmt(L.roadQty)} км, площадки ${L.pad.done} из ${N}</p>`) + row('', 'Фундаменты', `${L.found.done} из ${N}`, L.found.done / N) + row('', 'Монтаж ВЭУ', `${L.erect.done} из ${N}`, L.erect.done / N) +
        row('cable', 'Кабель 35 кВ', `${L.mv.done} из ${N}`, L.mv.done / N, `<p>Готово фидеров: ${L.feeders.filter(f => f.p >= 1).length} из ${L.feeders.length}</p>`) + row('ss', 'Подстанция и накопитель', fmt(L.ss * 100) + ' %', L.ss, `<p>ВЛ до ПС Жамбыл ${fmt(L.ohlJ * 100)} %, до ПС Кентау ${fmt(L.ohlK * 100)} %</p>`) + row('', 'Пуск ВЭУ', `${L.com.done} из ${N}`, L.com.done / N); }
    else body = `<div class="pad filters"><label class="fld">Фидер 35 кВ<select data-f="feeder"><option value="">Все фидеры</option>${Array.from({ length: W.NF }, (_, f) => `<option value="${f}" ${S.flt.feeder === String(f) ? 'selected' : ''}>Фидер ${f + 1}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" data-f="late" ${S.flt.late ? 'checked' : ''}>Только отстающие от плана</label><label class="chk"><input type="checkbox" data-f="qc" ${S.flt.qc ? 'checked' : ''}>Только с открытыми замечаниями</label><label class="chk"><input type="checkbox" data-f="now" ${S.flt.now ? 'checked' : ''}>Только где сейчас идут работы</label>
      ${S.flt.act ? `<p class="hint"><b>Из графика:</b> ВЭУ, где не закончено «${E.A[S.flt.act].name}».</p>` : ''}<p class="hint">Подходит ${shown()} из ${N} ВЭУ. Остальные на карте приглушены.</p><button class="btn small" data-f="reset">Сбросить фильтры</button></div>`;
    const rd = E.real, nf = (S.flt.feeder !== '') + S.flt.late + S.flt.qc + S.flt.now + !!S.flt.act;
    $('#left').innerHTML = `<div class="box"><div class="tabs" role="tablist">${[['cls', 'Стадии'], ['lay', 'Слои'], ['flt', 'Фильтры' + (nf ? ' · ' + nf : '')]].map(t => `<button role="tab" data-tab="${t[0]}" aria-selected="${S.tab === t[0]}">${t[1]}</button>`).join('')}</div>${body}</div>
      <div class="box src"><h2>Данные с площадки${rd ? ' <span>отчёт на ' + fd(rd.day) + '</span>' : ''}</h2><div class="pad"><p>${rd ? `Факт по ${Object.keys(rd.wtg).length} ВЭУ из файла «${esc(rd.file || 'отчёт')}». После даты отчёта — прогноз.` : 'Загрузите таблицу с датами по ВЭУ: дороги, площадки, фундаменты, монтаж, кабель, пуск.'}</p>
        <div class="btns"><button class="btn main" data-src="load">Загрузить отчёт</button><button class="btn" data-src="tpl">Шаблон</button>${rd ? '<button class="btn" data-src="demo">Убрать отчёт</button>' : ''}</div></div></div>`; }
  $('#left').addEventListener('change', e => { const k = e.target.dataset.layer, f = e.target.dataset.f; if (k) { S.on[k] = e.target.checked; redraw(); } if (f) { S.flt[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; renderLeft(); redraw(); } });
  $('#left').addEventListener('click', e => { const t = e.target.closest('[data-tab]'), c = e.target.closest('[data-cls]'), s = e.target.closest('[data-src]'), f = e.target.closest('button[data-f]');
    if (t) { S.tab = t.dataset.tab; return renderLeft(); }
    if (c) { const k = c.dataset.cls; if (k === 'all') S.off.clear(); else S.off.has(+k) ? S.off.delete(+k) : S.off.add(+k); renderLeft(); return redraw(); }
    if (f) { S.flt = { feeder: '', late: false, qc: false, now: false }; renderLeft(); return redraw(); }
    if (!s) return; const k = s.dataset.src;
    if (k === 'load') $('#file').click(); else if (k === 'demo') { E.loadFact(null); save('jambyl-fact', null); update(); }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([IO.template()], { type: 'text/csv;charset=utf-8' })); a.download = 'Жамбыл_факт_стройки_шаблон.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } });
  $('#file').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return;
    try { const real = await IO.fromFile(f); E.loadFact(real); save('jambyl-fact', real); S.D = clampD(real.day); update(); toast('Отчёт загружен: ' + Object.keys(real.wtg).length + ' ВЭУ'); } catch (err) { toast('Отчёт не загружен: ' + err.message); } e.target.value = ''; });
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 5000); }

  /* ---------- правая колонка: площадка или выбранная ВЭУ ---------- */
  const HOLD = [['ready', 'Готовы к монтажу, ждут кран'], ['parts', 'Ждут комплект ВЭУ'], ['cure', 'Бетон набирает прочность'], ['waitGrid', 'Смонтированы, ждут сеть 220 кВ'], ['waitCable', 'Смонтированы, ждут кабель'], ['test', 'На пусконаладке']];
  function holdRows(compact) { const rows = HOLD.filter(([k]) => C.BN[k].length || !compact); return rows.length ? `<div class="hold">${rows.map(([k, t]) => `<button data-hold="${k}"><span>${t}</span><b>${C.BN[k].length}</b><i><u style="width:${C.BN[k].length / N * 100}%;background:${SETS.ready.cls[READY.indexOf(k)][0]}"></u></i></button>`).join('')}</div>` : '<p class="hint">Сейчас ни одна ВЭУ не ждёт: работы идут по очереди.</p>'; }
  const gateList = (list, hold) => `<div class="check gates">${list.map(g => `<div class="${g.ok ? 'done' : g === hold ? 'cur' : ''}"><i></i><span>${g.name}</span><em>${g.ok ? fd(g.day) : g.day == null ? '—' : 'ждём ' + fd(g.day)}</em>${g.note && !g.ok ? `<small>${g.note}</small>` : ''}</div>`).join('')}</div>`;
  function craneBox() { const L = E.craneLoad(S.D), M = C.M, mw = M.ms[M.ms.length - 1].fact, slip = mw < 0 ? null : mw - E.PD, st = M.stopped;
    return `<div class="box cranes"><h2>Краны <span>для планового темпа нужно ${fmt(L.need, 1)}</span></h2><div class="pad">
      <div class="set"><div class="stepper"><label>Кранов на площадке</label><div><button data-cr="n-" aria-label="Меньше кранов"${L.n <= 1 ? ' disabled' : ''}>−</button><b>${L.n}</b><button data-cr="n+" aria-label="Больше кранов"${L.n >= 8 ? ' disabled' : ''}>+</button></div></div>
        <div class="stepper"><label>Дней на одну ВЭУ</label><div><button data-cr="d-" aria-label="Меньше дней"${L.days <= 3 ? ' disabled' : ''}>−</button><b>${L.days}</b><button data-cr="d+" aria-label="Больше дней"${L.days >= 20 ? ' disabled' : ''}>+</button></div></div></div>
      <dl class="facts"><dt>Монтаж закончится</dt><dd>${fd(L.end)}${L.end > L.planEnd + 3 ? ', на ' + fmt(L.end - L.planEnd) + ' дн. позже плана' : ''}</dd><dt>1000 МВт в сети</dt><dd class="${slip > 3 ? 'bad' : ''}">${mw < 0 ? 'позже ' + fd(E.MAXD) : fd(mw) + (slip > 3 ? ', на ' + fmt(slip) + ' дн. позже RFP' : ', в срок RFP')}</dd></dl>
      <div class="crlist">${L.list.map(c => { const w = c.cur != null ? c.cur : c.next, g = c.cur == null && c.next != null ? C.gt[c.next] : null;
        return `<button ${w != null ? 'data-w="' + w + '"' : 'disabled'}><b>${c.no}</b><span>${c.cur != null ? name(c.cur) + '<small>' + (st ? 'стоит: ' + M.stopWhy.toLowerCase() : 'монтаж до ' + fd(c.until)) + '</small>' : c.next != null ? 'Свободен<small>' + name(c.next) + ' с ' + fd(c.nextDay) + (g && g.holdErect && g.holdErect.k !== 'crane' ? ': ' + ({ cure: 'бетон набирает прочность', parts: 'ждёт комплект', road: 'нет подъезда', pad: 'нет площадки' })[g.holdErect.k] : '') + '</small>' : 'Работа закончена<small>смонтировал ' + c.done + ' ВЭУ</small>'}</span><em>${c.done} из ${c.total}</em></button>`; }).join('')}</div>
      <p class="note">Дни на одну ВЭУ — вместе с переездом крана. Поменяйте числа, прогноз пересчитается.</p></div></div>`; }
  document.addEventListener('click', e => { const b = e.target.closest('[data-cr]'); if (!b) return; const L = E.craneLoad(S.D), k = b.dataset.cr;
    E.setCranes(L.n + (k === 'n+' ? 1 : k === 'n-' ? -1 : 0), L.days + (k === 'd+' ? 1 : k === 'd-' ? -1 : 0)); update(); const el = document.querySelector('[data-cr="' + k + '"]'); if (el) el.focus(); });
  function renderRight() { const M = C.M, i = S.sel; let h;
    if (i == null) { const lag = Math.round(S.D - M.es), q = [...C.queue.entries()].slice(0, 5);
      h = `<div class="box"><h2>Площадка <span>${fd(S.D)}</span></h2><div class="pad"><div class="kpis">
          <div class="kpi"><label>Готовность</label><b>${fmt(M.ev * 100, 1)}<small>%</small></b><span>план ${fmt(M.pv * 100, 1)} %</span></div>
          <div class="kpi ${M.spi < .95 ? 'bad' : 'ok'}"><label>Темп к плану</label><b>${fmt(M.spi, 2)}</b><span>${lag > 3 ? 'отставание ' + fmt(lag) + ' дн.' : lag < -3 ? 'опережение ' + fmt(-lag) + ' дн.' : 'по графику'}</span></div>
          <div class="kpi"><label>Смонтировано</label><b>${C.L.erect.done}<small>из ${N}</small></b><span>в монтаже ${C.L.erect.now.length}</span></div>
          <div class="kpi"><label>В сети</label><b>${fmt(M.mw)}<small>МВт</small></b><span>по вехам RFP ${fmt(M.mwPlan)}</span></div></div></div></div>
        <div class="box"><h2>Что держит монтаж и пуск</h2><div class="pad">${holdRows(true)}<p class="note">Нажмите на строку — карта покажет только эти ВЭУ.</p></div></div>
        ${craneBox()}
        <div class="box"><h2>Очередь на монтаж</h2><div class="pad">${q.length ? `<div class="queue">${q.map(([w, k]) => { const g = C.gt[w]; return `<button data-w="${w}"><b>${k}</b><span>${name(w)}<small>${g.state === 'ready' ? 'всё готово, ждёт кран' : E.GATE_STATE[g.state].toLowerCase()}</small></span><em>${fd(g.startDay)}</em></button>`; }).join('')}</div>` : '<p class="hint">Все ВЭУ уже в монтаже или смонтированы.</p>'}</div></div>`; }
    else { const b = C.st[i], d = C.det[i], g = C.gt[i], obs = C.open.get(i) || [], pct = Math.round(d.pct * 100), cls = SETS.stage.cls[SETS.stage.of(i)], fmem = W.feeders[W.feeder[i]].slice().sort((a, c) => W.fpos[c] - W.fpos[a]), place = fmem.indexOf(i) + 1, jr = JOURNAL.filter(x => x.i === i).slice(-4).reverse(), found = E.fact.found, pour = S.D >= found.e[i]; let body;
      if (S.rtab === 'steps') body = `<div class="check">${d.steps.map(x => { const late = Math.round(S.D - x.plan); return `<div class="${x.done ? 'done' : x === d.next ? 'cur' : ''}"><i></i><span>${x.name}</span><em>${x.done ? fd(x.day) : 'план ' + fd(x.plan)}</em>${!x.done && late > 0 ? `<small>просрочено на ${fmt(late)} дн.</small>` : ''}</div>`; }).join('')}</div>
        <dl class="facts"><dt>Следующая веха</dt><dd>${d.next ? d.next.name + ', ' + fd(d.next.day) : 'все работы закончены'}</dd></dl><div class="btns more"><button class="btn small main" data-b3d="${i}">Стройка в 3D</button><button class="btn small" data-chk="${i}">Чек-лист приёмки</button><button class="btn small" data-arch="${i}">Архив снимков</button><button class="btn small" data-otk="${i}">Замечание ОТК</button></div>`;
      else if (S.rtab === 'gates') body = `<p class="lead ${g.state === 'ready' ? 'warn' : g.state === 'parts' || g.state === 'waitGrid' || g.state === 'waitCable' ? 'bad' : ''}">${E.GATE_STATE[g.state]}${C.queue.has(i) ? '. В очереди на монтаж № ' + C.queue.get(i) : ''}</p>
        <h3>Чтобы начать монтаж</h3>${gateList(g.erect, g.holdErect)}<h3>Чтобы пустить ВЭУ</h3>${gateList(g.com, g.holdCom)}<p class="note">Держит то условие, которое выполнится последним. Срок набора прочности — ${E.CURE} суток.</p>`;
      else if (S.rtab === 'parts') { const ps = Object.fromEntries(d.parts.map(p => [p.k, p])), stt = p => p.mounted ? 'смонтировано' : p.here ? 'на площадке с ' + fd(p.day) : p.day != null ? 'в пути, ждём ' + fd(p.day) : 'нет данных';
        body = `<div class="tree"><div><b>Фундамент</b><em>${pour ? (g.erect[2].ok ? 'набрал прочность' : 'забетонирован ' + fd(found.e[i])) : b.found > 0 ? 'в работе' : 'не начат'}</em><small>плита Ø26 м, бетон 680,5 м³, арматура 81,8 т, 200 анкерных болтов</small></div>
          <div><b>Башня, 5 секций</b><em>${stt(ps.tower)}</em><small>комплект ${ps.tower.sn.replace(' (5 шт)', '')}, высота оси 110 м</small></div><div><b>Гондола со ступицей</b><em>${stt(ps.nacelle)}</em><small>комплект ${ps.nacelle.sn}, SANY SI-19580, 7,15 МВт</small></div>
          <div><b>Лопасти, 3 шт</b><em>${b.blades ? b.blades + ' из 3 установлено' : stt(ps.blades)}</em><small>комплект ${ps.blades.sn}, ротор 195 м</small></div>
          <div><b>Кабель 35 кВ</b><em>${b.mv ? 'подключён' : 'не подключён'}</em><small>фидер ${W.feeder[i] + 1}, место ${place} из ${fmem.length} от подстанции, до подстанции ${fmt(W.route[i] / 1000, 1)} км</small></div></div>
          <p class="note">Размеры фундамента — по чертежу 104218-CI-DW-040. </p>`; }
      else body = `${obs.length ? `<div class="obs">${obs.map(t => `<div class="${t.sev}">${t.photo ? `<img class="tphoto" src="${t.photo}" alt="Фото к замечанию">` : ''}<b>${esc(t.text)}</b><small>${t.disc} · ${T_STATUS[t.status]} · ${t.age} дн.</small></div>`).join('')}</div>` : '<p class="hint">Открытых замечаний по этой ВЭУ нет.</p>'}
        <input class="jnote" id="j-note" placeholder="Текст замечания или заметка к записи" maxlength="140" autocomplete="off"><div class="btns"><button class="btn main" data-j="punch">Выдать замечание</button><button class="btn" data-j="qa">Приёмка ОТК</button><button class="btn" data-j="report">Суточный отчёт</button><button class="btn" data-j="mob">Заявка на материалы</button></div>
        ${jr.length ? `<div class="jr">${jr.map(x => `<div>${J_KIND[x.kind]}${x.note ? ': ' + esc(x.note) : ''}<small>${fd(x.day)} · ${esc(x.stage)}, готовность ${x.pct} %</small></div>`).join('')}</div>` : ''}<p class="note">Журнал и ваши замечания хранятся в этом браузере.</p>`;
      h = `<div class="box card"><div class="pad head"><button class="x" data-x aria-label="Закрыть">×</button><div class="who"><b>${name(i)}</b><span>фидер ${W.feeder[i] + 1}</span></div>
          <div class="chips"><span class="chip cls"><i style="background:${cls[0]}"></i>${cls[1]}</span><span class="chip ${b.late > 14 ? 'bad' : b.late > 0 ? 'warn' : 'ok'}">${b.late > 0 ? 'отстаёт на ' + fmt(b.late) + ' дн.' : 'по графику'}</span>${obs.length ? `<span class="chip bad">замечаний ${obs.length}</span>` : ''}</div>
          <div class="prog"><i style="width:${pct}%"></i><b>${pct} %</b><span>план ${fmt(d.planPct * 100)} % · темп ${fmt(d.spi, 2)}</span></div></div>
        <div class="tabs" role="tablist">${[['steps', 'Ход работ'], ['gates', 'Готовность'], ['parts', 'Состав'], ['log', 'Журнал' + (obs.length ? ' · ' + obs.length : '')]].map(t => `<button role="tab" data-rtab="${t[0]}" aria-selected="${S.rtab === t[0]}">${t[1]}</button>`).join('')}</div><div class="pad">${body}</div></div>`; }
    $('#right').innerHTML = h; }
  $('#right').addEventListener('click', e => { if (e.target.closest('[data-x]')) return select(null, false); const t = e.target.closest('[data-rtab]'), w = e.target.closest('[data-w]'), hd = e.target.closest('[data-hold]'), b = e.target.closest('[data-j]');
    if (t) { S.rtab = t.dataset.rtab; return renderRight(); } if (w) return select(+w.dataset.w, true);
    if (hd) { S.color = 'ready'; $('#m-color').value = 'ready'; S.off = new Set(READY.map((_, k) => k).filter(k => READY[k] !== hd.dataset.hold)); S.tab = 'cls'; renderLeft(); return redraw(); }
    if (!b || S.sel == null) return; const d = C.det[S.sel], n = $('#j-note'), note = n ? n.value.trim() : '', kind = b.dataset.j;
    if (kind === 'punch') { if (!note) { toast('Напишите текст замечания'); n && n.focus(); return; } addPunch(S.sel, note, /монтаж|башн|гондол|лопаст/i.test(d.stage) ? 'Монтаж ВЭУ' : /кабел/i.test(d.stage) ? 'Кабель 35 кВ' : 'Фундаменты', 'warn'); }
    JOURNAL.push({ i: S.sel, day: S.D, kind, note, stage: d.stage, pct: Math.round(d.pct * 100), at: Date.now() }); save('jambyl-journal', JOURNAL.slice(-500)); toast('Записано в журнал ' + name(S.sel)); update(); });
  function addPunch(i, text, disc, sev, extra) { const p = { id: 'u' + Date.now(), i, text, disc, sev, status: 'new', day: S.D, ...(extra || {}) }; PUNCH.push(p); try { localStorage.setItem('jambyl-punch', JSON.stringify(PUNCH)); } catch (e) { try { localStorage.setItem('jambyl-punch', JSON.stringify(PUNCH.map(x => ({ ...x, photo: undefined })))); } catch (e2) {} } return p; }      // если фото не помещается в память браузера, замечание сохраняется без него
  function movePunch(id, status) { const p = PUNCH.find(x => x.id === id); if (!p) return; if (status === 'delete') PUNCH = PUNCH.filter(x => x.id !== id); else p.status = status; save('jambyl-punch', PUNCH); update(); }

  /* ---------- стройка одной ВЭУ в 3D: страница турбины в режиме стройки, с шагами и датами этой ВЭУ ---------- */
  const dshort = x => E.dateOf(x).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
  function buildPos(i) { const d = C.det[i], k = d.next ? d.steps.indexOf(d.next) : 10; if (k >= 10) return 10; const prev = k > 0 && d.steps[k - 1].id === d.next.id ? d.steps[k - 1].day : E.fact[d.next.id].s[i]; return k + Math.max(0, Math.min(.98, (S.D - prev) / Math.max(.5, d.next.day - prev))); }
  function open3d(i) { const d = C.det[i], q = new URLSearchParams({ build: 1, wtg: name(i), b: buildPos(i).toFixed(2), d: fd(S.D), f: d.steps.map(x => dshort(x.day)).join(','), pl: d.steps.map(x => dshort(x.plan)).join(',') });
    let box = $('#b3d'); if (!box) { box = document.createElement('div'); box.id = 'b3d'; box.innerHTML = '<iframe title="Стройка ВЭУ в 3D"></iframe><button class="btn" data-b3x>← К карте</button>'; $('#main').appendChild(box); }
    box.querySelector('iframe').src = 'build3d.html?v=9#' + q.toString(); box.hidden = false; }
  document.addEventListener('click', e => { const b = e.target.closest('[data-b3d]'); if (b) return open3d(+b.dataset.b3d); if (e.target.closest('[data-b3x]')) { const box = $('#b3d'); box.hidden = true; box.querySelector('iframe').src = 'about:blank'; } });
  addEventListener('keydown', e => { const box = $('#b3d'); if (e.key === 'Escape' && box && !box.hidden) { box.hidden = true; box.querySelector('iframe').src = 'about:blank'; } });

  /* ---------- общее: выбор, дата, разделы ---------- */
  function select(i, zoom) { S.sel = i; if (i != null && zoom) { if (S.view !== 'map') go('map'); focus(i); } renderLeft(); renderRight(); redraw(); }
  function render() { if (S.view === 'map') { renderLeft(); renderRight(); redraw(); } else if (UI.views[S.view]) UI.views[S.view](); }
  function update() { calc(); $('#d-range').value = S.D; $('#d-range').style.setProperty('--p', S.D / E.MAXD * 100 + '%'); $('#d-out').textContent = fd(S.D); $('#chip-date').textContent = fd(S.D); $('#d-src').textContent = E.real ? 'отчёт с площадки' : ''; $('#d-src').className = 'dsrc' + (E.real ? ' real' : '');
    const n = C.tasks.filter(t => t.status !== 'closed').length; $('#n-tasks').textContent = n || ''; $('#n-tasks').hidden = !n; render(); }
  function go(v) { S.view = v; for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== 'v-' + v; for (const b of document.querySelectorAll('#nav [data-v]')) b.classList.toggle('on', b.dataset.v === v); try { history.replaceState(null, '', '#v=' + v); } catch (e) {} const m = $('#main'); if (m) m.scrollTop = 0; if (v === 'map') { fitAspect(); if (!go.fit) { go.fit = 1; fitAll(); } } render(); }
  $('#nav').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { e.preventDefault(); go(b.dataset.v); } });
  $('#d-range').max = E.MAXD; $('#d-range').addEventListener('input', e => { S.D = +e.target.value; update(); });
  $('#d-prev').onclick = () => { S.D = clampD(S.D - 7); update(); }; $('#d-next').onclick = () => { S.D = clampD(S.D + 7); update(); }; $('#d-today').onclick = () => { S.D = E.real ? clampD(E.real.day) : today; update(); };
  addEventListener('keydown', e => { if (e.key === 'Escape' && S.view === 'map') select(null, false); });
  const UI = window.EPCUI = { S, C, E, W, SITE, N, $, fmt, fd, fm, name, esc, SETS, READY, HOLD, T_STATUS, holdRows, craneBox, select, update, go, toast, open3d, addPunch, movePunch, renderLeft, redraw, punches: () => PUNCH, L, LL, P, mkMap, setBase, map, mapHead, BASES, BOUNDS, lineLL, mppOf, num, load, save, views: {}, today };
  const q = new URLSearchParams(location.hash.slice(1)); if (q.get('d')) S.D = clampD(+q.get('d'));
  UI.start = () => { calc(); update(); go(q.get('v') && (q.get('v') === 'map' || UI.views[q.get('v')]) ? q.get('v') : q.get('wtg') ? 'map' : 'dash'); if (q.get('wtg')) { const i = SITE.wtg.findIndex(w => w[0] === q.get('wtg')); if (i >= 0) select(i, true); } };
})();
