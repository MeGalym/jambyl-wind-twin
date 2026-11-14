/* Техническая модель ветропарка Jambyl 1000 МВт.
   Из документов проекта:
   — 140 ВЭУ и их координаты (L14); в чертеже фундамента 104218-CI-DW-040 нагрузки по SANY SI-19580, ось 110 м;
   — подстанция 220/35 кВ (ведомость HV-AIS): 4 трансформатора ВЭС и 2 трансформатора СНЭ по 264/330 МВА,
     ОРУ 220 кВ на 14 ячеек, 37 фидеров ВЭС и 16 фидеров СНЭ на 35 кВ, 20 установок компенсации на 800 МВАр;
   — СНЭ 300 МВт / 600 МВт·ч (отчёт 104218-EL-RP-050): 141 контейнер по 5016 кВт·ч, 70 станций 5,5 МВА и одна 2,75 МВА,
     готовность 98 %, таблица деградации, дозаполнение по 12 контейнеров каждые 5 лет;
   — три двухцепные ВЛ 220 кВ: две до ПС Жамбыл по 142 км, одна до ПС Кентау 162 км; сечения кабеля из BOQ; готовность ВЭУ 97 %.
   Допущения: мощность одной ВЭУ принята 1000 МВт / 140, кривая мощности типовая, ветровой отчёт не приложен —
   роза ветров и распределение Вейбулла заданы; КПД цикла СНЭ 88 %; разбивка ВЭУ по фидерам расчётная. */
