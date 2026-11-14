/* Стройка и экономика ветропарка. План привязан к вехам RFP (NTP — июль 2026, 500 МВт — NTP+18, 1000 МВт — NTP+23, приёмка — NTP+32),
   объёмы — из ведомости BOP. Фактический ход работ — демонстрационный сценарий: данных со стройплощадки нет. */
(function () {
  const SITE = window.SITE, W = window.WIND, N = W.N;
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const DAY0 = Date.UTC(2026, 6, 1), PD = 700, PAC = 975, MAXD = 1000, dateOf = d => new Date(DAY0 + d * 864e5);
  const MILESTONES = [[548, 500, 'NTP+18'], [579, 600, 'NTP+19'], [610, 700, 'NTP+20'], [638, 800, 'NTP+21'], [669, 900, 'NTP+22'], [700, 1000, 'NTP+23']];
  const WINTER = [[167, 242], [532, 607]];
  const ACT = [
    { id: 'road', name: 'Дороги', unit: 'км', qty: 161, s: 0, e: 330, w: 12, f: 0.93, per: 1 },
    { id: 'pad', name: 'Монтажные площадки', unit: 'шт', qty: N, s: 40, e: 400, w: 8, f: 0.95, per: 1, pre: 'road', lag: 5 },
    { id: 'found', name: 'Фундаменты', unit: 'шт', qty: N, s: 70, e: 450, w: 16, f: 1.12, per: 1, pre: 'pad', lag: 5, stop: WINTER },
    { id: 'erect', name: 'Монтаж ВЭУ', unit: 'шт', qty: N, s: 290, e: 640, w: 22, f: 0.97, per: 1, pre: 'found', lag: 30, stop: [[395, 402], [430, 456], [470, 477], [556, 563]] },
    { id: 'mv', name: 'Кабель 35 кВ', unit: 'км', qty: 917, s: 180, e: 640, w: 9, f: 0.96, per: 1, pre: 'pad', lag: 10 },
    { id: 'ss', name: 'Подстанция 220/35 кВ', unit: '%', qty: 100, s: 120, e: 520, w: 12, f: 0.95 },
    { id: 'ohlJ', name: 'ВЛ 220 кВ до ПС Жамбыл', unit: 'км', qty: 284, s: 150, e: 530, w: 9, f: 0.92 },
    { id: 'ohlK', name: 'ВЛ 220 кВ до ПС Кентау', unit: 'км', qty: 162, s: 320, e: 690, w: 5, f: 0.96 },
    { id: 'bess', name: 'Накопитель 600 МВт·ч', unit: 'МВт·ч', qty: 600, s: 380, e: 640, w: 4, f: 0.97 },
    { id: 'com', name: 'Пуск ВЭУ', unit: 'шт', qty: N, s: 405, e: 700, w: 3, f: 1, per: 1, pre: 'erect', lag: 12 },
  ];
  const A = Object.fromEntries(ACT.map(a => [a.id, a])), WSUM = ACT.reduce((s, a) => s + a.w, 0);
  const ord = Array.from({ length: N }, (_, i) => i).sort((a, b) => W.route[a] - W.route[b]);   // фронт идёт от подстанции к дальним ВЭУ
  const skip = (t0, t1, stops) => { if (stops) for (const [a, b] of stops) if (t1 > a && t0 < b) t1 += b - Math.max(a, t0); return t1; };
  let REAL = null;      // данные с площадки: { day, wtg: { i: { road: [начало, конец], ..., tower, nacelle, blades } }, area: { ss: доля } }
  const lin = (a, d, f) => { const p0 = f && REAL ? REAL.area[a.id] : null;
    if (p0 != null) return d <= REAL.day ? p0 * Math.max(0, Math.min(1, (d - a.s) / Math.max(1, REAL.day - a.s))) : Math.min(1, p0 + (d - REAL.day) / (a.e - a.s));
    return Math.max(0, Math.min(1, (d - a.s - (f ? 6 : 0)) / ((a.e - a.s) / (f ? a.f : 1)))); };
  const areaEnd = id => REAL && REAL.area[id] != null ? REAL.day + (1 - REAL.area[id]) * (A[id].e - A[id].s) : A[id].s + 6 + (A[id].e - A[id].s) / A[id].f;
  const plan = {}, fact = {};
  for (const a of ACT) {
    if (!a.per) continue;
    const dur = (a.e - a.s) / N, ps = new Float32Array(N), pe = new Float32Array(N);
    ord.forEach((el, j) => { ps[el] = a.s + j * dur; pe[el] = a.s + (j + 1) * dur; });
    plan[a.id] = { s: ps, e: pe }; fact[a.id] = { s: new Float32Array(N), e: new Float32Array(N) };
  }
  /* факт: без данных с площадки — демонстрационный сценарий; с данными — внесённые даты, а остаток досчитывается плановым темпом от даты отчёта */
  function buildFact() {
    for (const a of ACT) { if (!a.per) continue;
      const dur = (a.e - a.s) / N, fs = fact[a.id].s, fe = fact[a.id].e, stops = REAL ? (a.id === 'found' ? WINTER : null) : a.stop; let t = REAL ? Math.max(a.s + 3, REAL.day) : a.s + 3;
      ord.forEach(el => { const r = REAL && REAL.wtg[el] && REAL.wtg[el][a.id];
        if (r && r[1] != null) { fe[el] = r[1]; fs[el] = r[0] != null && r[0] < r[1] ? r[0] : r[1] - Math.max(1, dur / a.f); return; }
        if (r && r[0] != null) { fs[el] = r[0]; fe[el] = Math.max(REAL.day + 1, skip(r[0], r[0] + dur / a.f, stops)); return; }
        let st = t; if (a.pre) st = Math.max(st, fact[a.pre].e[el] + a.lag);
        if (a.id === 'com') st = Math.max(st, areaEnd('ss') + 4, areaEnd('ohlJ') + 2, fact.mv.e[el] + 3);
        if (stops) for (const [x, y] of stops) if (st >= x && st < y) st = y;
        const en = skip(st, st + dur / a.f, stops); fs[el] = st; fe[el] = en; t = a.id === 'com' ? Math.max(t, st + dur * 0.55) : en; }); }
  }
  buildFact();
  function qty(id, d, isFact) {
    const a = A[id]; if (!a.per) return a.qty * lin(a, d, isFact);
    const src = isFact ? fact[id] : plan[id]; let q = 0;
    for (let i = 0; i < N; i++) q += d >= src.e[i] ? 1 : d <= src.s[i] ? 0 : (d - src.s[i]) / (src.e[i] - src.s[i]);
    return q * a.qty / N;
  }
  const pct = (d, f) => ACT.reduce((s, a) => s + a.w * qty(a.id, d, f) / a.qty, 0) / WSUM;
  const curvePlan = [], curveFact = [], mwPlan = [], mwFact = [];
  const online = (d, f) => { let n = 0; const src = (f ? fact : plan).com.e; for (let i = 0; i < N; i++) if (d >= src[i]) n++; return n * W.T.rated / 1000; };
  for (let d = 0; d <= MAXD; d++) { curvePlan.push(pct(d, false)); mwPlan.push(online(d, false)); }
  let factEnd = 0;
  function recalc() { curveFact.length = 0; mwFact.length = 0; for (let d = 0; d <= MAXD; d++) { curveFact.push(pct(d, true)); mwFact.push(online(d, true)); } factEnd = curveFact.findIndex(v => v > 0.9995); if (factEnd < 0) factEnd = MAXD; }
  recalc();
  function wtgState(i, d) {
    const fr = id => { const s = fact[id].s[i], e = fact[id].e[i]; return d >= e ? 1 : d <= s ? 0 : (d - s) / (e - s); };
    const er = fr('erect'), st = { road: fr('road') >= 1, pad: fr('pad') >= 1, found: fr('found'), tower: Math.min(1, er / 0.6), nacelle: er > 0.7, blades: er >= 1 ? 3 : er > 0.9 ? 2 : er > 0.8 ? 1 : 0, erecting: er > 0 && er < 1, mv: fr('mv') >= 1, com: d >= fact.com.e[i] };
    st.stage = st.com ? 7 : st.mv && er >= 1 ? 6 : er >= 1 ? 5 : er > 0 ? 4 : st.found >= 1 ? 3 : st.pad ? 2 : st.road ? 1 : 0; st.pouring = st.found > 0 && st.found < 1;
    let late = 0; for (const id of ['road', 'pad', 'found', 'erect', 'mv', 'com']) if (d > plan[id].e[i] && d < fact[id].e[i]) late = Math.max(late, d - plan[id].e[i]);
    st.late = late; st.due = d > plan.road.s[i]; return st;
  }
  const STEPS = ['road', 'pad', 'found', 'erect', 'mv', 'com'];
  const steps = i => STEPS.map(id => ({ id, name: A[id].name, plan: plan[id].e[i], fact: fact[id].e[i], start: fact[id].s[i] }));
  /* поставки комплектов ВЭУ: 8 комплектов каждые 18 дней; в сценарии задержка лопастей в пути */
  const deliveries = []; { let got = 0, d = 250; while (got < N) { if (!(d >= 404 && d < 452)) { const q = Math.min(8, N - got); deliveries.push([d, q]); got += q; } d += 18; } }
  const setDay = new Float32Array(N); { let j = 0; for (const [day, q] of deliveries) for (let k = 0; k < q; k++) setDay[ord[j++]] = day; }
  const PARTS = [['tower', 'Секции башни'], ['nacelle', 'Гондола и ступица'], ['blades', 'Лопасти']];
  // когда компоненты ВЭУ пришли на площадку: из отчёта, а без него — по сценарию поставок
  function comp(i) { if (!REAL) return { tower: setDay[i], nacelle: setDay[i], blades: setDay[i], demo: true };
    const r = REAL.wtg[i] || {}, done = r.erect && r.erect[1] != null ? r.erect[1] : null, g = k => r[k] != null ? r[k] : done; return { tower: g('tower'), nacelle: g('nacelle'), blades: g('blades'), demo: false }; }
  const delivered = d => { if (!REAL) return deliveries.reduce((s, [day, q]) => s + (day <= d ? q : 0), 0);
    let n = 0; for (let i = 0; i < N; i++) { const c = comp(i); if (c.tower != null && c.nacelle != null && c.blades != null && Math.max(c.tower, c.nacelle, c.blades) <= d) n++; } return n; };
  const partsOnSite = d => PARTS.map(([k, name]) => { let n = 0; for (let i = 0; i < N; i++) { const v = comp(i)[k]; if (v != null && v <= d) n++; } return { k, name, n }; });
  const R = rng(140), QCT = { pad: ['Основание площадки недоуплотнено'], found: ['Анкерная корзина отклонена от оси', 'Трещины в бетоне после распалубки', 'Нет протокола прочности бетона'], erect: ['Не подтверждён момент затяжки фланца', 'Повреждена кромка лопасти при разгрузке'], mv: ['Не испытана оболочка кабеля', 'Муфта без маркировки'] }, qc = [];
  for (let k = 0; k < 70; k++) { const id = ['pad', 'found', 'found', 'erect', 'erect', 'mv'][Math.floor(R() * 6)], i = Math.floor(R() * N), l = QCT[id], text = l[Math.floor(R() * l.length)], found = fact[id].e[i] + R() * 6; qc.push({ n: k + 1, i, id, text, found, closed: found + 4 + R() * 30 + (R() < .12 ? 90 : 0), sev: /Трещины|кромка|корзина/.test(text) ? 'bad' : 'warn' }); }
  qc.sort((a, b) => a.found - b.found);
  const STOPWHY = { 395: 'Ветер сильнее 10 м/с: кран не работает', 430: 'Лопасти задержались в пути: нет комплектов', 470: 'Ветер сильнее 10 м/с: кран не работает', 556: 'Метель и ветер: кран не работает' };
  function metrics(d) {
    const D = Math.min(MAXD, Math.round(d)), pv = curvePlan[D], ev = curveFact[D]; let es = 0; while (es < MAXD && curvePlan[es + 1] <= ev) es++;
    if (es < MAXD && curvePlan[es + 1] > curvePlan[es]) es += (ev - curvePlan[es]) / (curvePlan[es + 1] - curvePlan[es]);
    const spiT = d > 10 ? es / d : 1, forecast = ev >= 0.9995 ? factEnd : PD / Math.max(spiT, .3);
    const acts = ACT.map(a => { const p = qty(a.id, d, false), f = qty(a.id, d, true), rate = (f - qty(a.id, d - 14, true)) / 14, left = a.qty - f; return { id: a.id, name: a.name, unit: a.unit, qty: a.qty, plan: p, fact: f, rate, need: left > 0.01 * a.qty ? left / Math.max(1, a.e - d) : 0, over: left > 0.01 * a.qty && d > a.e, done: left <= 0.005 * a.qty, started: f > 0 }; });
    const erected = Math.round(qty('erect', d, true) + 0.49), del = delivered(d), stopped = REAL ? null : A.erect.stop.find(([a, b]) => d >= a && d < b), winter = WINTER.find(([a, b]) => d >= a && d < b);
    const mw = mwFact[D], ms = MILESTONES.map(m => ({ day: m[0], mw: m[1], tag: m[2], fact: mwFact.findIndex(v => v >= m[1] - 4) }));
    return { d, pv, ev, spi: pv > 0.002 ? ev / pv : 1, es, forecast, delay: forecast - PD, acts, del, erected, stock: Math.max(0, del - erected), stopped, stopWhy: stopped ? STOPWHY[stopped[0]] : null, winter,
      mw, mwPlan: mwPlan[D], ms, open: REAL ? [] : qc.filter(q => q.found <= d && q.closed > d), real: REAL ? REAL.day : null, parts: partsOnSite(d), cranes: (() => { const c = []; for (let i = 0; i < N; i++) if (d >= fact.erect.s[i] && d < fact.erect.e[i]) c.push(i); return c; })() };
  }

  /* ведомость объёмов BOP (JAMBYL Project BOP BOQ.xlsx) */
  const BOQ = [
    ['Дороги ветропарка', 160.96, 'км'], ['Выемка под дороги', 220.7, 'тыс. м³'], ['Насыпь дорог', 397.3, 'тыс. м³'], ['Основание дорог', 190.7, 'тыс. м³'],
    ['Монтажные площадки', 140, 'шт'], ['Выемка под площадки', 423.7, 'тыс. м³'], ['Насыпь площадок', 762.7, 'тыс. м³'],
    ['Фундаменты ВЭУ', 140, 'шт'], ['Бетон C35/45', 93.58, 'тыс. м³'], ['Бетон C50/60 и C40/50', 6.47, 'тыс. м³'], ['Арматура', 11.8, 'тыс. т'], ['Котлованы', 224, 'тыс. м³'],
    ['Водоотводные канавы', 320, 'км'], ['Кабельные траншеи', 306.0, 'км'], ['Кабель 300 мм²', 366.7, 'км'], ['Кабель 400 мм²', 275.0, 'км'], ['Кабель 500 мм²', 183.4, 'км'], ['Кабель 800 мм²', 91.7, 'км'],
    ['Заземляющий проводник', 191.8, 'км'], ['Оптический кабель', 573, 'км'], ['ВЛ 220 кВ (три двухцепные линии)', 446, 'км'], ['Трансформаторы 264/330 МВА', 6, 'шт'], ['Ячейки ОРУ 220 кВ', 14, 'шт'], ['Панели 35 кВ', 130, 'шт'], ['Установки компенсации, 800 МВАр', 20, 'шт'], ['Подстанция: поставка и наладка', 168.6, 'млн $'], ['Батарейные контейнеры СНЭ', 141, 'шт'], ['Преобразовательные станции СНЭ', 71, 'шт'],
  ];
  const ECON = { capex: 1400, tariff: 4.49, opex: 2.0, rate: 8, years: 25, avail: 97 };
  function finance(p, aepGwh) {
    p = Object.assign({}, ECON, p); const r = p.rate / 100, capex = p.capex * 1e6, opex = capex * p.opex / 100, rev = aepGwh * 1e6 * p.tariff / 100, cf = [-capex];
    let dE = 0, dC = capex, cum = -capex, payback = null;
    for (let y = 1; y <= p.years; y++) { cf.push(rev - opex); dE += aepGwh * 1e6 / Math.pow(1 + r, y); dC += opex / Math.pow(1 + r, y); const prev = cum; cum += rev - opex; if (payback === null && cum >= 0) payback = y - 1 + (-prev) / (rev - opex); }
    const npv = q => cf.reduce((s, c, i) => s + c / Math.pow(1 + q, i), 0); let lo = -0.9, hi = 1, irr = null;
    if (npv(lo) > 0 && npv(hi) < 0) { for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; npv(m) > 0 ? lo = m : hi = m; } irr = (lo + hi) / 2; }
    return { lcoe: dC / dE * 100, npv: npv(r), irr, payback, rev, perKw: capex / (N * W.T.rated) };
  }
  /* подробный ход работ по одной ВЭУ: девять шагов от подъезда до пуска, каждый — доля своей работы */
  const CHECK = [['road', 1, 'Подъезд', 6], ['pad', 1, 'Монтажная площадка', 8], ['found', .45, 'Котлован и арматура фундамента', 10], ['found', 1, 'Бетон залит и набрал прочность', 14],
    ['erect', .4, 'Башня: нижние и средние секции', 12], ['erect', .6, 'Башня: верхняя секция', 8], ['erect', .78, 'Гондола и ступица', 10], ['erect', 1, 'Лопасти установлены', 10], ['mv', 1, 'Кабель 35 кВ подключён', 10], ['com', 1, 'Пусконаладка и пуск', 12]];
  const CW = CHECK.reduce((s, c) => s + c[3], 0);
  function detail(i, d) {
    const at = (src, id, k) => src[id].s[i] + (src[id].e[i] - src[id].s[i]) * k, prog = src => { let p = 0, prev = {}; for (const [id, k, , w] of CHECK) { const k0 = prev[id] || 0, a = at(src, id, k0), b = at(src, id, k); p += w * (d >= b ? 1 : d <= a ? 0 : (d - a) / (b - a)); prev[id] = k; } return p / CW; };
    const steps = CHECK.map(([id, k, name]) => { const day = at(fact, id, k), plan = at(plan0, id, k); return { id, name, day, plan, done: d >= day }; });
    const next = steps.find(s => !s.done), cur = next ? steps[steps.indexOf(next) - 1] : steps[steps.length - 1], doing = next && d >= fact[next.id].s[i], pf = prog(fact), pp = prog(plan0), c = comp(i), n = String(i + 1).padStart(3, '0');
    const es = fact.erect.s[i], ee = fact.erect.e[i], crane = d >= ee ? 'снят, монтаж закончен' : d >= es ? 'на площадке, идёт монтаж' : es - d <= 14 ? 'мобилизуется, монтаж с ' : 'по графику с ';
    return { steps, stage: doing ? 'В работе: ' + next.name[0].toLowerCase() + next.name.slice(1) : cur ? cur.name : 'Работы не начаты', next, pct: pf, planPct: pp, spi: pp > 0.005 ? pf / pp : 1, crane, craneDay: d < es ? es : null,
      parts: [['tower', 'Секции башни', 'T-' + n + ' (5 шт)'], ['nacelle', 'Гондола и ступица', 'N-' + n], ['blades', 'Комплект лопастей', 'B-' + n]].map(([k, name, sn]) => ({ k, name, sn, day: c[k], here: c[k] != null && c[k] <= d, mounted: k === 'tower' ? d >= at(fact, 'erect', .6) : k === 'nacelle' ? d >= at(fact, 'erect', .78) : d >= ee })), demo: c.demo };
  }
  const plan0 = plan;
  /* слои проекта: сколько сделано по каждому виду работ и что сейчас в работе */
  function layers(d) {
    const cnt = id => { let done = 0; const now = []; for (let i = 0; i < N; i++) { if (d >= fact[id].e[i]) done++; else if (d >= fact[id].s[i]) now.push(i); } return { done, now }; };
    const fd = {}; for (let i = 0; i < N; i++) { const f = W.feeder[i]; fd[f] = fd[f] || [0, 0]; fd[f][1]++; if (d >= fact.mv.e[i]) fd[f][0]++; }
    const feeders = Object.entries(fd).map(([f, [a, b]]) => ({ f: +f, p: a / b }));
    return { road: qty('road', d, true), roadQty: A.road.qty, pad: cnt('pad'), found: cnt('found'), erect: cnt('erect'), mv: cnt('mv'), com: cnt('com'), feeders, ss: lin(A.ss, d, true), ohlJ: lin(A.ohlJ, d, true), ohlK: lin(A.ohlK, d, true), bess: lin(A.bess, d, true) };
  }
  function loadFact(real) { REAL = real && real.day != null ? { day: real.day, wtg: real.wtg || {}, area: real.area || {}, file: real.file, skipped: real.skipped } : null; buildFact(); recalc(); return REAL; }
  window.EPCW = { ACT, A, DAY0, PD, PAC, MAXD, dateOf, MILESTONES, WINTER, plan, fact, curvePlan, curveFact, mwPlan, mwFact, get factEnd() { return factEnd; }, get real() { return REAL; }, loadFact, comp, PARTS, ord, detail, layers, wtgState, steps, metrics, qc, delivered, BOQ, ECON, finance,
    STAGE: ['Не начато', 'Подъезд готов', 'Площадка готова', 'Фундамент готов', 'Идёт монтаж', 'Смонтирована', 'Подключена к сети 35 кВ', 'В работе'] };
})();
