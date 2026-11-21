/* Импорт графика из Primavera P6: файл XER, XML или выгрузка в Excel/CSV → плановые сроки по ВЭУ и по объектам площадки.
   Работа сопоставляется с ВЭУ по номеру в коде или названии, с видом работ — по ключевым словам.
   Пример файла собирается здесь же из плана проекта: это демо-данные, а не график подрядчика. */
(function () {
  const SITE = window.SITE, E = window.EPCW, IO = window.FACTIO, N = SITE.wtg.length;
  const idx = new Map(SITE.wtg.map((w, i) => [parseInt(String(w[0]).replace(/\D/g, ''), 10), i]));
  const ACTS = [['found', /found|фундамент/i], ['pad', /pad|hardstand|площадк/i], ['road', /road|дорог|подъезд/i], ['mv', /cable|\bmv\b|кабел/i], ['com', /commission|energi[sz]|пуск|пнр/i], ['erect', /erect|install|монтаж/i]];
  const AREAS = [['ohlK', /kentau|кентау/i], ['ohlJ', /(ohl|вл\b|line).*(jambyl|zhambyl|жамбыл)|(jambyl|zhambyl|жамбыл).*(ohl|вл\b|line)/i], ['bess', /bess|накопит|снэ/i], ['ss', /substation|подстанц|(^|\s)пс(\s|$)/i]];
  const WTG_RE = /(?:WTG|ВЭУ|WEC|WT)[\s\-_.№#]*0*(\d{1,3})(?!\d)/i;
  const day = v => { if (v == null || v === '') return null; if (typeof v === 'number') return v > 30000 && v < 80000 ? Math.round((Date.UTC(1899, 11, 30) + v * 864e5 - E.DAY0) / 864e5) : null;
    const t = String(v).trim(); let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - E.DAY0) / 864e5);
    m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/); if (m) return Math.round((Date.UTC(+m[3] < 100 ? +m[3] + 2000 : +m[3], +m[2] - 1, +m[1]) - E.DAY0) / 864e5);
    m = t.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/); if (m) { const mo = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[2].toLowerCase()) / 3; if (mo >= 0 && mo % 1 === 0) return Math.round((Date.UTC(+m[3] < 100 ? +m[3] + 2000 : +m[3], mo, +m[1]) - E.DAY0) / 864e5); }
    const n = +t.replace(',', '.'); return isFinite(n) && n > 30000 && n < 80000 ? day(n) : null; };

  /* ---------- чтение форматов: на выходе список работ { code, name, s, e, mile } ---------- */
  function fromXer(text) { const tables = {}; let cur = null, fields = null, project = '';
    for (const line of text.split(/\r?\n/)) { const c = line.split('\t'), tag = c[0];
      if (tag === '%T') { cur = c[1]; tables[cur] = []; fields = null; } else if (tag === '%F') fields = c.slice(1); else if (tag === '%R' && cur && fields) { const r = {}; fields.forEach((f, k) => r[f] = c[k + 1]); tables[cur].push(r); } }
    if (!tables.TASK) throw new Error('в файле XER нет таблицы работ TASK');
    if (tables.PROJECT && tables.PROJECT[0]) project = tables.PROJECT[0].proj_short_name || '';
    return { project, format: 'Primavera P6, XER', tasks: tables.TASK.map(r => ({ code: r.task_code || '', name: r.task_name || '', s: day(r.target_start_date || r.early_start_date || r.act_start_date), e: day(r.target_end_date || r.early_end_date || r.act_end_date), mile: /Mile/i.test(r.task_type || '') })) }; }
  function fromXml(text) { const doc = new DOMParser().parseFromString(text, 'application/xml'); if (doc.getElementsByTagName('parsererror').length) throw new Error('файл XML не читается');
    const kid = (el, names) => { for (const n of names) for (const c of el.children) if (c.localName === n && c.textContent.trim()) return c.textContent.trim(); return ''; };
    let els = [...doc.getElementsByTagName('*')].filter(e => e.localName === 'Activity'), format = 'Primavera P6, XML'; if (!els.length) { els = [...doc.getElementsByTagName('*')].filter(e => e.localName === 'Task'); format = 'MS Project, XML'; }
    if (!els.length) throw new Error('в файле XML нет работ: ждём элементы Activity или Task');
    const pr = [...doc.getElementsByTagName('*')].find(e => e.localName === 'Project');
    return { project: pr ? kid(pr, ['Id', 'Name', 'Title']) : '', format, tasks: els.map(el => ({ code: kid(el, ['Id', 'WBS', 'ID']), name: kid(el, ['Name']), s: day(kid(el, ['PlannedStartDate', 'StartDate', 'Start'])), e: day(kid(el, ['PlannedFinishDate', 'FinishDate', 'Finish'])), mile: /Milestone/i.test(kid(el, ['Type'])) || kid(el, ['Milestone']) === '1' })) }; }
  function fromRows(rows) { const H = [['code', /activity id|task code|код|^id$|шифр/i], ['name', /name|наимен|работа|описан/i], ['s', /start|начал/i], ['e', /finish|end|оконч|заверш/i]]; let head = null; const tasks = [];
    for (const row of rows) { if (!head) { const h = {}; row.forEach((c, k) => { const t = String(c ?? '').trim(); for (const [key, re] of H) if (h[key] == null && re.test(t)) { h[key] = k; break; } }); if (h.name != null && h.s != null && h.e != null) head = h; continue; }
      const name = String(row[head.name] ?? '').trim(), code = head.code != null ? String(row[head.code] ?? '').trim() : ''; if (!name && !code) continue; const s = day(row[head.s]), e = day(row[head.e]); tasks.push({ code, name, s, e, mile: s != null && s === e }); }
    if (!head) throw new Error('в таблице нет заголовков: нужны столбцы «Название», «Начало», «Окончание»'); return { project: '', format: 'Таблица Excel или CSV', tasks }; }
  async function read(file) { const buf = await file.arrayBuffer(), nm = file.name || ''; let text = null; const dec = () => { if (text == null) { try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1251').decode(buf); } } return text; };
    const src = /\.xlsx$/i.test(nm) ? fromRows(await IO.fromXlsx(buf)) : /\.xer$/i.test(nm) || /^ERMHDR|^%T\t/m.test(dec().slice(0, 4000)) ? fromXer(dec()) : /\.xml$/i.test(nm) || /^\s*</.test(dec()) ? fromXml(dec()) : fromRows(IO.fromCsv(dec()));
    return match(src, nm); }

  /* ---------- сопоставление работ с ВЭУ и объектами ---------- */
  function match(src, file) { const wtg = {}, area = {}, by = {}, unmatched = [], miles = []; let dated = 0;
    for (const t of src.tasks) { const txt = t.code + ' ' + t.name, m = txt.match(WTG_RE);
      if (t.mile) { miles.push({ name: t.name, day: t.e != null ? t.e : t.s }); continue; }
      if (t.s == null || t.e == null) { unmatched.push({ code: t.code, name: t.name, why: 'нет дат' }); continue; } dated++;
      if (m) { const i = idx.get(+m[1]), a = ACTS.find(x => x[1].test(t.name) || x[1].test(t.code));
        if (i == null) { unmatched.push({ code: t.code, name: t.name, why: 'ВЭУ № ' + (+m[1]) + ' нет в проекте' }); continue; }
        if (!a) { unmatched.push({ code: t.code, name: t.name, why: 'вид работ не распознан' }); continue; }
        const w = wtg[i] = wtg[i] || {}, r = w[a[0]]; w[a[0]] = r ? [Math.min(r[0], t.s), Math.max(r[1], t.e)] : [t.s, t.e]; by[a[0]] = (by[a[0]] || 0) + 1; continue; }
      const ar = AREAS.find(x => x[1].test(txt));
      if (ar) { const r = area[ar[0]]; area[ar[0]] = r ? [Math.min(r[0], t.s), Math.max(r[1], t.e)] : [t.s, t.e]; by[ar[0]] = (by[ar[0]] || 0) + 1; continue; }
      unmatched.push({ code: t.code, name: t.name, why: 'нет номера ВЭУ и объекта площадки' }); }
    const nW = Object.keys(wtg).length; if (!nW && !Object.keys(area).length) throw new Error('ни одна работа не сопоставлена: в названиях нужен номер ВЭУ (WTG001) и вид работ');
    // что изменится против действующего плана: сроки каждой работы до и после
    const diff = E.ACT.map(a => { const old = [a.s, a.e]; let s = Infinity, e = -Infinity, n = 0, chg = 0;
      if (a.per) { for (const i in wtg) { const r = wtg[i][a.id]; if (r) { s = Math.min(s, r[0]); e = Math.max(e, r[1]); n++; if (Math.abs(r[0] - E.basePlan[a.id].s[i]) > 1.5 || Math.abs(r[1] - E.basePlan[a.id].e[i]) > 1.5) chg++; } } } else if (area[a.id]) { s = area[a.id][0]; e = area[a.id][1]; n = 1; }
      return { id: a.id, name: a.name, per: !!a.per, n, chg, tasks: by[a.id] || 0, old, now: n ? [s, e] : null }; });
    return { file, project: src.project, format: src.format, total: src.tasks.length, dated, wtg, area, miles, unmatched, diff, nW, matched: Object.values(by).reduce((s, x) => s + x, 0) }; }

  /* ---------- пример файла: вторая редакция графика, собрана из плана проекта ---------- */
  function sampleXer() { const P = E.plan, iso = d => E.dateOf(Math.round(d)).toISOString().slice(0, 10) + ' 08:00', skip = d => { for (const [a, b] of E.WINTER) if (d >= a && d < b) return b + (d - a) * 0.35; return d; };
    const NAMES = { road: ['RD', 'Access road'], pad: ['PD', 'Crane pad / hardstand'], found: ['FN', 'Foundation'], erect: ['ER', 'WTG erection'], mv: ['MV', 'MV cable 35 kV'], com: ['CM', 'Commissioning'] }, rows = []; let id = 1000;
    const add = (wbs, code, name, s, e, type) => rows.push(['%R', ++id, 501, wbs, code, name, type || 'TT_Task', iso(s), iso(e), Math.max(0, Math.round((e - s) * 8))].join('\t'));
    add(10, 'G-0010', 'Mobilization and site camp', 0, 45); add(10, 'G-0020', 'Temporary batching plant', 30, 75); add(10, 'G-0030', 'Permanent met mast', 200, 230);
    add(20, 'SS-1000', 'Substation 220/35 kV - civil, equipment, testing', 120, 534); add(20, 'OHL-1000', 'OHL 220 kV to Jambyl SS', 150, 530); add(20, 'OHL-2000', 'OHL 220 kV to Kentau SS', 320, 690); add(20, 'BESS-1000', 'BESS 600 MWh - installation', 380, 640);
    const a0 = E.A.erect.s, a1 = E.A.erect.e;
    for (let i = 0; i < N; i++) { const n = SITE.wtg[i][0];
      for (const k of ['road', 'pad', 'found', 'erect', 'mv', 'com']) { let s = P[k].s[i], e = P[k].e[i];
        if (k === 'found') { s = skip(s); e = Math.max(s + 2, skip(e)); }                              // зимой бетон не льют: фундаменты сдвинуты за зимнюю паузу
        if (k === 'erect') { const f = v => a0 + 14 + (v - a0) * (a1 - a0 - 14) / (a1 - a0); s = f(s); e = f(e); }      // монтаж начинается на две недели позже и идёт плотнее
        add(30, `${n}-${NAMES[k][0]}`, `${n} - ${NAMES[k][1]}`, s, e); } }
    add(30, 'WTG141-FN', 'WTG141 - Foundation', 440, 452);
    for (const [d, mw, tag] of E.MILESTONES) add(40, 'MS-' + mw, `${mw} MW energized (${tag})`, d, d, 'TT_FinMile');
    return ['ERMHDR\t19.12\t2026-11-02\tProject\tplanner\tPlanner\tdbxDatabaseNoName\tProject Management\tUSD',
      '%T\tPROJECT', '%F\tproj_id\tproj_short_name\tplan_start_date\tplan_end_date', '%R\t501\tJMB-WF-REV2\t2026-07-01 00:00\t2029-03-01 00:00',
      '%T\tPROJWBS', '%F\twbs_id\tproj_id\twbs_short_name\twbs_name', '%R\t10\t501\tGEN\tGeneral', '%R\t20\t501\tBOP-E\tSubstation, OHL, BESS', '%R\t30\t501\tWTG\tWind turbines', '%R\t40\t501\tMS\tMilestones',
      '%T\tTASK', '%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\ttask_type\ttarget_start_date\ttarget_end_date\ttarget_drtn_hr_cnt', ...rows, '%E'].join('\r\n'); }
  const SAMPLE_NAME = 'JMB-WF-REV2_пример.xer';
  const sample = () => match(fromXer(sampleXer()), SAMPLE_NAME);
  const pack = r => ({ file: r.file, project: r.project, format: r.format, total: r.total, matched: r.matched, nW: r.nW, miles: r.miles.length, unmatched: r.unmatched.length, wtg: r.wtg, area: r.area, diff: r.diff, at: Date.now(), demo: r.file === SAMPLE_NAME });
  window.P6IO = { read, sample, sampleXer, pack, SAMPLE_NAME };
})();
