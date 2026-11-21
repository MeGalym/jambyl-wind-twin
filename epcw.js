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
  const PA = {};        // сроки площадных работ из импортированного графика: { ss: [начало, конец] }
  const lin = (a, d, f) => { const p0 = f && REAL ? REAL.area[a.id] : null; if (!f && PA[a.id]) return Math.max(0, Math.min(1, (d - PA[a.id][0]) / Math.max(1, PA[a.id][1] - PA[a.id][0])));
    if (p0 != null) return d <= REAL.day ? p0 * Math.max(0, Math.min(1, (d - a.s) / Math.max(1, REAL.day - a.s))) : Math.min(1, p0 + (d - REAL.day) / (a.e - a.s));
    return Math.max(0, Math.min(1, (d - a.s - (f ? 6 : 0)) / ((a.e - a.s) / (f ? a.f : 1)))); };
  const areaEnd = id => REAL && REAL.area[id] != null ? REAL.day + (1 - REAL.area[id]) * (A[id].e - A[id].s) : A[id].s + 6 + (A[id].e - A[id].s) / A[id].f;
  const plan = {}, fact = {};
  // ВЭУ на фидере стоят цепочкой: чем больше номер места, тем ближе к подстанции. Напряжение приходит по цепочке от подстанции.
  const upCable = i => { let t = fact.mv.e[i]; for (let j = 0; j < N; j++) if (W.feeder[j] === W.feeder[i] && W.fpos[j] > W.fpos[i]) t = Math.max(t, fact.mv.e[j]); return t; };
  for (const a of ACT) {
    if (!a.per) continue;
    const dur = (a.e - a.s) / N, ps = new Float32Array(N), pe = new Float32Array(N);
    ord.forEach((el, j) => { ps[el] = a.s + j * dur; pe[el] = a.s + (j + 1) * dur; });
    plan[a.id] = { s: ps, e: pe }; fact[a.id] = { s: new Float32Array(N), e: new Float32Array(N) };
  }
  const base = {}; for (const id in plan) base[id] = { s: plan[id].s.slice(), e: plan[id].e.slice() };      // план по вехам RFP: к нему возвращаемся, когда импорт убран
  /* поставки комплектов ВЭУ: 8 комплектов каждые 18 дней; в сценарии задержка лопастей в пути */
  const deliveries = []; { let got = 0, d = 250; while (got < N) { if (!(d >= 404 && d < 452)) { const q = Math.min(8, N - got); deliveries.push([d, q]); got += q; } d += 18; } }
  const setDay = new Float32Array(N); { let j = 0; for (const [day, q] of deliveries) for (let k = 0; k < q; k++) setDay[ord[j++]] = day; }
  const PARTS = [['tower', 'Секции башни'], ['nacelle', 'Гондола и ступица'], ['blades', 'Лопасти']];
  // когда компоненты ВЭУ пришли на площадку: из отчёта, а без него — по сценарию поставок
  function comp(i) { if (!REAL) return { tower: setDay[i], nacelle: setDay[i], blades: setDay[i], demo: true };
    const r = REAL.wtg[i] || {}, done = r.erect && r.erect[1] != null ? r.erect[1] : null, g = k => r[k] != null ? r[k] : done; return { tower: g('tower'), nacelle: g('nacelle'), blades: g('blades'), demo: false }; }
  /* краны: сколько главных кранов на площадке и сколько дней уходит на одну ВЭУ вместе с переездом; оба числа приняты* и меняются на экране */
  const CR = { n: 3, days: 7 }, craneOf = new Int8Array(N).fill(-1);
  try { const v = JSON.parse(localStorage.getItem('jambyl-cranes')); if (v && v.n >= 1 && v.n <= 8 && v.days >= 3 && v.days <= 20) { CR.n = Math.round(v.n); CR.days = Math.round(v.days); } } catch (e) {}
  // монтаж: ВЭУ встают в очередь по дате готовности (подъезд, площадка, бетон, комплект), каждую берёт кран, который освободится первым
  function buildErect(stops) {
    const a = A.erect, fs = fact.erect.s, fe = fact.erect.e, t0 = REAL ? Math.max(a.s + 3, REAL.day) : a.s + 3, free = new Array(CR.n).fill(t0), todo = []; let k = 0; craneOf.fill(-1);
    ord.forEach(el => { const r = REAL && REAL.wtg[el] && REAL.wtg[el].erect;
      if (r && r[1] != null) { fe[el] = r[1]; fs[el] = r[0] != null && r[0] < r[1] ? r[0] : r[1] - CR.days; return; }
      if (r && r[0] != null) { fs[el] = r[0]; fe[el] = Math.max(REAL.day + 1, skip(r[0], r[0] + CR.days, stops)); const c = k++ % CR.n; craneOf[el] = c; free[c] = Math.max(free[c], fe[el]); return; }
      const c = comp(el), pd = [c.tower, c.nacelle, c.blades], parts = pd.every(v => v != null) ? Math.max(...pd) : 0;
      todo.push([el, Math.max(fact.found.e[el] + a.lag, fact.pad.e[el], fact.road.e[el], parts)]); });
    todo.sort((x, y) => x[1] - y[1]);
    for (const [el, ready] of todo) { let c = 0; for (let j = 1; j < CR.n; j++) if (free[j] < free[c]) c = j;
      let st = Math.max(ready, free[c]); if (stops) for (const [x, y] of stops) if (st >= x && st < y) st = y;
      fs[el] = st; fe[el] = skip(st, st + CR.days, stops); free[c] = fe[el]; craneOf[el] = c; }
  }
  /* факт: без данных с площадки — демонстрационный сценарий; с данными — внесённые даты, а остаток досчитывается плановым темпом от даты отчёта */
  function buildFact() {
    for (const a of ACT) { if (!a.per) continue;
      const dur = (a.e - a.s) / N, fs = fact[a.id].s, fe = fact[a.id].e, stops = REAL ? (a.id === 'found' ? WINTER : null) : a.stop; let t = REAL ? Math.max(a.s + 3, REAL.day) : a.s + 3;
      if (a.id === 'erect') { buildErect(stops); continue; }
      ord.forEach(el => { const r = REAL && REAL.wtg[el] && REAL.wtg[el][a.id];
        if (r && r[1] != null) { fe[el] = r[1]; fs[el] = r[0] != null && r[0] < r[1] ? r[0] : r[1] - Math.max(1, dur / a.f); return; }
        if (r && r[0] != null) { fs[el] = r[0]; fe[el] = Math.max(REAL.day + 1, skip(r[0], r[0] + dur / a.f, stops)); return; }
        let st = t; if (a.pre) st = Math.max(st, fact[a.pre].e[el] + a.lag);
        if (a.id === 'com') st = Math.max(st, areaEnd('ss') + 4, areaEnd('ohlJ') + 2, upCable(el) + 3);
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
  function recalcPlan() { curvePlan.length = 0; mwPlan.length = 0; for (let d = 0; d <= MAXD; d++) { curvePlan.push(pct(d, false)); mwPlan.push(online(d, false)); } }
  recalcPlan();
  let factEnd = 0;
  function recalc() { curveFact.length = 0; mwFact.length = 0; for (let d = 0; d <= MAXD; d++) { curveFact.push(pct(d, true)); mwFact.push(online(d, true)); } factEnd = curveFact.findIndex(v => v > 0.9995); if (factEnd < 0) factEnd = MAXD; }
  recalc();
  function wtgState(i, d) {
    const fr = id => { const s = fact[id].s[i], e = fact[id].e[i]; return d >= e ? 1 : d <= s ? 0 : (d - s) / (e - s); };
    const er = fr('erect'), st = { road: fr('road') >= 1, pad: fr('pad') >= 1, found: fr('found'), tower: Math.min(1, er / 0.6), nacelle: er >= 0.78, blades: er >= 1 ? 3 : er > 0.93 ? 2 : er > 0.86 ? 1 : 0, erecting: er > 0 && er < 1, mv: fr('mv') >= 1, com: d >= fact.com.e[i] };
    st.stage = st.com ? 7 : st.mv && er >= 1 ? 6 : er >= 1 ? 5 : er > 0 ? 4 : st.found >= 1 ? 3 : st.pad ? 2 : st.road ? 1 : 0; st.pouring = st.found > 0 && st.found < 1;
    let late = 0; for (const id of ['road', 'pad', 'found', 'erect', 'mv', 'com']) if (d > plan[id].e[i] && d < fact[id].e[i]) late = Math.max(late, d - plan[id].e[i]);
    st.late = late; st.due = d > plan.road.s[i]; return st;
  }
  const STEPS = ['road', 'pad', 'found', 'erect', 'mv', 'com'];
  const steps = i => STEPS.map(id => ({ id, name: A[id].name, plan: plan[id].e[i], fact: fact[id].e[i], start: fact[id].s[i] }));
  const delivered = d => { if (!REAL) return deliveries.reduce((s, [day, q]) => s + (day <= d ? q : 0), 0);
    let n = 0; for (let i = 0; i < N; i++) { const c = comp(i); if (c.tower != null && c.nacelle != null && c.blades != null && Math.max(c.tower, c.nacelle, c.blades) <= d) n++; } return n; };
  const partsOnSite = d => PARTS.map(([k, name]) => { let n = 0; for (let i = 0; i < N; i++) { const v = comp(i)[k]; if (v != null && v <= d) n++; } return { k, name, n }; });
  const QCT = { pad: ['Основание площадки недоуплотнено'], found: ['Анкерная корзина отклонена от оси', 'Трещины в бетоне после распалубки', 'Нет протокола прочности бетона'], erect: ['Не подтверждён момент затяжки фланца', 'Повреждена кромка лопасти при разгрузке'], mv: ['Не испытана оболочка кабеля', 'Муфта без маркировки'] }, qc = [];
  function genQC() { const R = rng(140); qc.length = 0;
  for (let k = 0; k < 70; k++) { const id = ['pad', 'found', 'found', 'erect', 'erect', 'mv'][Math.floor(R() * 6)], i = Math.floor(R() * N), l = QCT[id], text = l[Math.floor(R() * l.length)], found = fact[id].e[i] + R() * 6; qc.push({ n: k + 1, i, id, text, found, closed: found + 4 + R() * 30 + (R() < .12 ? 90 : 0), sev: /Трещины|кромка|корзина/.test(text) ? 'bad' : 'warn' }); }
  qc.sort((a, b) => a.found - b.found); }
  genQC();
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
  const CHECK = [['road', 1, 'Подъезд', 6], ['pad', 1, 'Монтажная площадка', 8], ['found', .45, 'Котлован и арматура фундамента', 10], ['found', 1, 'Фундамент забетонирован', 14],
    ['erect', .4, 'Башня: нижние и средние секции', 12], ['erect', .6, 'Башня: верхняя секция', 8], ['erect', .78, 'Гондола и ступица', 10], ['erect', 1, 'Лопасти установлены', 10], ['mv', 1, 'Кабель 35 кВ подключён', 10], ['com', 1, 'Пусконаладка и пуск', 12]];
  const CW = CHECK.reduce((s, c) => s + c[3], 0);
  function detail(i, d) {
    const at = (src, id, k) => src[id].s[i] + (src[id].e[i] - src[id].s[i]) * k, prog = src => { let p = 0, prev = {}; for (const [id, k, , w] of CHECK) { const k0 = prev[id] || 0, a = at(src, id, k0), b = at(src, id, k); p += w * (d >= b ? 1 : d <= a ? 0 : (d - a) / (b - a)); prev[id] = k; } return p / CW; };
    const steps = CHECK.map(([id, k, name]) => { const day = at(fact, id, k), plan = at(plan0, id, k); return { id, name, day, plan, done: d >= day }; });
    const next = steps.find(s => !s.done), cur = next ? steps[steps.indexOf(next) - 1] : steps[steps.length - 1], doing = next && d >= fact[next.id].s[i], pf = prog(fact), pp = prog(plan0), c = comp(i), n = String(i + 1).padStart(3, '0');
    const es = fact.erect.s[i], ee = fact.erect.e[i], crane = d >= ee ? 'снят, монтаж закончен' : d >= es ? 'на площадке, идёт монтаж' : es - d <= 14 ? 'мобилизуется, монтаж с ' : 'по графику с ';
    return { steps, stage: doing ? 'В работе: ' + next.name[0].toLowerCase() + next.name.slice(1) : cur ? cur.name : 'Работы не начаты', next, pct: pf, planPct: pp, spi: pp > 0.005 ? pf / pp : 1, crane, craneDay: d < es ? es : null, craneNo: craneOf[i] + 1,
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
  /* ---------- логика стройки ВЭС ---------- */
  const CURE = 28;                      // суток набора прочности бетона до монтажа башни; принято*
  const erFrac = (i, d) => { const a = fact.erect.s[i], b = fact.erect.e[i]; return d >= b ? 1 : d <= a ? 0 : (d - a) / (b - a); };
  // ворота: что должно быть готово, чтобы начать монтаж ВЭУ и чтобы её пустить
  function gates(i, d) {
    const c = comp(i), pour = fact.found.e[i], cured = pour + CURE, up = upCable(i), pd = [c.tower, c.nacelle, c.blades], partsDay = pd.every(v => v != null) ? Math.max(...pd) : null;
    const erect = [
      { k: 'road', name: 'Подъезд готов', ok: d >= fact.road.e[i], day: fact.road.e[i] },
      { k: 'pad', name: 'Монтажная площадка готова', ok: d >= fact.pad.e[i], day: fact.pad.e[i] },
      { k: 'cure', name: 'Бетон фундамента набрал прочность', ok: d >= cured, day: cured, note: d >= pour && d < cured ? 'идёт ' + Math.min(CURE, Math.floor(d - pour) + 1) + '-е сутки из ' + CURE : d < pour ? 'фундамент ещё не забетонирован' : null },
      { k: 'parts', name: 'Башня, гондола и лопасти на площадке', ok: partsDay != null && d >= partsDay, day: partsDay, note: partsDay == null ? 'нет данных о поставке' : null },
      { k: 'crane', name: 'Кран и бригада на площадке', ok: d >= fact.erect.s[i], day: fact.erect.s[i], note: craneOf[i] >= 0 ? 'кран № ' + (craneOf[i] + 1) : null },
    ], com = [
      { k: 'mech', name: 'ВЭУ смонтирована', ok: d >= fact.erect.e[i], day: fact.erect.e[i] },
      { k: 'cable', name: 'Кабель 35 кВ дошёл от подстанции', ok: d >= up, day: up, note: up > fact.mv.e[i] + 0.5 && d < up ? 'свой участок готов, ждём соседние ВЭУ фидера' : null },
      { k: 'ss', name: 'Подстанция 220/35 кВ под напряжением', ok: d >= areaEnd('ss'), day: areaEnd('ss') },
      { k: 'ohl', name: 'ВЛ 220 кВ до ПС Жамбыл готова', ok: d >= areaEnd('ohlJ'), day: areaEnd('ohlJ') },
    ];
    const started = d >= fact.erect.s[i], erected = d >= fact.erect.e[i], live = d >= fact.com.e[i], last = a => a.filter(g => !g.ok).sort((x, y) => (y.day == null ? 1e9 : y.day) - (x.day == null ? 1e9 : x.day))[0] || null;
    // держит то условие, которое выполнится последним
    const holdErect = started ? null : last(erect.slice(0, 4)) || erect[4], holdCom = live ? null : last(com);
    const state = live ? 'live' : erected ? (holdCom ? (holdCom.k === 'cable' ? 'waitCable' : 'waitGrid') : 'test') : started ? 'erect' : d < pour ? 'civil' : holdErect.k === 'cure' ? 'cure' : holdErect.k === 'parts' ? 'parts' : holdErect.k === 'crane' ? 'ready' : 'civil';
    return { erect, com, holdErect, holdCom, state, startDay: fact.erect.s[i], comDay: fact.com.e[i] };
  }
  const GATE_STATE = { civil: 'Фундамент не готов', cure: 'Бетон набирает прочность', parts: 'Ждёт комплект ВЭУ', ready: 'Готова к монтажу, ждёт кран', erect: 'Идёт монтаж', waitCable: 'Смонтирована, ждёт кабель', waitGrid: 'Смонтирована, ждёт сеть 220 кВ', test: 'Пусконаладка', live: 'В работе' };
  // где узкое место: сколько ВЭУ в каждом состоянии и какие именно
  function bottlenecks(d) { const by = {}; for (const k in GATE_STATE) by[k] = []; for (let i = 0; i < N; i++) by[gates(i, d).state].push(i);
    for (const k of ['ready', 'cure', 'parts']) by[k].sort((a, b) => fact.erect.s[a] - fact.erect.s[b]); return by; }
  // склад комплектов и расход материалов; общие объёмы — из ведомости BOP
  function inventory(d) {
    const sets = [['tower', 'Секции башни', 5], ['nacelle', 'Гондолы со ступицами', 1], ['blades', 'Лопасти', 3]];
    const used = (k, i, day) => { const e = erFrac(i, day); return k === 'tower' ? Math.round(5 * Math.min(1, e / 0.6)) : k === 'nacelle' ? +(e >= 0.78) : e >= 1 ? 3 : e > 0.93 ? 2 : e > 0.86 ? 1 : 0; };
    const items = sets.map(([k, name, per]) => { let got = 0, out = 0, out14 = 0, known = 0; for (let i = 0; i < N; i++) { const v = comp(i)[k]; if (v != null) known++; if (v != null && v <= d) got += per; out += used(k, i, d); out14 += used(k, i, d + 14); }
      const stock = Math.max(0, got - out), need = out14 - out; return { k, name, per, total: N * per, got, out, stock, need, flag: got >= N * per && stock >= need ? '' : stock < need ? 'low' : '', known: known > 0 }; });
    let conc = 0, rebar = 0; for (let i = 0; i < N; i++) { const a = fact.found.s[i], b = fact.found.e[i], f = d >= b ? 1 : d <= a ? 0 : (d - a) / (b - a); rebar += Math.min(1, f / 0.45); conc += Math.max(0, (f - 0.45) / 0.55); }
    const bulk = [['Бетон фундаментов', 100.05, 'тыс. м³', conc / N], ['Арматура фундаментов', 11.8, 'тыс. т', rebar / N], ['Кабель 35 кВ', 916.8, 'км', qty('mv', d, true) / A.mv.qty], ['Основание дорог', 190.7, 'тыс. м³', qty('road', d, true) / A.road.qty]].map(([name, total, unit, p]) => ({ name, total, unit, p, done: total * p }));
    const rc = {}; for (let i = 0; i < N; i++) { const c = comp(i); for (const [k, name, per] of sets) if (c[k] != null && c[k] <= d) { const key = Math.round(c[k]) + '|' + k; rc[key] = rc[key] || { day: Math.round(c[k]), kind: 'in', name, n: 0 }; rc[key].n += per; } }
    const tx = Object.values(rc); for (let i = 0; i < N; i++) if (fact.erect.e[i] <= d) tx.push({ day: Math.round(fact.erect.e[i]), kind: 'out', name: 'Комплект ВЭУ смонтирован', w: i });
    tx.sort((a, b) => b.day - a.day || (a.kind < b.kind ? -1 : 1)); return { items, bulk, tx: tx.slice(0, 14), demo: !REAL };
  }
  // график работ: план, факт и прогноз окончания по каждой работе
  function wbs(d) {
    return ACT.map((a, k) => { const p = qty(a.id, d, false) / a.qty, f = qty(a.id, d, true) / a.qty; let fs, fe, done = null;
      if (a.per) { fs = Infinity; fe = -Infinity; done = 0; for (let i = 0; i < N; i++) { fs = Math.min(fs, fact[a.id].s[i]); fe = Math.max(fe, fact[a.id].e[i]); if (d >= fact[a.id].e[i]) done++; } } else { fs = a.s + (REAL ? 0 : 6); fe = areaEnd(a.id); }
      const [ps, pe] = planSpan(a.id), slip = Math.round(fe - pe), status = f >= 0.995 ? 'done' : f <= 0.0005 ? (d > a.s + 7 ? 'late' : 'wait') : slip > 7 || f < p - 0.03 ? 'late' : 'run';
      return { code: '1.' + (k + 1), id: a.id, name: a.name, unit: a.unit, qty: a.qty, ps, pe, fs, fe, plan: p, fact: f, status, slip, left: Math.round(fe - d), done, rate: (qty(a.id, d, true) - qty(a.id, d - 14, true)) / 14, need: f < 0.995 ? (a.qty - qty(a.id, d, true)) / Math.max(1, pe - d) : 0 }; });
  }
  // плановые сроки работы: по ВЭУ — от самого раннего начала до самого позднего конца, по площадным — из импорта или по вехам RFP
  function planSpan(id) { const a = A[id]; if (!a.per) return PA[id] || [a.s, a.e]; let s = Infinity, e = -Infinity; for (let i = 0; i < N; i++) { s = Math.min(s, plan[id].s[i]); e = Math.max(e, plan[id].e[i]); } return [s, e]; }
  /* импортированный график: { file, wtg: { i: { road: [начало, конец], ... } }, area: { ss: [начало, конец] } }; null возвращает план по вехам RFP.
     Меняется только план: факт и прогноз остаются прежними, поэтому сразу видно, где новый график расходится с ходом работ. */
  let PLANSRC = null;
  function loadPlan(p) {
    for (const id in base) { plan[id].s.set(base[id].s); plan[id].e.set(base[id].e); } for (const k in PA) delete PA[k];
    PLANSRC = p && p.wtg ? p : null;
    if (PLANSRC) { for (const i in p.wtg) for (const id in p.wtg[i]) { const r = p.wtg[i][id]; if (plan[id] && r && r[0] != null && r[1] != null && r[1] >= r[0]) { plan[id].s[i] = r[0]; plan[id].e[i] = Math.max(r[1], r[0] + 0.5); } }
      for (const id in p.area || {}) { const r = p.area[id]; if (A[id] && !A[id].per && r && r[1] > r[0]) PA[id] = [r[0], r[1]]; } }
    recalcPlan(); return PLANSRC; }
  // замечания ОТК из сценария со статусом на дату: выдано → в работе → на проверке → закрыто
  const DISC = { pad: 'Земляные работы', found: 'Фундаменты', erect: 'Монтаж ВЭУ', mv: 'Кабель 35 кВ' };
  function tasks(d) { if (REAL) return []; return qc.filter(q => q.found <= d).map(q => { const life = q.closed - q.found, t = d - q.found;
    return { n: q.n, i: q.i, text: q.text, disc: DISC[q.id], sev: q.sev, found: q.found, closed: q.closed, age: Math.round(Math.min(t, life)), status: d >= q.closed ? 'closed' : t < 2 ? 'new' : t < life * 0.65 ? 'work' : 'review' }; }); }
  // загрузка кранов на дату: что монтирует каждый, что возьмёт следующим и сколько кранов нужно для планового темпа
  function craneLoad(d) {
    const list = []; for (let c = 0; c < CR.n; c++) { const mine = []; for (let i = 0; i < N; i++) if (craneOf[i] === c) mine.push(i); mine.sort((a, b) => fact.erect.s[a] - fact.erect.s[b]);
      const cur = mine.find(i => d >= fact.erect.s[i] && d < fact.erect.e[i]), next = mine.find(i => fact.erect.s[i] > d);
      list.push({ no: c + 1, cur: cur == null ? null : cur, until: cur == null ? null : fact.erect.e[cur], next: next == null ? null : next, nextDay: next == null ? null : fact.erect.s[next], done: mine.filter(i => d >= fact.erect.e[i]).length, total: mine.length }); }
    let end = 0; for (let i = 0; i < N; i++) end = Math.max(end, fact.erect.e[i]);
    return { n: CR.n, days: CR.days, list, need: CR.days * N / (A.erect.e - A.erect.s), end, planEnd: A.erect.e };
  }
  function setCranes(n, days) { CR.n = Math.max(1, Math.min(8, Math.round(n))); CR.days = Math.max(3, Math.min(20, Math.round(days)));
    try { localStorage.setItem('jambyl-cranes', JSON.stringify(CR)); } catch (e) {} buildFact(); if (!REAL) genQC(); recalc(); return CR; }
  function loadFact(real) { REAL = real && real.day != null ? { day: real.day, wtg: real.wtg || {}, area: real.area || {}, file: real.file, skipped: real.skipped } : null; buildFact(); recalc(); return REAL; }
  window.EPCW = { ACT, A, DAY0, PD, PAC, MAXD, dateOf, MILESTONES, WINTER, plan, fact, curvePlan, curveFact, mwPlan, mwFact, get factEnd() { return factEnd; }, get real() { return REAL; }, loadFact, loadPlan, planSpan, basePlan: base, get planSrc() { return PLANSRC; }, comp, PARTS, ord, detail, layers, gates, GATE_STATE, bottlenecks, craneLoad, setCranes, craneOf, inventory, wbs, tasks, CURE, upCable, wtgState, steps, metrics, qc, delivered, BOQ, ECON, finance,
    STAGE: ['Не начато', 'Подъезд готов', 'Площадка готова', 'Фундамент готов', 'Идёт монтаж', 'Смонтирована', 'Подключена к сети 35 кВ', 'В работе'] };
})();