(function () {
  const SITE = window.SITE, N = SITE.wtg.length, RAD = Math.PI / 180;
  const T = { rated: 7150, D: 195, hub: 110, cutIn: 3, cutOut: 25, storm: 22, cp: 0.46, eff: 0.935, tsr: 9.4, rpmMin: 4.6, rpmMax: 8.9, kWake: 0.075, model: 'SANY SI-19580' };
  const AREA = Math.PI * T.D * T.D / 4, R = T.D / 2;
  const EL = { kv: 35, cosphi: 0.98, r: { 300: 0.130, 400: 0.102, 500: 0.0803, 800: 0.0530 }, trafos: 4, trafoMva: 330, trNoLoad: 0.0005, trLoad: 0.003, sections: [4, 4, 5, 5, 4, 5, 5, 5],
    ais: { bays: 14, line: 6, tr: 6, bus: 4000 }, svg: { n: 20, mvar: 800 }, ssCost: 168.6,
    ohl: [['ВЛ 220 кВ Жамбыл, линия 1', 142], ['ВЛ 220 кВ Жамбыл, линия 2', 142], ['ВЛ 220 кВ Кентау', 162]], ohlR: 0.06 };
  const BESS = { mw: 300, mwh: 600, encl: 141, q: 5.016, mvs: 71, mvsMva: 5.5, loops: 24, feeders: 16, trafos: 2, trafoMva: 330, avail: 0.98, rte: 0.88, auxOp: (141 * 37.5 + 70 * 20.6 + 10.3) / 1000, auxSb: (141 * 4 + 71 * 2.7) / 1000,
    soh: [95.32, 93.16, 90.69, 88.67, 86.89, 85.28, 83.78, 82.37, 81.04, 79.77, 78.55, 77.38, 76.24, 75.15, 74.08, 73.04, 72.03, 71.04, 70.07, 69.12, 68.19, 65.66, 64.41, 63.15, 61.90, 60.64], aug: [[0, 141], [5, 12], [10, 12], [15, 12], [20, 12]] };
  // полезная ёмкость по годам: сумма по очередям N × Q × готовность × глубина разряда × состояние батареи
  BESS.capacity = year => BESS.aug.reduce((s, [y, n]) => year >= y ? s + n * BESS.q * BESS.avail * BESS.soh[Math.min(25, Math.round(year - y))] / 100 : s, 0);
  BESS.count = year => BESS.aug.reduce((s, [y, n]) => year >= y ? s + n : s, 0);

  const X = new Float32Array(N), Z = new Float32Array(N), feeder = new Uint8Array(N), fpos = new Uint8Array(N), route = new Float32Array(N), elev = new Float32Array(N).fill(1100);
  SITE.wtg.forEach((w, i) => { X[i] = w[1]; Z[i] = w[2]; feeder[i] = w[5]; fpos[i] = w[6]; route[i] = w[7]; });
  const NF = Math.max(...feeder) + 1, feeders = Array.from({ length: NF }, () => []);
  for (let i = 0; i < N; i++) feeders[feeder[i]].push(i);
  feeders.forEach(f => f.sort((a, b) => fpos[a] - fpos[b]));           // от дальней ВЭУ к подстанции
  const feederTr = new Uint8Array(NF); { let f = 0; EL.sections.forEach((n, s) => { for (let k = 0; k < n && f < NF; k++) feederTr[f++] = s >> 1; }); }   // секции 35 кВ по две на трансформатор

  const density = (h, tC) => 101325 * Math.pow(1 - 2.25577e-5 * h, 5.25588) / (287.05 * (tC + 273.15));
  function power(v, rho) {                                               // кривая мощности с поправкой на плотность воздуха, кВт
    if (v < T.cutIn || v >= T.cutOut) return 0;
    const cp = T.cp * (1 - Math.exp(-(v - 2.4) / 1.1)), p = Math.min(T.rated, 0.5 * rho * AREA * cp * v * v * v * T.eff / 1000);
    return v > T.storm ? p * (T.cutOut - v) / (T.cutOut - T.storm) : p;
  }
  const ratedSpeed = rho => Math.cbrt(T.rated * 1000 / (0.5 * rho * AREA * T.cp * T.eff));
  const ct = (v, rho) => { const vr = ratedSpeed(rho); return v < T.cutIn || v >= T.cutOut ? 0.05 : v <= vr ? 0.80 : Math.max(0.06, 0.80 * Math.pow(vr / v, 2.6)); };
  const rpm = v => v < T.cutIn || v >= T.cutOut ? 0.3 : Math.max(T.rpmMin, Math.min(T.rpmMax, 60 * T.tsr * v / (Math.PI * T.D)));
  const pitch = (v, rho) => { const vr = ratedSpeed(rho); return v >= T.cutOut ? 88 : v <= vr ? 0 : Math.min(30, 3.4 * Math.pow(v - vr, 0.8)); };

  /* следы по Йенсену: дефицит скорости от каждой ВЭУ с наветренной стороны, сложение по квадратам */
  const order = new Uint16Array(N), s = new Float32Array(N), c = new Float32Array(N), sum2 = new Float32Array(N);
  function wake(dirDeg, vFree, rho, running, vOut, defOut) {
    const fx = -Math.sin(dirDeg * RAD), fz = Math.cos(dirDeg * RAD);
    for (let i = 0; i < N; i++) { s[i] = X[i] * fx + Z[i] * fz; c[i] = X[i] * fz - Z[i] * fx; order[i] = i; sum2[i] = 0; }
    order.sort((a, b) => s[a] - s[b]);
    for (let a = 0; a < N; a++) {
      const i = order[a], d = Math.sqrt(sum2[i]), v = vFree[i] * (1 - Math.min(0.6, d)); vOut[i] = v; defOut[i] = Math.min(0.6, d);
      const k0 = 1 - Math.sqrt(1 - (running[i] ? ct(v, rho[i]) : 0.05));
      for (let b = a + 1; b < N; b++) {
        const j = order[b], dx = s[j] - s[i]; if (dx > 60 * T.D) break; if (dx < 1) continue;
        const dy = Math.abs(c[j] - c[i]), rw = R + T.kWake * dx; if (dy >= rw + R) continue;
        const ov = Math.min(1, (rw + R - dy) / (2 * R)), def = k0 * (R / rw) * (R / rw) * ov; sum2[j] += def * def;
      }
    }
  }

  /* сеть 35 кВ, трансформаторы, ВЛ */
  const section = n => n <= 1 ? 300 : n === 2 ? 400 : n === 3 ? 500 : 800;
  function collect(pw, tripped, trOut) {          // pw — мощность ВЭУ, кВт; trOut — номер отключённого трансформатора ВЭС или -1
    let mvLoss = 0; const fP = new Float32Array(NF), trP = new Float32Array(EL.trafos);
    for (let f = 0; f < NF; f++) {
      if (tripped && tripped[f]) continue; let p = 0; const m = feeders[f];
      for (let k = 0; k < m.length; k++) {
        p += pw[m[k]]; const len = Math.max(250, k + 1 < m.length ? route[m[k]] - route[m[k + 1]] : route[m[k]]) / 1000;
        const I = p / (Math.sqrt(3) * EL.kv * EL.cosphi), loss = 3 * I * I * EL.r[section(k + 1)] * len / 1000; mvLoss += loss; p -= loss;
      }
      fP[f] = Math.max(0, p); trP[feederTr[f]] += fP[f];
    }
    if (trOut >= 0) { const move = trP[trOut] / (EL.trafos - 1); trP[trOut] = 0; for (let k = 0; k < EL.trafos; k++) if (k !== trOut) trP[k] += move; }   // нагрузка переводится через секционные выключатели 35 кВ
    let trLoss = 0, over = 0; const trLoad = Array.from(trP, (p, k) => { if (k === trOut) return 0; const l = p / 1000 / EL.cosphi / EL.trafoMva; if (p > 0) trLoss += (EL.trNoLoad + EL.trLoad * l * l) * EL.trafoMva * 1000; if (l > 1) over += (l - 1) * EL.trafoMva * EL.cosphi * 1000; return l; });
    const atSs = trP.reduce((a, b) => a + b, 0);
    return { fP, mvLoss, trLoss, hv: Math.max(0, atSs - trLoss - over), trLoad, over };
  }
  function ohl(exportKw, out) {                    // потери в ВЛ за точкой учёта: ток делится между линиями обратно пропорционально длине
    const w = EL.ohl.map((l, i) => i === out ? 0 : 1 / l[1]), ws = w.reduce((a, b) => a + b, 0); let loss = 0;
    const lines = EL.ohl.map((l, i) => { const p = exportKw * w[i] / ws, I = p / 2 / (Math.sqrt(3) * 220 * EL.cosphi), ls = 2 * 3 * I * I * EL.ohlR * l[1] / 1000; loss += ls; return { name: l[0], km: l[1], mw: p / 1000, loss: ls / 1000, out: i === out, amp: I }; });
    return { lines, loss };
  }

  /* ветровой климат площадки (допущение) и годовая выработка */
  const ROSE = [[0, .05, 7.4], [30, .12, 8.6], [60, .20, 9.3], [90, .14, 8.9], [120, .06, 7.6], [150, .04, 7.0], [180, .05, 7.2], [210, .09, 8.2], [240, .12, 8.8], [270, .07, 8.0], [300, .03, 7.0], [330, .03, 7.0]], KW = 2.1;
  let AEP = null;
  function aep(avail) {
    if (!AEP) {
      const rho = new Float32Array(N), vf = new Float32Array(N), run = new Uint8Array(N).fill(1), v = new Float32Array(N), d = new Float32Array(N), pw = new Float32Array(N);
      const hm = elev.reduce((a, b) => a + b, 0) / N; for (let i = 0; i < N; i++) rho[i] = density(elev[i] + T.hub, 9);
      let gross = 0, waked = 0, hv = 0; const sect = [];
      for (const [dir, f, A] of ROSE) {
        let g = 0, w = 0;
        for (let u = 3; u <= 25; u++) {
          const prob = f * (Math.exp(-Math.pow((u - .5) / A, KW)) - Math.exp(-Math.pow((u + .5) / A, KW))) * 8760 / 3;
          for (const dd of [-10, 0, 10]) {
            let pg = 0, pwk = 0;
            for (let i = 0; i < N; i++) { vf[i] = u * speedUp(elev[i], hm); pg += power(vf[i], rho[i]); }
            wake(dir + dd, vf, rho, run, v, d);
            for (let i = 0; i < N; i++) { pw[i] = power(v[i], rho[i]); pwk += pw[i]; }
            g += pg * prob; w += pwk * prob; hv += collect(pw, null, -1).hv * prob;
          }
        }
        gross += g; waked += w; sect.push({ dir, f, A, gross: g / 1e6, net: w / 1e6 });
      }
      AEP = { gross: gross / 1e6, waked: waked / 1e6, hv: hv / 1e6, sect };   // ГВт·ч
    }
    const other = 0.02, a = avail ?? 0.97, net = AEP.hv * a * (1 - other);
    return { ...AEP, net, cf: net * 1000 / (N * T.rated / 1000 * 8760), steps: [['Без потерь', AEP.gross], ['Следы соседних ВЭУ', AEP.waked - AEP.gross], ['Кабели 35 кВ и трансформаторы', AEP.hv - AEP.waked], ['Готовность ' + Math.round(a * 100) + ' %', AEP.hv * (a - 1)], ['Прочие потери 2 %', -AEP.hv * a * other]] };
  }
  const speedUp = (h, hm) => Math.max(0.9, Math.min(1.12, 1 + 0.0012 * (h - hm)));     // упрощённое ускорение потока на возвышениях

  /* суточный ход ветра для режима эксплуатации */
  const DAYS = { calm: ['Слабый ветер', 4.6, 1.5], normal: ['Обычный день', 8.4, 2.2], strong: ['Сильный ветер', 13.5, 2.5], storm: ['Буря', 21.5, 4.2] };
  function windAt(min, day) {
    const h = min / 60, [, base, amp] = DAYS[day];
    return { v: Math.max(0.5, base + amp * Math.sin(2 * Math.PI * (h - 9) / 24) + 0.45 * amp * Math.sin(2 * Math.PI * h / 5.3 + 1) + 0.2 * amp * Math.sin(2 * Math.PI * h / 1.7)),
      dir: (62 + 20 * Math.sin(2 * Math.PI * (h - 4) / 24) + 9 * Math.sin(2 * Math.PI * h / 6) + 360) % 360, temp: 11 + 7 * Math.cos(2 * Math.PI * (h - 15) / 24) };
  }
  window.WIND = { T, EL, BESS, N, NF, X, Z, feeder, fpos, route, elev, feeders, feederTr, density, power, ratedSpeed, ct, rpm, pitch, wake, collect, ohl, section, aep, speedUp, ROSE, KW, DAYS, windAt, resetAep: () => { AEP = null; } };
})();
