// Пульт поверх сцены: главная цифра, ветер, показатели, узлы и подшипники, карточка, режимы, разборка, камеры, выноски.
import { NOM, BEARINGS, LIMITS } from './model.js';
import { UNITS } from './machine.js';

const fmt = (v, d = 0) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
const ST = { ok: 'норма', warn: 'предупреждение', alarm: 'тревога' };
const INFO = {     // строки карточки узла; звёздочка — принято, документа нет
  fnd: () => [['Плита', 'Ø26 м'], ['Подколонник', 'Ø6,6 м'], ['Бетон', '680,5 м³'], ['в том числе C35/45', '636,6 м³'], ['Арматура S500', '81,8 т']],
  anchor: () => [['Анкерные болты', '2 × 100 шт'], ['Кольца', 'Ø4,78 и Ø4,35 м']],
  tower: () => [['Высота оси ротора', '110 м'], ['Диаметр у основания', '4,56 м'], ['Диаметр вверху', '3,3 м*'], ['Секций', '5*']],
  yaw: () => [['Приводов поворота', '6*'], ['Назначение', 'разворот гондолы к ветру']],
  bed: () => [['Конструкция', 'литая рама*']],
  shaft: s => [['Момент', fmt(s.torque) + ' кН·м'], ['Обороты', fmt(s.rpm, 1) + ' об/мин'], ['Осевая сила ветра', fmt(s.thrust) + ' кН']],
  gear: s => [['Передаточное число', '1 : ' + NOM.gearRatio + '*'], ['Температура масла', fmt(s.tGear) + ' °C*'], ['Обороты на выходе', fmt(s.genRpm) + ' об/мин*']],
  brake: () => [['Тип', 'дисковый, на быстроходном валу*']],
  gen: s => [['Мощность', fmt(s.p / 1000, 2) + ' МВт'], ['Обороты', fmt(s.genRpm) + ' об/мин*'], ['Температура обмотки', fmt(s.tGen) + ' °C*']],
  conv: s => [['Температура', fmt(s.tConv) + ' °C*'], ['Тип', 'в документах не указан']],
  trf: s => [['Напряжение сети парка', '35 кВ'], ['Температура', fmt(s.tTrf) + ' °C*']],
  cool: s => [['Воздух снаружи', fmt(s.tAir) + ' °C']],
  cover: () => [['Длина', '≈ 13,5 м*'], ['Диаметр', '≈ 5,2 м*']],
  hub: s => [['Угол лопастей', fmt(s.pitch) + '°'], ['Приводов поворота лопастей', '3*']],
  blades: s => [['Диаметр ротора', NOM.rotorD + ' м'], ['Длина лопасти', '≈ ' + fmt(NOM.bladeL) + ' м*'], ['Скорость законцовки', fmt(s.tip) + ' м/с']],
};

