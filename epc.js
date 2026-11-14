/* Экран стройки ВЭС: слои проекта, план площадки сверху, состояние выбранной ВЭУ. Модель хода работ — epcw.js. */
(function () {
  const SITE = window.SITE, W = window.WIND, E = window.EPCW, IO = window.FACTIO, N = W.N;
  const $ = q => document.querySelector(q), fmt = (v, d = 0) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fd = d => E.dateOf(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(' г.', '');
  const fm = d => E.dateOf(d).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace(' г.', '').replace('.', '');
  const name = i => SITE.wtg[i][0], esc = s => String(s).replace(/[<>&"]/g, '');
  const STAGE = ['Не начато', 'Подъезд готов', 'Площадка готова', 'Фундамент готов', 'Идёт монтаж', 'Смонтирована', 'Подключена к сети', 'В работе'];
  const COL = ['#c3c8ce', '#b9925a', '#e3c27d', '#8f98a2', '#e8960f', '#4a7fd6', '#22a39a', '#23875a'];
  const J_KIND = { qa: 'Запрошена приёмка ОТК', report: 'Суточный отчёт', mob: 'Заявка на материалы и кран' };

  /* состояние экрана */
  const today = Math.round((Date.now() - E.DAY0) / 864e5);
  const S = { D: Math.max(0, Math.min(E.MAXD, today)), sel: null, on: { civil: true, found: true, cable: true, mech: true, ss: true } };
  let JOURNAL = []; try { JOURNAL = JSON.parse(localStorage.getItem('jambyl-journal') || '[]'); } catch (e) {}
  try { const saved = JSON.parse(localStorage.getItem('jambyl-fact') || 'null'); if (saved && saved.day != null) { E.loadFact(saved); S.D = Math.max(0, Math.min(E.MAXD, saved.day)); } } catch (e) {}
  let st = [], M = null;      // состояние каждой ВЭУ и показатели площадки на дату
  const calc = () => { st = []; for (let i = 0; i < N; i++) st.push(E.wtgState(i, S.D)); M = E.metrics(S.D); };

  /* ---------- план площадки ---------- */
  const svg = $('#map'), X = i => SITE.wtg[i][1], Z = i => SITE.wtg[i][2];
  const all = []; for (let i = 0; i < N; i++) all.push([X(i), Z(i)]); for (const a of [...SITE.roads, ...SITE.access]) for (let k = 0; k < a.length; k += 2) all.push([a[k], a[k + 1]]);
  const B = { x0: Math.min(...all.map(p => p[0])) - 500, x1: Math.max(...all.map(p => p[0])) + 500, y0: Math.min(...all.map(p => p[1])) - 500, y1: Math.max(...all.map(p => p[1])) + 500 };
  const view = { x: B.x0, y: B.y0, w: B.x1 - B.x0, h: B.y1 - B.y0 };
  const path = a => { let d = ''; for (let k = 0; k < a.length; k += 2) d += (k ? 'L' : 'M') + a[k] + ' ' + a[k + 1]; return d; };
  const roadD = SITE.roads.map(path).join(''), accessD = SITE.access.map(path).join(''), trenchD = Object.values(SITE.trench).flat().map(path).join('');
  const SSX = SITE.ss[0], SSY = SITE.ss[1], rot = i => (i * 47) % 120;
  let grid = ''; for (let x = Math.ceil(B.x0 / 1000) * 1000; x < B.x1; x += 1000) grid += `M${x} ${B.y0}V${B.y1}`; for (let y = Math.ceil(B.y0 / 1000) * 1000; y < B.y1; y += 1000) grid += `M${B.x0} ${y}H${B.x1}`;
  svg.innerHTML = `<path d="${grid}" fill="none" stroke="#d7ddd0" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <g id="g-civil" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${accessD}" stroke="#bfae86" class="rc" vector-effect="non-scaling-stroke"/><path d="${roadD}" stroke="#bfae86" class="rc" vector-effect="non-scaling-stroke"/><path d="${accessD}" stroke="#f3e7c8" class="rt" vector-effect="non-scaling-stroke"/><path d="${roadD}" stroke="#f3e7c8" class="rt" vector-effect="non-scaling-stroke"/></g>
    <path id="g-cable" d="${trenchD}" fill="none" stroke="#2f8f88" stroke-dasharray="5 4" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
    <g id="g-ss"></g><g id="g-wtg"></g><g id="g-call"></g>`;
  const upp = () => view.w / Math.max(1, svg.clientWidth);
  function fitAspect() { const cw = svg.clientWidth || 1, ch = svg.clientHeight || 1, cx = view.x + view.w / 2, cy = view.y + view.h / 2; view.h = view.w * ch / cw; view.x = cx - view.w / 2; view.y = cy - view.h / 2; }
  function fitAll() { const cw = svg.clientWidth || 1, ch = svg.clientHeight || 1, bw = B.x1 - B.x0, bh = B.y1 - B.y0, w = Math.max(bw, bh * cw / ch); view.w = w; view.h = w * ch / cw; view.x = (B.x0 + B.x1) / 2 - view.w / 2; view.y = (B.y0 + B.y1) / 2 - view.h / 2; }
  function applyView() { svg.setAttribute('viewBox', `${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`); }
  let raf = 0; const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawMap(); }); };
  function drawMap() {
    applyView(); const u = upp(), rw = Math.max(1.6, Math.min(16, 14 / u));
    svg.querySelectorAll('.rc').forEach(p => p.setAttribute('stroke-width', rw + 2.4)); svg.querySelectorAll('.rt').forEach(p => p.setAttribute('stroke-width', rw));
    $('#g-civil').style.display = S.on.civil ? '' : 'none'; $('#g-cable').style.display = S.on.cable ? '' : 'none';
    // подстанция и накопитель
    const sw = Math.max(260, 16 * u), sh = sw * .62, fs = 11.5 * u;
    $('#g-ss').innerHTML = S.on.ss ? `<rect x="${SSX - sw / 2}" y="${SSY - sh / 2}" width="${sw}" height="${sh}" rx="${sw * .08}" fill="#fff" stroke="#16202a" stroke-width="${1.6 * u}"/><path d="M${SSX - sw * .3} ${SSY}h${sw * .6}M${SSX - sw * .15} ${SSY - sh * .25}v${sh * .5}M${SSX + sw * .15} ${SSY - sh * .25}v${sh * .5}" stroke="#16202a" stroke-width="${1.4 * u}" fill="none"/>
      <rect x="${SSX + sw * .7}" y="${SSY - sh / 2}" width="${sw * .8}" height="${sh}" rx="${sw * .08}" fill="#d9eeeb" stroke="#0f5a55" stroke-width="${1.6 * u}"/>
      <text x="${SSX}" y="${SSY + sh / 2 + fs * 1.25}" font-size="${fs}" text-anchor="middle" fill="#16202a" font-weight="600">ПС 220/35 кВ · ${fmt(E.layers(S.D).ss * 100)} %</text><text x="${SSX + sw * 1.1}" y="${SSY - sh / 2 - fs * .5}" font-size="${fs}" text-anchor="middle" fill="#0f5a55" font-weight="600">Накопитель</text>` : '';
    // ветроустановки: издалека — метка стадии, вблизи — площадка, фундамент, башня, лопасти, кран
    const far = u > 5.5, r = 6 * u; let h = '';
    for (let i = 0; i < N; i++) { const b = st[i], x = X(i), y = Z(i), on = S.sel === i, vis = b.stage === 0 ? S.on.civil : b.stage <= 2 ? S.on.civil : b.stage === 3 ? S.on.found : S.on.mech; if (!vis && !on) continue;
      h += `<g class="wtg" data-i="${i}" transform="translate(${x} ${y})"><circle r="${Math.max(70, 13 * u)}" fill="transparent"/>`;
      if (far) h += `<circle r="${on ? r * 1.35 : r}" fill="${COL[b.stage]}" stroke="${on ? '#16202a' : '#fff'}" stroke-width="${(on ? 2.4 : 1.4) * u}"/>${b.erecting ? `<path d="M${-r * .2} ${r * .9}L${r * 1.5} ${-r * 1.7}" stroke="#16202a" stroke-width="${1.6 * u}" stroke-linecap="round"/>` : ''}`;
      else { const d = E.detail(i, S.D), c = 2 * Math.PI * 78, sw2 = Math.max(4, 2 * u);
        h += `<circle r="62" fill="${b.pad ? '#ecdcb6' : 'none'}" stroke="#bfae86" stroke-width="${Math.max(2, 1.2 * u)}" ${b.pad ? '' : 'stroke-dasharray="14 10"'}/>`;
        if (b.found > 0) h += `<circle r="15" fill="${b.found >= 1 ? '#8f98a2' : '#cfc7b6'}" stroke="#5d6975" stroke-width="${Math.max(1.2, .8 * u)}" ${b.found >= 1 ? '' : 'stroke-dasharray="5 4"'}/>`;
        if (d.pct > 0.005) h += `<circle r="78" fill="none" stroke="#0f5a55" stroke-width="${sw2}" stroke-dasharray="${(c * d.pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90)" stroke-linecap="round" opacity=".9"/>`;
        if (b.tower > 0) { for (let k = 0; k < b.blades; k++) { const a = (rot(i) + k * 120) * Math.PI / 180, bx = Math.sin(a) * 58, by = -Math.cos(a) * 58; h += `<path d="M0 0L${bx.toFixed(1)} ${by.toFixed(1)}" stroke="#16202a" stroke-width="9" stroke-linecap="round"/><path d="M0 0L${bx.toFixed(1)} ${by.toFixed(1)}" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/>`; }
          h += `<circle r="${b.nacelle ? 8 : 5.5}" fill="#fff" stroke="#16202a" stroke-width="2.4"/>`; }
        if (b.erecting) h += `<rect x="-52" y="26" width="20" height="16" rx="3" fill="#e8960f" stroke="#16202a" stroke-width="2"/><path d="M-42 30L6 -44" stroke="#e8960f" stroke-width="7" stroke-linecap="round"/><path d="M-42 30L6 -44" stroke="#16202a" stroke-width="1.6" stroke-dasharray="6 6"/>`;
        h += `<text y="${96 + fs}" font-size="${fs}" text-anchor="middle" fill="#16202a" font-weight="${on ? 700 : 500}">${name(i)}</text>`; }
      h += `</g>`; }
    $('#g-wtg').innerHTML = h;
    // выноска выбранной ВЭУ
    let c = ''; if (S.sel != null) { const i = S.sel, d = E.detail(i, S.D), t = d.stage, w = (Math.max(name(i).length * 8, t.length * 6.3) + 24) * u, hh = 40 * u, x = X(i), y = Z(i) - (far ? 16 * u : 100) - hh;
      c = `<g><rect x="${x - w / 2}" y="${y}" width="${w}" height="${hh}" rx="${6 * u}" fill="#d9eeeb" stroke="#0f5a55" stroke-width="${1.4 * u}"/><path d="M${x - 6 * u} ${y + hh}L${x} ${y + hh + 7 * u}L${x + 6 * u} ${y + hh}" fill="#d9eeeb" stroke="#0f5a55" stroke-width="${1.4 * u}"/><path d="M${x - 5 * u} ${y + hh - .8 * u}h${10 * u}" stroke="#d9eeeb" stroke-width="${2.4 * u}"/>
        <text x="${x}" y="${y + 16 * u}" font-size="${12.5 * u}" text-anchor="middle" font-weight="700" fill="#16202a">${name(i)}</text><text x="${x}" y="${y + 31 * u}" font-size="${11.5 * u}" text-anchor="middle" fill="#16202a">${esc(t)}</text></g>`; }
    $('#g-call').innerHTML = c;
  }
  function zoomAt(f, px, py) { const cw = svg.clientWidth || 1, ch = svg.clientHeight || 1, mx = view.x + px / cw * view.w, my = view.y + py / ch * view.h, w = Math.max(250, Math.min((B.x1 - B.x0) * 1.6, view.w * f)), k = w / view.w;
    view.x = mx - (mx - view.x) * k; view.y = my - (my - view.y) * k; view.w = w; view.h *= k; redraw(); }
  function focus(i) { const cw = svg.clientWidth || 1, ch = svg.clientHeight || 1; view.w = Math.min(view.w, 800); view.h = view.w * ch / cw; view.x = X(i) - view.w / 2; view.y = Z(i) - view.h / 2; }
  svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  let drag = null;
  svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, t: e.target }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.hypot(dx, dy) < 4) return; drag.moved = true; svg.classList.add('drag'); const u = upp(); view.x = drag.vx - dx * u; view.y = drag.vy - dy * u; applyView(); });
  svg.addEventListener('pointerup', e => { if (!drag) return; svg.classList.remove('drag'); if (!drag.moved) { const g = drag.t.closest && drag.t.closest('.wtg'); select(g ? +g.dataset.i : null, false); } drag = null; });
  $('#z-in').onclick = () => zoomAt(1 / 1.5, svg.clientWidth / 2, svg.clientHeight / 2); $('#z-out').onclick = () => zoomAt(1.5, svg.clientWidth / 2, svg.clientHeight / 2); $('#z-fit').onclick = () => { fitAll(); redraw(); };
  addEventListener('resize', () => { fitAspect(); redraw(); });

  /* ---------- слои проекта ---------- */
  function renderLeft() { const L = E.layers(S.D), short = t => t.replace('В работе: ', '');
    const items = a => a.length ? `<div class="items">${a.slice(0, 6).map(i => `<button data-w="${i}" class="${S.sel === i ? 'on' : ''}">${name(i)}<small>${esc(short(E.detail(i, S.D).stage))}</small></button>`).join('')}${a.length > 6 ? `<span>и ещё ${a.length - 6}</span>` : ''}</div>` : '';
    const layer = (k, title, sum, p, body) => `<div class="layer"><label><input type="checkbox" data-layer="${k}" ${S.on[k] ? 'checked' : ''}><b>${title}</b><em>${sum}</em><span class="bar"><i style="width:${Math.round(p * 100)}%"></i></span></label>${body}</div>`;
    const fNow = L.feeders.filter(f => f.p > 0 && f.p < 1).sort((a, b) => b.p - a.p), rd = E.real;
    $('#left').innerHTML = `<div class="box"><h2>Слои проекта</h2>` +
      layer('civil', 'Земляные работы', fmt((L.road / L.roadQty + L.pad.done / N) * 50) + ' %', (L.road / L.roadQty + L.pad.done / N) / 2, `<p>Дороги: ${fmt(L.road)} из ${fmt(L.roadQty)} км</p><p>Площадки: ${L.pad.done} из ${N}</p>`) +
      layer('found', 'Фундаменты', `${L.found.done} из ${N}`, L.found.done / N, items(L.found.now)) +
      layer('cable', 'Кабельная сеть 35 кВ', `${L.mv.done} из ${N}`, L.mv.done / N, fNow.slice(0, 3).map(f => `<p>Фидер ${f.f + 1}: подключено ${fmt(f.p * 100)} %</p>`).join('') + `<p>Готово фидеров: ${L.feeders.filter(f => f.p >= 1).length} из ${L.feeders.length}</p>`) +
      layer('mech', 'Монтаж ВЭУ', `${L.erect.done} из ${N}`, L.erect.done / N, items(L.erect.now)) +
      layer('ss', 'Подстанция и линии', fmt(L.ss * 100) + ' %', L.ss, `<p>ВЛ до ПС Жамбыл: ${fmt(L.ohlJ * 100)} %</p><p>ВЛ до ПС Кентау: ${fmt(L.ohlK * 100)} %</p><p>Накопитель: ${fmt(L.bess * 100)} %</p>`) + `</div>
      <div class="box src"><h2>Данные <span>${rd ? 'отчёт на ' + fd(rd.day) : 'сценарий'}</span></h2><div class="pad"><p>${rd ? `Факт по ${Object.keys(rd.wtg).length} ВЭУ из файла «${esc(rd.file || 'отчёт')}». После даты отчёта — прогноз.` : 'Ход работ сейчас условный. Загрузите таблицу с датами по ВЭУ, и экран покажет ваш факт.'}</p>
        <div class="btns"><button class="btn main" data-src="load">Загрузить отчёт</button><button class="btn" data-src="tpl">Шаблон</button>${rd ? '<button class="btn" data-src="demo">Убрать отчёт</button>' : ''}</div></div></div>`; }
  $('#left').addEventListener('change', e => { const k = e.target.dataset.layer; if (k) { S.on[k] = e.target.checked; redraw(); } });
  $('#left').addEventListener('click', e => { const w = e.target.closest('[data-w]'), s = e.target.closest('[data-src]');
    if (w) return select(+w.dataset.w, true); if (!s) return; const k = s.dataset.src;
    if (k === 'load') $('#file').click(); else if (k === 'demo') { E.loadFact(null); try { localStorage.removeItem('jambyl-fact'); } catch (err) {} update(); }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([IO.template()], { type: 'text/csv;charset=utf-8' })); a.download = 'Жамбыл_факт_стройки_шаблон.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } });
  $('#file').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return;
    try { const real = await IO.fromFile(f); E.loadFact(real); try { localStorage.setItem('jambyl-fact', JSON.stringify(real)); } catch (err) {} S.D = Math.max(0, Math.min(E.MAXD, real.day)); update(); toast('Отчёт загружен: ' + Object.keys(real.wtg).length + ' ВЭУ'); }
    catch (err) { toast('Отчёт не загружен: ' + err.message); } e.target.value = ''; });
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 5000); }

  /* ---------- состояние: площадка или выбранная ВЭУ ---------- */
  const IC = { tower: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M8 2h4l1.5 16h-7z"/></svg>', nacelle: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="2" y="7" width="13" height="6" rx="3"/><path d="M15 10h3"/></svg>', blades: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 17C6 9 11 4 17 3c-1 6-6 11-14 14z"/></svg>', crane: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="M6 18V4l10 3H6M3 18h8M14 7v4"/></svg>' };
  function curve() { const Wd = 320, Hd = 132, px = d => (d / E.MAXD * (Wd - 34) + 30).toFixed(1), py = v => (Hd - 20 - v * (Hd - 30)).toFixed(1), line = (a, from, to) => { let s = ''; for (let d = from; d <= to; d += 5) s += (s ? 'L' : 'M') + px(d) + ' ' + py(a[d]); return s; };
    let ax = ''; for (const d of [0, 250, 500, 750, 1000]) ax += `<text x="${px(d)}" y="${Hd - 5}" font-size="10" text-anchor="${d ? d === 1000 ? 'end' : 'middle' : 'start'}" fill="#8b96a1">${fm(d)}</text>`;
    for (const v of [0, .5, 1]) ax += `<text x="24" y="${+py(v) + 3}" font-size="10" text-anchor="end" fill="#8b96a1">${v * 100}</text><path d="M30 ${py(v)}H${Wd - 4}" stroke="#e3e6ea"/>`;
    return `<div class="cap"><span><i style="background:#9aa3ad"></i>план</span><span><i style="background:#0f5a55"></i>факт и прогноз</span></div><svg viewBox="0 0 ${Wd} ${Hd}">${ax}<path d="${line(E.curvePlan, 0, E.MAXD)}" fill="none" stroke="#9aa3ad" stroke-width="1.6"/><path d="${line(E.curveFact, 0, Math.floor(S.D / 5) * 5)}" fill="none" stroke="#0f5a55" stroke-width="2.2"/><path d="${line(E.curveFact, Math.floor(S.D / 5) * 5, E.MAXD)}" fill="none" stroke="#0f5a55" stroke-width="1.6" stroke-dasharray="4 4"/><path d="M${px(S.D)} 6V${Hd - 20}" stroke="#16202a" stroke-width="1"/><circle cx="${px(S.D)}" cy="${py(M.ev)}" r="3.5" fill="#0f5a55" stroke="#fff" stroke-width="1.5"/></svg>`; }
  function renderRight() { const lag = Math.round(S.D - M.es), spiC = M.spi < .95 ? 'bad' : M.spi > 1.02 ? '' : '', i = S.sel; let top;
    if (i == null) { const done = M.ev >= .9995;
      top = `<div class="box"><h2>Площадка на дату <span>${fd(S.D)}</span></h2><div class="pad"><div class="kpis">
        <div class="kpi"><label>Готовность</label><b>${fmt(M.ev * 100, 1)}<small>%</small></b><span>план ${fmt(M.pv * 100, 1)} %</span></div>
        <div class="kpi ${M.spi < .95 ? 'bad' : 'ok'}"><label>Темп к плану</label><b>${fmt(M.spi, 2)}</b><span>${lag > 3 ? 'отставание ' + fmt(lag) + ' дн.' : lag < -3 ? 'опережение ' + fmt(-lag) + ' дн.' : 'по графику'}</span></div>
        <div class="kpi"><label>В сети</label><b>${fmt(M.mw)}<small>МВт</small></b><span>по вехам RFP ${fmt(M.mwPlan)}</span></div>
        <div class="kpi"><label>1000 МВт</label><b style="font-size:16px;letter-spacing:0">${fd(done ? E.factEnd : M.forecast)}</b><span>по RFP ${fd(E.PD)}</span></div></div>
        <p class="note">Нажмите на ветроустановку на плане или в слоях слева, чтобы увидеть её состояние.</p></div></div>`; }
    else { const b = st[i], d = E.detail(i, S.D), obs = M.open.filter(q => q.i === i), pct = Math.round(d.pct * 100);
      top = `<div class="box"><h2>Состояние ВЭУ <span>${fd(S.D)}</span></h2><div class="pad"><button class="x" data-x aria-label="Закрыть">×</button>
        <div class="who"><b>${name(i)}</b><span>фидер ${W.feeder[i] + 1}</span></div><span class="status ${b.late > 14 ? 'bad' : b.late > 0 ? 'warn' : ''}">${b.late > 0 ? 'отстаёт на ' + fmt(b.late) + ' дн.' : 'по графику'}</span>
        <div class="check">${d.steps.map(x => { const late = Math.round((x.done ? x.day : S.D) - x.plan); return `<div class="${x.done ? 'done' : x === d.next ? 'cur' : ''}"><i></i><span>${x.name}</span><em>${x.done ? fd(x.day) : 'план ' + fd(x.plan)}</em>${!x.done && S.D > x.plan && late > 0 ? `<small>просрочено на ${fmt(late)} дн.</small>` : ''}</div>`; }).join('')}</div>
        <dl class="facts"><dt>Стадия</dt><dd>${esc(d.stage)}</dd><dt>Следующая веха</dt><dd>${d.next ? d.next.name + ', ' + fd(d.next.day) : 'все работы закончены'}</dd><dt>ОТК</dt><dd>${obs.length ? obs.map(q => esc(q.text)).join('; ') : 'открытых замечаний нет'}</dd></dl>
        <div class="prog"><i style="width:${pct}%"></i><b>${pct} %</b></div>
        <div class="chips"><span class="chip ${d.spi < .95 ? 'bad' : ''}">Темп к плану ${fmt(d.spi, 2)}</span><span class="chip off">План ${fmt(d.planPct * 100)} %</span><span class="chip off" title="Данных о фактических затратах нет">Затраты: нет данных</span></div></div></div>`; }
    const mid = `<div class="box curve"><h2>Ход работ: план и факт</h2><div class="pad">${curve()}<div class="chips" style="margin-top:8px"><span class="chip ${M.spi < .95 ? 'bad' : ''}">Темп к плану ${fmt(M.spi, 2)}</span><span class="chip off">${lag > 3 ? 'Отставание ' + fmt(lag) + ' дн.' : lag < -3 ? 'Опережение ' + fmt(-lag) + ' дн.' : 'По графику'}</span></div></div></div>`;
    let bot;
    if (i == null) bot = `<div class="box"><h2>Поставки и кран</h2><div class="pad"><div class="mat">${M.parts.map(p => `<div>${IC[p.k]}<span><b>${p.name}</b><small>на площадке ${p.n} из ${N}</small></span></div>`).join('')}<div>${IC.crane}<span><b>Краны</b><small>${M.cranes.length ? 'в монтаже ' + M.cranes.length + ' ВЭУ: ' + M.cranes.slice(0, 4).map(name).join(', ') : 'монтаж сейчас не идёт'}</small></span></div></div>${E.real ? '' : '<p class="note">Поставки — по сценарию.</p>'}</div></div>`;
    else { const d = E.detail(i, S.D), jr = JOURNAL.filter(x => x.i === i).slice(-3).reverse();
      bot = `<div class="box"><h2>Материалы и кран</h2><div class="pad"><div class="mat">${d.parts.map(p => `<div>${IC[p.k]}<span><b>${p.name} (${p.sn})</b><small>${p.mounted ? 'смонтировано' : p.here ? 'на площадке' : p.day != null ? 'в пути, ждём ' + fd(p.day) : 'нет данных'}</small></span></div>`).join('')}<div>${IC.crane}<span><b>Кран и бригада</b><small>${d.crane}${d.craneDay != null ? fd(d.craneDay) : ''}</small></span></div></div><p class="note">Номера комплектов условные${d.demo ? ', поставки — по сценарию' : ''}.</p></div></div>
        <div class="box"><h2>Действия</h2><div class="pad"><input class="jnote" id="j-note" placeholder="Заметка к записи" maxlength="140" autocomplete="off"><div class="btns"><button class="btn main" data-j="qa">Приёмка ОТК</button><button class="btn" data-j="report">Суточный отчёт</button><button class="btn" data-j="mob">Заявка на материалы</button></div>
        ${jr.length ? `<div class="jr">${jr.map(x => `<div>${J_KIND[x.kind]}${x.note ? ': ' + esc(x.note) : ''}<small>${fd(x.day)} · ${esc(x.stage)}, готовность ${x.pct} %</small></div>`).join('')}</div>` : '<p class="note">Записей по этой ВЭУ пока нет. Журнал хранится в этом браузере.</p>'}</div></div>`; }
    $('#right').innerHTML = top + mid + bot; }
  $('#right').addEventListener('click', e => { if (e.target.closest('[data-x]')) return select(null, false); const b = e.target.closest('[data-j]'); if (!b || S.sel == null) return; const d = E.detail(S.sel, S.D), n = $('#j-note');
    JOURNAL.push({ i: S.sel, day: S.D, kind: b.dataset.j, note: n ? n.value.trim() : '', stage: d.stage, pct: Math.round(d.pct * 100), at: Date.now() }); try { localStorage.setItem('jambyl-journal', JSON.stringify(JOURNAL.slice(-500))); } catch (err) {} renderRight(); toast('Записано в журнал ' + name(S.sel)); });

  /* ---------- общее ---------- */
  function select(i, zoom) { S.sel = i; if (i != null && zoom) focus(i); renderLeft(); renderRight(); redraw(); }
  function update() { calc(); $('#d-range').value = S.D; $('#d-out').textContent = fd(S.D); $('#map-date').textContent = fd(S.D); renderLeft(); renderRight(); redraw(); }
  $('#d-range').max = E.MAXD; $('#d-range').addEventListener('input', e => { S.D = +e.target.value; update(); });
  $('#d-prev').onclick = () => { S.D = Math.max(0, S.D - 7); update(); }; $('#d-next').onclick = () => { S.D = Math.min(E.MAXD, S.D + 7); update(); };
  addEventListener('keydown', e => { if (e.key === 'Escape') select(null, false); });
  $('#legend').innerHTML = STAGE.map((s, k) => `<span><i style="background:${COL[k]}"></i>${s}</span>`).join('');
  const q = new URLSearchParams(location.hash.slice(1)); if (q.get('d')) S.D = Math.max(0, Math.min(E.MAXD, +q.get('d')));
  calc(); fitAll(); update(); if (q.get('wtg')) { const i = SITE.wtg.findIndex(w => w[0] === q.get('wtg')); if (i >= 0) select(i, true); }
  window.EPCUI = { S, select, update, view, redraw };
})();
