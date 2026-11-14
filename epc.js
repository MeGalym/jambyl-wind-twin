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
  const S = { D: today, sel: null, view: 'map', tab: 'cls', rtab: 'steps', color: 'stage', off: new Set(), on: { civil: true, cable: true, ss: true }, flt: { feeder: '', late: false, qc: false, now: false } };
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

  /* ---------- план площадки ---------- */
  const svg = $('#map'), X = i => SITE.wtg[i][1], Z = i => SITE.wtg[i][2];
  const all = []; for (let i = 0; i < N; i++) all.push([X(i), Z(i)]); for (const a of [...SITE.roads, ...SITE.access]) for (let k = 0; k < a.length; k += 2) all.push([a[k], a[k + 1]]);
  const B = { x0: Math.min(...all.map(p => p[0])) - 500, x1: Math.max(...all.map(p => p[0])) + 500, y0: Math.min(...all.map(p => p[1])) - 500, y1: Math.max(...all.map(p => p[1])) + 500 };
  const view = { x: B.x0, y: B.y0, w: B.x1 - B.x0, h: B.y1 - B.y0 };
  const path = a => { let d = ''; for (let k = 0; k < a.length; k += 2) d += (k ? 'L' : 'M') + a[k] + ' ' + a[k + 1]; return d; };
  const roadD = SITE.roads.map(path).join(''), accessD = SITE.access.map(path).join(''), trenchD = Object.values(SITE.trench).flat().map(path).join('');
  const SSX = SITE.ss[0], SSY = SITE.ss[1], rot = i => (i * 47) % 120;
  let grid = ''; for (let x = Math.ceil(B.x0 / 1000) * 1000; x < B.x1; x += 1000) grid += `M${x} ${B.y0}V${B.y1}`; for (let y = Math.ceil(B.y0 / 1000) * 1000; y < B.y1; y += 1000) grid += `M${B.x0} ${y}H${B.x1}`;
  svg.innerHTML = `<path d="${grid}" fill="none" stroke="#dfe3e8" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <g id="g-civil" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${accessD}" stroke="#c9b68a" class="rc" vector-effect="non-scaling-stroke"/><path d="${roadD}" stroke="#c9b68a" class="rc" vector-effect="non-scaling-stroke"/><path d="${accessD}" stroke="#f6ecd0" class="rt" vector-effect="non-scaling-stroke"/><path d="${roadD}" stroke="#f6ecd0" class="rt" vector-effect="non-scaling-stroke"/></g>
    <path id="g-cable" d="${trenchD}" fill="none" stroke="#2f8f88" stroke-dasharray="5 4" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
    <g id="g-wtg"></g><g id="g-ss"></g><g id="g-call"></g>`;
  const upp = () => view.w / Math.max(1, svg.clientWidth);
  function fitAspect() { const cw = svg.clientWidth || 1, ch = svg.clientHeight || 1, cx = view.x + view.w / 2, cy = view.y + view.h / 2; view.h = view.w * ch / cw; view.x = cx - view.w / 2; view.y = cy - view.h / 2; }
  function fitAll() { const cw = svg.clientWidth || 1, ch = svg.clientHeight || 1, bw = B.x1 - B.x0, bh = B.y1 - B.y0, w = Math.max(bw, bh * cw / ch); view.w = w; view.h = w * ch / cw; view.x = (B.x0 + B.x1) / 2 - view.w / 2; view.y = (B.y0 + B.y1) / 2 - view.h / 2; }
  const applyView = () => svg.setAttribute('viewBox', `${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`);
  let raf = 0; const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawMap(); }); };
  function drawMap() {
    if (S.view !== 'map' || !svg.clientWidth) return; applyView(); const u = upp(), rw = Math.max(1.6, Math.min(16, 14 / u)), fs = 11.5 * u;
    svg.querySelectorAll('.rc').forEach(p => p.setAttribute('stroke-width', rw + 2.4)); svg.querySelectorAll('.rt').forEach(p => p.setAttribute('stroke-width', rw));
    $('#g-civil').style.display = S.on.civil ? '' : 'none'; $('#g-cable').style.display = S.on.cable ? '' : 'none';
    const sw = Math.max(260, 16 * u), sh = sw * .62;      // подстанция и накопитель
    $('#g-ss').innerHTML = S.on.ss ? `<rect x="${SSX - sw / 2}" y="${SSY - sh / 2}" width="${sw}" height="${sh}" rx="${sw * .08}" fill="#fff" stroke="#16233b" stroke-width="${1.6 * u}"/><path d="M${SSX - sw * .3} ${SSY}h${sw * .6}M${SSX - sw * .15} ${SSY - sh * .25}v${sh * .5}M${SSX + sw * .15} ${SSY - sh * .25}v${sh * .5}" stroke="#16233b" stroke-width="${1.4 * u}" fill="none"/>
      <rect x="${SSX + sw * .7}" y="${SSY - sh / 2}" width="${sw * .8}" height="${sh}" rx="${sw * .08}" fill="#e3ecfd" stroke="#2563eb" stroke-width="${1.6 * u}"/>
      <text x="${SSX}" y="${SSY + sh / 2 + fs * 1.25}" font-size="${fs}" text-anchor="middle" fill="#16233b" font-weight="600">${u > 5.5 ? 'ПС' : 'ПС 220/35 кВ · ' + fmt(C.L.ss * 100) + ' %'}</text><text x="${SSX + sw * 1.1}" y="${SSY - sh / 2 - fs * .5}" font-size="${fs}" text-anchor="middle" fill="#2563eb" font-weight="600">${u > 5.5 ? 'СНЭ' : 'Накопитель · ' + fmt(C.L.bess * 100) + ' %'}</text>` : '';
    // ветроустановки: издалека — метка класса, вблизи — площадка, фундамент, башня, лопасти, кран
    const far = u > 5.5, r = 6 * u; let h = '';
    for (let i = 0; i < N; i++) { const b = C.st[i], on = S.sel === i, col = colOf(i); if (S.off.has(clsOf(i)) && !on) continue; const dim = !pass(i) && !on;
      h += `<g class="wtg" data-i="${i}" transform="translate(${X(i)} ${Z(i)})"${dim ? ' opacity=".18"' : ''}><circle r="${Math.max(70, 13 * u)}" fill="transparent"/>`;
      if (far) h += `<circle r="${on ? r * 1.4 : r}" fill="${col}" stroke="${on ? '#16233b' : '#fff'}" stroke-width="${(on ? 2.4 : 1.4) * u}"/>${b.erecting ? `<path d="M${-r * .2} ${r * .9}L${r * 1.5} ${-r * 1.7}" stroke="#16233b" stroke-width="${1.6 * u}" stroke-linecap="round"/>` : ''}${C.open.has(i) ? `<circle cx="${r * .95}" cy="${-r * .95}" r="${r * .42}" fill="#d1432f" stroke="#fff" stroke-width="${.8 * u}"/>` : ''}`;
      else { const d = C.det[i], c = 2 * Math.PI * 78;
        h += `<circle r="62" fill="${b.pad ? '#f1e3bf' : 'none'}" stroke="#c9b68a" stroke-width="${Math.max(2, 1.2 * u)}" ${b.pad ? '' : 'stroke-dasharray="14 10"'}/>`;
        if (b.found > 0) h += `<circle r="15" fill="${b.found >= 1 ? '#8f98a2' : '#cfc7b6'}" stroke="#5d6975" stroke-width="${Math.max(1.2, .8 * u)}" ${b.found >= 1 ? '' : 'stroke-dasharray="5 4"'}/>`;
        h += `<circle r="78" fill="none" stroke="#dfe3e8" stroke-width="${Math.max(4, 2 * u)}"/>`;
        if (d.pct > 0.005) h += `<circle r="78" fill="none" stroke="${col}" stroke-width="${Math.max(4, 2 * u)}" stroke-dasharray="${(c * d.pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90)" stroke-linecap="round"/>`;
        if (b.tower > 0) { for (let k = 0; k < b.blades; k++) { const a = (rot(i) + k * 120) * Math.PI / 180, bx = (Math.sin(a) * 58).toFixed(1), by = (-Math.cos(a) * 58).toFixed(1); h += `<path d="M0 0L${bx} ${by}" stroke="#16233b" stroke-width="9" stroke-linecap="round"/><path d="M0 0L${bx} ${by}" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/>`; }
          h += `<circle r="${b.nacelle ? 8 : 5.5}" fill="#fff" stroke="#16233b" stroke-width="2.4"/>`; }
        if (b.erecting) h += `<rect x="-52" y="26" width="20" height="16" rx="3" fill="#f2a516" stroke="#16233b" stroke-width="2"/><path d="M-42 30L6 -44" stroke="#f2a516" stroke-width="7" stroke-linecap="round"/><path d="M-42 30L6 -44" stroke="#16233b" stroke-width="1.6" stroke-dasharray="6 6"/>`;
        if (C.open.has(i)) h += `<circle cx="56" cy="-56" r="13" fill="#d1432f" stroke="#fff" stroke-width="3"/><text x="56" y="-50" font-size="17" text-anchor="middle" fill="#fff" font-weight="700" style="stroke:none">${C.open.get(i).length}</text>`;
        h += `<text y="${96 + fs}" font-size="${fs}" text-anchor="middle" fill="#16233b" font-weight="${on ? 700 : 500}">${name(i)}</text>`; }
      h += `</g>`; }
    $('#g-wtg').innerHTML = h;
    let c = ''; if (S.sel != null) { const i = S.sel, t = SETS[S.color].cls[clsOf(i)][1], w = (Math.max(name(i).length * 8, t.length * 6.3) + 24) * u, hh = 40 * u, x = X(i), y = Z(i) - (far ? 16 * u : 100) - hh;      // выноска выбранной ВЭУ
      c = `<g><rect x="${x - w / 2}" y="${y}" width="${w}" height="${hh}" rx="${6 * u}" fill="#fff" stroke="#16233b" stroke-width="${1.4 * u}"/><path d="M${x - 6 * u} ${y + hh}L${x} ${y + hh + 7 * u}L${x + 6 * u} ${y + hh}" fill="#fff" stroke="#16233b" stroke-width="${1.4 * u}"/><path d="M${x - 5 * u} ${y + hh - .8 * u}h${10 * u}" stroke="#fff" stroke-width="${2.4 * u}"/>
        <text x="${x}" y="${y + 16 * u}" font-size="${12.5 * u}" text-anchor="middle" font-weight="700" fill="#16233b">${name(i)}</text><text x="${x}" y="${y + 31 * u}" font-size="${11.5 * u}" text-anchor="middle" fill="#16233b">${esc(t)}</text></g>`; }
    $('#g-call').innerHTML = c; const n = shown(); $('#mapnote').textContent = n < N ? `Показано ${n} из ${N} ВЭУ` : ''; $('#mapnote').hidden = n >= N;
  }
  function zoomAt(f, px, py) { const cw = svg.clientWidth || 1, ch = svg.clientHeight || 1, mx = view.x + px / cw * view.w, my = view.y + py / ch * view.h, w = Math.max(250, Math.min((B.x1 - B.x0) * 1.6, view.w * f)), k = w / view.w;
    view.x = mx - (mx - view.x) * k; view.y = my - (my - view.y) * k; view.w = w; view.h *= k; redraw(); }
  function focus(i) { const cw = svg.clientWidth || 1, ch = svg.clientHeight || 1; view.w = Math.min(view.w, 800); view.h = view.w * ch / cw; view.x = X(i) - view.w / 2; view.y = Z(i) - view.h / 2; }
  svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  let drag = null;
  svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, t: e.target }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.hypot(dx, dy) < 4) return; drag.moved = true; svg.classList.add('drag'); const u = upp(); view.x = drag.vx - dx * u; view.y = drag.vy - dy * u; applyView(); });
  svg.addEventListener('pointerup', () => { if (!drag) return; svg.classList.remove('drag'); if (!drag.moved) { const g = drag.t.closest && drag.t.closest('.wtg'); select(g ? +g.dataset.i : null, false); } drag = null; });
  $('#z-in').onclick = () => zoomAt(1 / 1.5, svg.clientWidth / 2, svg.clientHeight / 2); $('#z-out').onclick = () => zoomAt(1.5, svg.clientWidth / 2, svg.clientHeight / 2); $('#z-fit').onclick = () => { fitAll(); redraw(); };
  $('#m-color').addEventListener('change', e => { S.color = e.target.value; S.off.clear(); S.tab = 'cls'; renderLeft(); redraw(); });
  addEventListener('resize', () => { if (S.view === 'map') { fitAspect(); redraw(); } });

  /* ---------- левая колонка: стадии, слои, фильтры ---------- */
  function renderLeft() { const L = C.L, set = SETS[S.color], cnt = set.cls.map(() => 0); for (let i = 0; i < N; i++) cnt[clsOf(i)]++; let body;
    if (S.tab === 'cls') body = `<p class="hint">${S.color === 'stage' ? 'Цвет метки — последний законченный шаг.' : S.color === 'ready' ? 'Цвет метки — что сейчас мешает начать монтаж или пустить ВЭУ.' : 'Цвет метки — насколько ВЭУ отстаёт от плана.'} Нажмите на строку, чтобы скрыть класс.</p>
      <div class="classes">${set.cls.map((c, k) => `<button data-cls="${k}" class="${S.off.has(k) ? 'off' : ''}" aria-pressed="${!S.off.has(k)}"><i style="background:${c[0]}"></i><span>${c[1]}</span><b>${cnt[k]}</b></button>`).join('')}</div>${S.off.size ? '<button class="btn small" data-cls="all">Показать все</button>' : ''}`;
    else if (S.tab === 'lay') { const row = (k, title, sum, p, extra) => `<div class="layer"><label>${k ? `<input type="checkbox" data-layer="${k}" ${S.on[k] ? 'checked' : ''}>` : '<span></span>'}<b>${title}</b><em>${sum}</em><span class="bar"><i style="width:${Math.round(p * 100)}%"></i></span></label>${extra || ''}</div>`;
      body = row('civil', 'Дороги и площадки', fmt((L.road / L.roadQty + L.pad.done / N) * 50) + ' %', (L.road / L.roadQty + L.pad.done / N) / 2, `<p>Дороги ${fmt(L.road)} из ${fmt(L.roadQty)} км, площадки ${L.pad.done} из ${N}</p>`) + row('', 'Фундаменты', `${L.found.done} из ${N}`, L.found.done / N) + row('', 'Монтаж ВЭУ', `${L.erect.done} из ${N}`, L.erect.done / N) +
        row('cable', 'Кабель 35 кВ', `${L.mv.done} из ${N}`, L.mv.done / N, `<p>Готово фидеров: ${L.feeders.filter(f => f.p >= 1).length} из ${L.feeders.length}</p>`) + row('ss', 'Подстанция и накопитель', fmt(L.ss * 100) + ' %', L.ss, `<p>ВЛ до ПС Жамбыл ${fmt(L.ohlJ * 100)} %, до ПС Кентау ${fmt(L.ohlK * 100)} %</p>`) + row('', 'Пуск ВЭУ', `${L.com.done} из ${N}`, L.com.done / N); }
    else body = `<div class="pad filters"><label class="fld">Фидер 35 кВ<select data-f="feeder"><option value="">Все фидеры</option>${Array.from({ length: W.NF }, (_, f) => `<option value="${f}" ${S.flt.feeder === String(f) ? 'selected' : ''}>Фидер ${f + 1}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" data-f="late" ${S.flt.late ? 'checked' : ''}>Только отстающие от плана</label><label class="chk"><input type="checkbox" data-f="qc" ${S.flt.qc ? 'checked' : ''}>Только с открытыми замечаниями</label><label class="chk"><input type="checkbox" data-f="now" ${S.flt.now ? 'checked' : ''}>Только где сейчас идут работы</label>
      ${S.flt.act ? `<p class="hint"><b>Из графика:</b> ВЭУ, где не закончено «${E.A[S.flt.act].name}».</p>` : ''}<p class="hint">Подходит ${shown()} из ${N} ВЭУ. Остальные на карте приглушены.</p><button class="btn small" data-f="reset">Сбросить фильтры</button></div>`;
    const rd = E.real, nf = (S.flt.feeder !== '') + S.flt.late + S.flt.qc + S.flt.now + !!S.flt.act;
    $('#left').innerHTML = `<div class="box"><div class="tabs" role="tablist">${[['cls', 'Стадии'], ['lay', 'Слои'], ['flt', 'Фильтры' + (nf ? ' · ' + nf : '')]].map(t => `<button role="tab" data-tab="${t[0]}" aria-selected="${S.tab === t[0]}">${t[1]}</button>`).join('')}</div>${body}</div>
      <div class="box src"><h2>Данные <span>${rd ? 'отчёт на ' + fd(rd.day) : 'сценарий'}</span></h2><div class="pad"><p>${rd ? `Факт по ${Object.keys(rd.wtg).length} ВЭУ из файла «${esc(rd.file || 'отчёт')}». После даты отчёта — прогноз.` : 'Ход работ сейчас условный. Загрузите таблицу с датами по ВЭУ, и экран покажет ваш факт.'}</p>
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
  function renderRight() { const M = C.M, i = S.sel; let h;
    if (i == null) { const lag = Math.round(S.D - M.es), q = [...C.queue.entries()].slice(0, 5);
      h = `<div class="box"><h2>Площадка <span>${fd(S.D)}</span></h2><div class="pad"><div class="kpis">
          <div class="kpi"><label>Готовность</label><b>${fmt(M.ev * 100, 1)}<small>%</small></b><span>план ${fmt(M.pv * 100, 1)} %</span></div>
          <div class="kpi ${M.spi < .95 ? 'bad' : 'ok'}"><label>Темп к плану</label><b>${fmt(M.spi, 2)}</b><span>${lag > 3 ? 'отставание ' + fmt(lag) + ' дн.' : lag < -3 ? 'опережение ' + fmt(-lag) + ' дн.' : 'по графику'}</span></div>
          <div class="kpi"><label>Смонтировано</label><b>${C.L.erect.done}<small>из ${N}</small></b><span>в монтаже ${C.L.erect.now.length}</span></div>
          <div class="kpi"><label>В сети</label><b>${fmt(M.mw)}<small>МВт</small></b><span>по вехам RFP ${fmt(M.mwPlan)}</span></div></div></div></div>
        <div class="box"><h2>Что держит монтаж и пуск</h2><div class="pad">${holdRows(true)}<p class="note">Нажмите на строку — карта покажет только эти ВЭУ.</p></div></div>
        <div class="box"><h2>Очередь на монтаж</h2><div class="pad">${q.length ? `<div class="queue">${q.map(([w, k]) => { const g = C.gt[w]; return `<button data-w="${w}"><b>${k}</b><span>${name(w)}<small>${g.state === 'ready' ? 'всё готово, ждёт кран' : E.GATE_STATE[g.state].toLowerCase()}</small></span><em>${fd(g.startDay)}</em></button>`; }).join('')}</div>` : '<p class="hint">Все ВЭУ уже в монтаже или смонтированы.</p>'}</div></div>`; }
    else { const b = C.st[i], d = C.det[i], g = C.gt[i], obs = C.open.get(i) || [], pct = Math.round(d.pct * 100), cls = SETS.stage.cls[SETS.stage.of(i)], fmem = W.feeders[W.feeder[i]].slice().sort((a, c) => W.fpos[c] - W.fpos[a]), place = fmem.indexOf(i) + 1, jr = JOURNAL.filter(x => x.i === i).slice(-4).reverse(), found = E.fact.found, pour = S.D >= found.e[i]; let body;
      if (S.rtab === 'steps') body = `<div class="check">${d.steps.map(x => { const late = Math.round(S.D - x.plan); return `<div class="${x.done ? 'done' : x === d.next ? 'cur' : ''}"><i></i><span>${x.name}</span><em>${x.done ? fd(x.day) : 'план ' + fd(x.plan)}</em>${!x.done && late > 0 ? `<small>просрочено на ${fmt(late)} дн.</small>` : ''}</div>`; }).join('')}</div>
        <dl class="facts"><dt>Следующая веха</dt><dd>${d.next ? d.next.name + ', ' + fd(d.next.day) : 'все работы закончены'}</dd></dl>`;
      else if (S.rtab === 'gates') body = `<p class="lead ${g.state === 'ready' ? 'warn' : g.state === 'parts' || g.state === 'waitGrid' || g.state === 'waitCable' ? 'bad' : ''}">${E.GATE_STATE[g.state]}${C.queue.has(i) ? '. В очереди на монтаж № ' + C.queue.get(i) : ''}</p>
        <h3>Чтобы начать монтаж</h3>${gateList(g.erect, g.holdErect)}<h3>Чтобы пустить ВЭУ</h3>${gateList(g.com, g.holdCom)}<p class="note">Держит то условие, которое выполнится последним. Срок набора прочности ${E.CURE} суток принят*.</p>`;
      else if (S.rtab === 'parts') { const ps = Object.fromEntries(d.parts.map(p => [p.k, p])), stt = p => p.mounted ? 'смонтировано' : p.here ? 'на площадке с ' + fd(p.day) : p.day != null ? 'в пути, ждём ' + fd(p.day) : 'нет данных';
        body = `<div class="tree"><div><b>Фундамент</b><em>${pour ? (g.erect[2].ok ? 'набрал прочность' : 'забетонирован ' + fd(found.e[i])) : b.found > 0 ? 'в работе' : 'не начат'}</em><small>плита Ø26 м, бетон 680,5 м³, арматура 81,8 т, 200 анкерных болтов</small></div>
          <div><b>Башня, 5 секций*</b><em>${stt(ps.tower)}</em><small>комплект ${ps.tower.sn.replace(' (5 шт)', '')}, высота оси 110 м</small></div><div><b>Гондола со ступицей</b><em>${stt(ps.nacelle)}</em><small>комплект ${ps.nacelle.sn}, SANY SI-19580, 7,15 МВт</small></div>
          <div><b>Лопасти, 3 шт</b><em>${b.blades ? b.blades + ' из 3 установлено' : stt(ps.blades)}</em><small>комплект ${ps.blades.sn}, ротор 195 м</small></div>
          <div><b>Кабель 35 кВ</b><em>${b.mv ? 'подключён' : 'не подключён'}</em><small>фидер ${W.feeder[i] + 1}, место ${place} из ${fmem.length} от подстанции, до подстанции ${fmt(W.route[i] / 1000, 1)} км</small></div></div>
          <p class="note">Размеры фундамента — по чертежу 104218-CI-DW-040. Номера комплектов условные${d.demo ? ', поставки — по сценарию' : ''}. * Число секций принято.</p>`; }
      else body = `${obs.length ? `<div class="obs">${obs.map(t => `<div class="${t.sev}"><b>${esc(t.text)}</b><small>${t.disc} · ${T_STATUS[t.status]} · ${t.age} дн.</small></div>`).join('')}</div>` : '<p class="hint">Открытых замечаний по этой ВЭУ нет.</p>'}
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
  function addPunch(i, text, disc, sev) { PUNCH.push({ id: 'u' + Date.now(), i, text, disc, sev, status: 'new', day: S.D }); save('jambyl-punch', PUNCH); }
  function movePunch(id, status) { const p = PUNCH.find(x => x.id === id); if (!p) return; if (status === 'delete') PUNCH = PUNCH.filter(x => x.id !== id); else p.status = status; save('jambyl-punch', PUNCH); update(); }

  /* ---------- общее: выбор, дата, разделы ---------- */
  function select(i, zoom) { S.sel = i; if (i != null && zoom) { if (S.view !== 'map') go('map'); focus(i); } renderLeft(); renderRight(); redraw(); }
  function render() { if (S.view === 'map') { renderLeft(); renderRight(); redraw(); } else if (UI.views[S.view]) UI.views[S.view](); }
  function update() { calc(); $('#d-range').value = S.D; $('#d-out').textContent = fd(S.D); $('#d-src').textContent = E.real ? 'отчёт на ' + fd(E.real.day) : 'сценарий'; $('#d-src').className = 'dsrc' + (E.real ? ' real' : '');
    const n = C.tasks.filter(t => t.status !== 'closed').length; $('#n-tasks').textContent = n || ''; $('#n-tasks').hidden = !n; render(); }
  function go(v) { S.view = v; for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== 'v-' + v; for (const b of document.querySelectorAll('#nav button')) b.setAttribute('aria-pressed', b.dataset.v === v); if (v === 'map') fitAspect(); render(); }
  $('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.v); });
  $('#d-range').max = E.MAXD; $('#d-range').addEventListener('input', e => { S.D = +e.target.value; update(); });
  $('#d-prev').onclick = () => { S.D = clampD(S.D - 7); update(); }; $('#d-next').onclick = () => { S.D = clampD(S.D + 7); update(); }; $('#d-today').onclick = () => { S.D = E.real ? clampD(E.real.day) : today; update(); };
  addEventListener('keydown', e => { if (e.key === 'Escape' && S.view === 'map') select(null, false); });
  const UI = window.EPCUI = { S, C, E, W, SITE, N, $, fmt, fd, fm, name, esc, SETS, READY, HOLD, T_STATUS, holdRows, select, update, go, toast, addPunch, movePunch, views: {}, today };
  const q = new URLSearchParams(location.hash.slice(1)); if (q.get('d')) S.D = clampD(+q.get('d'));
  UI.start = () => { calc(); fitAll(); update(); if (q.get('v') && UI.views[q.get('v')]) go(q.get('v')); if (q.get('wtg')) { const i = SITE.wtg.findIndex(w => w[0] === q.get('wtg')); if (i >= 0) select(i, true); } };
})();