export function buildConsole(app, L, on) {
  const el = document.createElement('div'); el.id = 'hud'; app.appendChild(el);
  el.innerHTML = `
  <section class="pn" id="p-main"><div class="ttl"><b id="c-wtg"></b><span>${NOM.model}, ротор ${NOM.rotorD} м, ось ${NOM.hubH} м</span></div>
    <div class="big"><b id="c-p">0</b><span>МВт</span></div><div class="sub" id="c-load"></div>
    <label class="sl">Ветер на оси<output id="c-v"></output><input id="c-wind" type="range" min="0" max="28" step="0.1"></label>
    <dl class="kv" id="c-kv"></dl></section>
  <section class="pn" id="p-list"><h3>Подшипники<span class="pill" id="c-bpill"></span></h3><div id="c-bear"></div><h3 style="margin-top:12px">Узлы</h3><div id="c-units"></div></section>
  <section class="pn" id="p-card" hidden></section>
  <section class="pn" id="p-bar"><div class="seg" id="c-modes">${[['out', 'Снаружи'], ['cut', 'Разрез'], ['open', 'Без кожуха'], ['glass', 'Стекло']].map(m => `<button data-m="${m[0]}">${m[1]}</button>`).join('')}</div>
    <label class="sl ex">Разборка<input id="c-ex" type="range" min="0" max="100" step="1" value="0"></label>
    <div class="seg" id="c-cams">${[['nac', 'Гондола'], ['rot', 'Ротор'], ['all', 'Вся ВЭУ'], ['fnd', 'Фундамент']].map(m => `<button data-c="${m[0]}">${m[1]}</button>`).join('')}</div></section>
  <button class="pn" id="c-toggle">Узлы</button>
  <p id="c-note">* принято: паспорта ВЭУ в документах проекта нет. Высота оси, фундамент и анкерная корзина — по чертежу 104218-CI-DW-040. Температуры и вибрация — расчётные, SCADA не подключена.</p>
  <div id="tags"></div>`;
  const $ = q => el.querySelector(q);
  $('#c-units').innerHTML = UNITS.map(u => `<button class="row" data-u="${u[0]}"><span>${u[1]}</span></button>`).join('');
  $('#c-wind').addEventListener('input', e => on.wind(+e.target.value));
  $('#c-ex').addEventListener('input', e => on.explode(+e.target.value / 100));
  $('#c-modes').addEventListener('click', e => { const b = e.target.closest('button'); if (b) on.mode(b.dataset.m); });
  $('#c-cams').addEventListener('click', e => { const b = e.target.closest('button'); if (b) on.cam(b.dataset.c); });
  $('#c-units').addEventListener('click', e => { const b = e.target.closest('button'); if (b) on.pick(b.dataset.u, null); });
  $('#c-bear').addEventListener('click', e => { const b = e.target.closest('button'); if (b) on.pick(b.dataset.unit, b.dataset.b); });
  $('#p-card').addEventListener('click', e => { if (e.target.closest('.x')) on.pick(null, null); });
  $('#c-toggle').addEventListener('click', () => { el.classList.toggle('open'); dispatchEvent(new Event('resize')); });
  const tagEls = {}; for (const u of UNITS) { const t = document.createElement('button'); t.className = 'tag'; t.textContent = u[1]; t.onclick = () => on.pick(u[0], null); $('#tags').appendChild(t); tagEls[u[0]] = t; }

  let lastKey = '';
  function update(s, bst) {
    $('#c-wtg').textContent = L.wtg; $('#c-p').textContent = fmt(s.p / 1000, 2); $('#c-v').textContent = fmt(s.v, 1) + ' м/с'; if (document.activeElement !== $('#c-wind')) $('#c-wind').value = s.v;
    $('#c-load').textContent = !s.run ? (s.v >= NOM.cutOut ? 'остановлена: ветер сильнее 25 м/с' : 'ждёт ветра: меньше 3 м/с') : `${fmt(s.load * 100)} % от ${fmt(NOM.ratedKw / 1000, 2)} МВт, номинал с ${fmt(s.vRated, 1)} м/с`;
    $('#c-kv').innerHTML = [['Обороты ротора', fmt(s.rpm, 1) + ' об/мин'], ['Угол лопастей', fmt(s.pitch) + '°'], ['Момент на валу', fmt(s.torque) + ' кН·м'], ['Обороты генератора', fmt(s.genRpm) + ' об/мин*'], ['Скорость законцовки', fmt(s.tip) + ' м/с'], ['Осевая сила на ротор', fmt(s.thrust) + ' кН']].map(r => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('');
    const worst = bst.some(b => b.st === 'alarm') ? 'alarm' : bst.some(b => b.st === 'warn') ? 'warn' : 'ok'; $('#c-bpill').className = 'pill ' + worst; $('#c-bpill').textContent = worst === 'ok' ? 'все в норме' : ST[worst];
    $('#c-bear').innerHTML = bst.map(b => `<button class="row b ${b.st} ${L.selB === b.id ? 'sel' : ''}" data-b="${b.id}" data-unit="${b.unit}"><i></i><span><b>${b.id}</b> ${b.name}</span><em>${fmt(b.t)} °C · ${fmt(b.vib, 1)} мм/с</em></button>`).join('');
    for (const b of el.querySelectorAll('#c-units .row')) b.classList.toggle('sel', b.dataset.u === L.sel && !L.selB);
    for (const b of el.querySelectorAll('#c-modes button')) b.classList.toggle('on', b.dataset.m === L.mode);
    for (const b of el.querySelectorAll('#c-cams button')) b.classList.toggle('on', b.dataset.c === L.cam);
    if (document.activeElement !== $('#c-ex')) $('#c-ex').value = Math.round(L.eT * 100);
    const card = $('#p-card'); if (!L.sel) { card.hidden = true; lastKey = ''; return; } card.hidden = false;
    const u = UNITS.find(x => x[0] === L.sel), b = L.selB && bst.find(x => x.id === L.selB);
    const rows = b ? [['Состояние', ST[b.st], b.st], ['Температура', fmt(b.t) + ' °C*'], ['Уставки температуры', `${LIMITS.tWarn} / ${LIMITS.tAlarm} °C*`], ['Вибрация', fmt(b.vib, 1) + ' мм/с*'], ['Уставки вибрации', `${fmt(LIMITS.vWarn, 1)} / ${fmt(LIMITS.vAlarm, 1)} мм/с*`], ['Теги SCADA', b.tag ? 'получены' : 'не подключены']] : (INFO[L.sel] ? INFO[L.sel](s) : []);
    const html = `<div class="ch"><b>${b ? b.id + ' · ' + b.name : u[1]}</b><button class="x" aria-label="Закрыть">×</button></div><dl class="kv">${rows.map(r => `<dt>${r[0]}</dt><dd class="${r[2] || ''}">${r[1]}</dd>`).join('')}</dl>`;
    if (html !== lastKey) { card.innerHTML = html; lastKey = html; }
  }
  // выноски: показываются, когда машина раскрыта; прячутся под панелями
  function tags(project, show) {
    const busy = [...el.querySelectorAll('.pn')].filter(p => !p.hidden && p.offsetParent).map(p => p.getBoundingClientRect());
    const placed = [];
    const list = UNITS.map(u => ({ u, t: tagEls[u[0]], p: show ? project(u[0]) : null })).sort((a, b) => (a.p ? a.p.y : 0) - (b.p ? b.p.y : 0));
    for (const { u, t, p } of list) { let vis = !!p && p.z < 1 && p.x > 8 && p.x < innerWidth - 8 && p.y > 8 && p.y < innerHeight - 8;
      if (vis) vis = !busy.some(r => p.x > r.left - 60 && p.x < r.right + 60 && p.y > r.top - 16 && p.y < r.bottom + 16);
      if (vis) { const w = u[1].length * 6.6 + 22; let y = p.y, n = 0; p.x = Math.max(w / 2 + 8, Math.min(innerWidth - w / 2 - 8, p.x));      // подписи не наезжают друг на друга: сдвиг вниз
        while (n++ < 10 && placed.some(q => Math.abs(q.x - p.x) < (q.w + w) / 2 + 6 && Math.abs(q.y - y) < 24)) y += 24;
        if (y > innerHeight - 8 || busy.some(r => p.x > r.left - 60 && p.x < r.right + 60 && y > r.top - 16 && y < r.bottom + 16)) vis = false; else { placed.push({ x: p.x, y, w }); p.y = y; } }
      t.style.display = vis ? '' : 'none'; if (vis) { t.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)`; t.classList.toggle('sel', L.sel === u[0]); } }
  }
  return { update, tags, el };
}
