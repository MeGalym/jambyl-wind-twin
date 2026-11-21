// Стройка ВЭУ: панель шагов и управление. Сцену ставит machine.build(b); здесь только шкала b = 0…10, подписи и даты.
import { NOM } from './model.js';
const F = NOM.fnd;
export const STEPS = [
  ['Подъезд', 'Дорога подходит к месту ВЭУ: по ней пойдут бетон, кран и секции башни.'],
  ['Монтажная площадка', 'Уплотнённая площадка под кран и раскладку секций, гондолы и лопастей.'],
  ['Котлован и арматура', `Котлован глубиной ${String(F.depth).replace('.', ',')} м, арматура ${String(F.steelT).replace('.', ',')} т, анкерная корзина на ${F.bolts} болтов.`],
  ['Бетонирование фундамента', `Плита Ø${F.slabD} м, ${String(F.concrete).replace('.', ',')} м³ бетона. Затем набор прочности и обратная засыпка.`],
  ['Башня: нижние и средние секции', `Секции 1–3 из ${NOM.towerSections}. Башня стальная коническая, у основания Ø${String(NOM.towerBaseD).replace('.', ',')} м.`],
  ['Башня: верхняя секция', `Секции 4–${NOM.towerSections}: верх башни подходит под ось ротора на ${NOM.hubH} м.`],
  ['Гондола и ступица', 'Гондола с редуктором, генератором и трансформатором, затем ступица.'],
  ['Лопасти', `Три лопасти по ${String(NOM.bladeL).replace('.', ',')} м ставят по одной: ротор проворачивают между подъёмами.`],
  ['Кабель 35 кВ', 'Траншея и кабель от ВЭУ к подстанции, оптика и заземление.'],
  ['Пусконаладка и пуск', 'Проверки, синхронизация с сетью, пробный пуск. Кран уходит к следующей ВЭУ.'],
];
export function buildPanel(hud, cfg, on) {
  const el = document.createElement('div'); el.id = 'bld'; hud.appendChild(el); const now = cfg.now, has = cfg.f.length === 10;
  el.innerHTML = `<section class="pn" id="b-main"><div class="ttl"><b>${cfg.wtg} · стройка</b><span>${NOM.model}, ротор ${NOM.rotorD} м, ось ${NOM.hubH} м${cfg.d ? ' · на ' + cfg.d : ''}</span></div>
      <div class="bstep"><em id="b-n"></em><b id="b-t"></b><p id="b-d"></p></div><dl class="kv" id="b-kv"></dl><p class="bst" id="b-st"></p></section>
    <section class="pn" id="b-list"><h3>Шаги стройки<span class="pill" id="b-pill"></span></h3><div id="b-rows">${STEPS.map((s, k) => `<button class="row bs" data-s="${k}"><i></i><span>${k + 1}. ${s[0]}</span><em>${has ? cfg.f[k] : ''}</em></button>`).join('')}</div></section>
    <section class="pn" id="b-bar"><button class="bb" data-b="start">С начала</button><button class="bb main" data-b="play" id="b-play">▶ Показать стройку</button>
      <label class="sl bsl"><span>Ход стройки</span><input id="b-range" type="range" min="0" max="10" step="0.01"><i id="b-now" style="left:${now * 10}%" title="Состояние на дату"></i></label>
      <button class="bb" data-b="now">${has ? 'На дату' : 'Готовая ВЭУ'}</button><button class="bb" data-b="exit">Узлы турбины</button></section>`;
  const $ = q => el.querySelector(q); let last = -1, lastPlay = null;
  el.addEventListener('click', e => { const s = e.target.closest('[data-s]'), b = e.target.closest('[data-b]'); if (s) on.jump(+s.dataset.s); else if (b) on.act(b.dataset.b); });
  $('#b-range').addEventListener('input', e => on.seek(+e.target.value));
  return { el, update(b, playing) { if (Math.abs(b - last) < .004 && playing === lastPlay) return; last = b; lastPlay = playing; const k = Math.min(9, Math.floor(b)), p = b >= 10 ? 1 : b - k, r = $('#b-range');
      if (document.activeElement !== r) r.value = b; r.style.setProperty('--p', b * 10 + '%'); $('#b-play').textContent = playing ? '❚❚ Пауза' : b >= 10 ? '↺ Ещё раз' : '▶ Показать стройку';
      $('#b-n').textContent = b >= 10 ? 'ВЭУ в работе' : `Шаг ${k + 1} из 10 · ${Math.round(p * 100)} %`; $('#b-t').textContent = STEPS[k][0]; $('#b-d').textContent = STEPS[k][1];
      $('#b-kv').innerHTML = has ? `<dt>${k < Math.floor(now) ? 'Сделано' : 'Прогноз'}</dt><dd>${cfg.f[k]}</dd><dt>По плану</dt><dd>${cfg.pl[k] || '—'}</dd>` : ''; $('#b-st').textContent = has ? (now >= 10 ? 'На дату ВЭУ в работе.' : 'На дату: шаг ' + (Math.floor(now) + 1) + ' — ' + STEPS[Math.min(9, Math.floor(now))][0].toLowerCase() + '.') : '';
      $('#b-pill').textContent = has ? `сделано ${Math.min(10, Math.floor(now))} из 10` : '';
      el.querySelectorAll('.bs').forEach((x, j) => { x.classList.toggle('sel', j === k && b < 10); x.classList.toggle('done', j < Math.floor(now + 1e-6)); x.classList.toggle('cur', j === Math.floor(now) && now < 10); }); } };
}
