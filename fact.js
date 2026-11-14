/* Отчёт со стройплощадки: таблица CSV или Excel → объект для EPCW.loadFact. Общий для экрана стройки и 3D-двойника. */
(function () {
  const SITE = window.SITE, E = window.EPCW;
  const dayOf = v => { if (v == null) return null; if (typeof v === 'number') return v > 30000 && v < 80000 ? Math.round((Date.UTC(1899, 11, 30) + v * 864e5 - E.DAY0) / 864e5) : null;
    const t = String(v).trim(); let m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/), y, mo, d; if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; } else if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; } else { const n = +t.replace(',', '.'); return t && isFinite(n) && n > 30000 && n < 80000 ? dayOf(n) : null; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; return Math.round((Date.UTC(y, mo - 1, d) - E.DAY0) / 864e5); };
  const pctOf = v => { if (v == null || v === '') return null; let n = typeof v === 'number' ? v : +String(v).replace('%', '').replace(',', '.').trim(); if (!isFinite(n)) return null; if (typeof v === 'number' && n <= 1) n *= 100; return Math.max(0, Math.min(100, n)) / 100; };
  const idx = new Map(SITE.wtg.map((w, i) => [parseInt(String(w[0]).replace(/\D/g, ''), 10), i]));
  const COLS = [[/башн/, 'tower'], [/гондол/, 'nacelle'], [/лопаст/, 'blades'], [/дорог|подъезд/, 'road'], [/площадк/, 'pad'], [/фундамент/, 'found'], [/монтаж/, 'erect'], [/кабел/, 'mv'], [/пуск|ввод/, 'com']];
  const AREA = [[/^(пс|подстанц)/, 'ss'], [/жамбыл/, 'ohlJ'], [/кентау/, 'ohlK'], [/снэ|накопит|bess/, 'bess']];
  function fromRows(rows, file) {
    const real = { day: null, wtg: {}, area: {}, file, skipped: 0 }; let head = null, maxDay = -1e9;
    for (const row of rows) { const c0 = String(row[0] ?? '').trim(), low = c0.toLowerCase(); if (!c0) continue;
      if (/дата отч/.test(low)) { real.day = dayOf(row[1]); continue; }
      const ar = AREA.find(a => a[0].test(low)); if (ar && !head) { const p = pctOf(row[1]); if (p != null) real.area[ar[1]] = p; continue; }
      if (!head && /^(вэу|wtg|№)/.test(low)) { head = row.map(h => { const t = String(h ?? '').toLowerCase(), c = COLS.find(x => x[0].test(t)); return c ? [c[1], /начал|старт/.test(t) ? 0 : 1] : null; }); continue; }
      if (!head) continue; const i = idx.get(parseInt(c0.replace(/\D/g, ''), 10)); if (i == null) { real.skipped++; continue; }
      const r = {}; let any = false; head.forEach((h, k) => { if (!h || k === 0) return; const d = dayOf(row[k]); if (d == null) return; any = true; maxDay = Math.max(maxDay, d);
        if (h[0] === 'tower' || h[0] === 'nacelle' || h[0] === 'blades') r[h[0]] = d; else { r[h[0]] = r[h[0]] || [null, null]; r[h[0]][h[1]] = d; } });
      if (any) real.wtg[i] = r; }
    if (!head) throw new Error('в таблице нет строки заголовков: первая ячейка должна быть «ВЭУ»');
    if (!Object.keys(real.wtg).length) throw new Error('в таблице нет ни одной даты по ВЭУ');
    if (real.day == null) real.day = maxDay; return real; }
  function fromCsv(text) { text = text.replace(/^﻿/, ''); const first = text.split(/\r?\n/).find(l => /;|,|\t/.test(l)) || '', n = c => (first.match(c) || []).length, sep = n(/\t/g) > n(/;/g) && n(/\t/g) > n(/,/g) ? '\t' : n(/;/g) >= n(/,/g) ? ';' : ',';
    return text.split(/\r?\n/).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim())); }
  async function fromXlsx(buf) { const dv = new DataView(buf), u8 = new Uint8Array(buf), td = new TextDecoder(); let eo = buf.byteLength - 22; while (eo >= 0 && dv.getUint32(eo, true) !== 0x06054b50) eo--; if (eo < 0) throw new Error('файл не похож на Excel');
    const cnt = dv.getUint16(eo + 10, true); let p = dv.getUint32(eo + 16, true); const files = {};
    for (let k = 0; k < cnt; k++) { const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true); files[td.decode(u8.subarray(p + 46, p + 46 + nl))] = { method, csz, lo }; p += 46 + nl + el + cl; }
    const read = async name => { const f = files[name]; if (!f) return null; const nl = dv.getUint16(f.lo + 26, true), el = dv.getUint16(f.lo + 28, true), data = u8.subarray(f.lo + 30 + nl + el, f.lo + 30 + nl + el + f.csz);
      if (f.method === 0) return td.decode(data); const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(data); w.close(); return await new Response(ds.readable).text(); };
    const xml = t => new DOMParser().parseFromString(t, 'application/xml'), ssx = await read('xl/sharedStrings.xml'), strs = ssx ? [...xml(ssx).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
    const sheet = Object.keys(files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0]; if (!sheet) throw new Error('в файле Excel нет листа');
    const rows = []; for (const r of xml(await read(sheet)).getElementsByTagName('row')) { const row = []; for (const c of r.getElementsByTagName('c')) { const col = [...(c.getAttribute('r') || '').replace(/\d/g, '')].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1, t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], is = c.getElementsByTagName('is')[0];
        row[col] = t === 's' ? strs[+v.textContent] : t === 'inlineStr' ? (is ? is.textContent : '') : v ? (t === 'str' ? v.textContent : +v.textContent) : ''; } rows.push(row); }
    return rows; }
  async function fromFile(file) { const buf = await file.arrayBuffer(); if (/\.xlsx$/i.test(file.name)) return fromRows(await fromXlsx(buf), file.name);
    let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1251').decode(buf); } return fromRows(fromCsv(text), file.name); }
  function template() { const h = ['ВЭУ', 'Дорога начало', 'Дорога конец', 'Площадка начало', 'Площадка конец', 'Фундамент начало', 'Фундамент конец', 'Башня на площадке', 'Гондола на площадке', 'Лопасти на площадке', 'Монтаж начало', 'Монтаж конец', 'Кабель начало', 'Кабель конец', 'Пуск'];
    return '﻿' + [['Дата отчёта', 'дд.мм.гггг'], ['Подстанция, % готовности', ''], ['ВЛ до ПС Жамбыл, % готовности', ''], ['ВЛ до ПС Кентау, % готовности', ''], ['Накопитель, % готовности', ''], h, ...SITE.wtg.map(w => [w[0], ...h.slice(1).map(() => '')])].map(r => r.join(';')).join('\r\n'); }
  window.FACTIO = { fromRows, fromCsv, fromXlsx, fromFile, template };
})();
