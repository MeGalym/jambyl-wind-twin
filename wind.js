/* Техническая модель ветропарка Jambyl 1000 МВт.
   Из документов проекта: 140 ВЭУ и их координаты (L14), подстанция 33/220 кВ, СНЭ 600 МВт·ч, три двухцепные ВЛ 220 кВ
   (две до ПС Жамбыл по 142 км, одна до ПС Кентау 162 км), сечения кабеля 33 кВ из BOQ, гарантия готовности 97 %.
   Допущения (в RFP модель ВЭУ выбирает поставщик, ветровой отчёт не приложен): ВЭУ 7,15 МВт с ротором 182 м и осью 120 м,
   роза ветров и распределение Вейбулла, число и мощность трансформаторов, мощность СНЭ 150 МВт. */
(function () {
  const SITE = window.SITE, N = SITE.wtg.length, RAD = Math.PI / 180;
  const T = { rated: 7150, D: 182, hub: 120, cutIn: 3, cutOut: 25, storm: 22, cp: 0.47, eff: 0.935, tsr: 9.2, rpmMin: 5.0, rpmMax: 9.6, kWake: 0.075 };
  const AREA = Math.PI * T.D * T.D / 4, R = T.D / 2;
  const EL = { kv: 33, cosphi: 0.98, r: { 300: 0.130, 400: 0.102, 500: 0.0803, 800: 0.0530 }, trafos: 4, trafoMva: 280, trNoLoad: 0.0005, trLoad: 0.003,
    bessMwh: 600, bessMw: 150, ohl: [['ВЛ 220 кВ Жамбыл, линия 1', 142], ['ВЛ 220 кВ Жамбыл, линия 2', 142], ['ВЛ 220 кВ Кентау', 162]], ohlR: 0.06 };
  const X = new Float32Array(N), Z = new Float32Array(N), feeder = new Uint8Array(N), fpos = new Uint8Array(N), route = new Float32Array(N), elev = new Float32Array(N).fill(1100);
  SITE.wtg.forEach((w, i) => { X[i] = w[1]; Z[i] = w[2]; feeder[i] = w[5]; fpos[i] = w[6]; route[i] = w[7]; });
  const NF = Math.max(...feeder) + 1, feeders = Array.from({ length: NF }, () => []);
  for (let i = 0; i < N; i++) feeders[feeder[i]].push(i);
  feeders.forEach(f => f.sort((a, b) => fpos[a] - fpos[b]));           // от дальней ВЭУ к подстанции

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

  /* сеть 33 кВ, трансформаторы, ВЛ */
  const section = n => n <= 1 ? 300 : n === 2 ? 400 : n === 3 ? 500 : 800;
  function collect(pw, tripped) {                 // pw — мощность ВЭУ на выводах, кВт
    let mvLoss = 0, atSs = 0; const fP = new Float32Array(NF);
    for (let f = 0; f < NF; f++) {
      if (tripped && tripped[f]) continue; let p = 0; const m = feeders[f];
      for (let k = 0; k < m.length; k++) {
        p += pw[m[k]]; const len = Math.max(250, k + 1 < m.length ? route[m[k]] - route[m[k + 1]] : route[m[k]]) / 1000;
        const I = p / (Math.sqrt(3) * EL.kv * EL.cosphi), loss = 3 * I * I * EL.r[section(k + 1)] * len / 1000; mvLoss += loss; p -= loss;
      }
      fP[f] = Math.max(0, p); atSs += fP[f];
    }
    const perTr = atSs / EL.trafos / 1000 / EL.cosphi, trLoss = atSs > 0 ? EL.trafos * (EL.trNoLoad + EL.trLoad * Math.pow(perTr / EL.trafoMva, 2)) * EL.trafoMva * 1000 : 0;
    return { fP, mvLoss, trLoss, hv: Math.max(0, atSs - trLoss), trLoad: perTr / EL.trafoMva };
  }
  function ohl(exportKw) {                         // потери в ВЛ за точкой учёта: шесть цепей, ток делится обратно пропорционально длине
    const w = EL.ohl.map(l => 1 / l[1]), ws = w.reduce((a, b) => a + b, 0); let loss = 0;
    const lines = EL.ohl.map((l, i) => { const p = exportKw * w[i] / ws, I = p / 2 / (Math.sqrt(3) * 220 * EL.cosphi), ls = 2 * 3 * I * I * EL.ohlR * l[1] / 1000; loss += ls; return { name: l[0], km: l[1], mw: p / 1000, loss: ls / 1000 }; });
    return { lines, loss };
  }

  /* ветровой климат площадки (допущение) и годовая выработка */
  const ROSE = [[0, .05, 7.4], [30, .12, 8.6], [60, .20, 9.3], [90, .14, 8.9], [120, .06, 7.6], [150, .04, 7.0], [180, .05, 7.2], [210, .09, 8.2], [240, .12, 8.8], [270, .07, 8.0], [300, .03, 7.0], [330, .03, 7.0]], KW = 2.1;
  let AEP = null;
  function aep(avail) {
    if (!AEP) {
      const rho = new Float32Array(N), vf = new Float32Array(N), run = new Uint8Array(N).fill(1), v = new Float32Array(N), d = new Float32Array(N), pw = new Float32Array(N);
      const hm = elev.reduce((a, b) => a + b, 0) / N; for (let i = 0; i < N; i++) rho[i] = density(elev[i] + T.hub, 9);
      let gross = 0, waked = 0, hv = 0; const sect = [], perT = new Float32Array(N);
      for (const [dir, f, A] of ROSE) {
        let g = 0, w = 0;
        for (let u = 3; u <= 25; u++) {
          const prob = f * (Math.exp(-Math.pow((u - .5) / A, KW)) - Math.exp(-Math.pow((u + .5) / A, KW))) * 8760 / 3;
          for (const dd of [-10, 0, 10]) {
            let pg = 0, pwk = 0;
            for (let i = 0; i < N; i++) { vf[i] = u * speedUp(elev[i], hm); pg += power(vf[i], rho[i]); }
            wake(dir + dd, vf, rho, run, v, d);
            for (let i = 0; i < N; i++) { pw[i] = power(v[i], rho[i]); pwk += pw[i]; perT[i] += pw[i] * prob; }
            g += pg * prob; w += pwk * prob; hv += collect(pw).hv * prob;
          }
        }
        gross += g; waked += w; sect.push({ dir, f, A, gross: g / 1e6, net: w / 1e6 });
      }
      AEP = { gross: gross / 1e6, waked: waked / 1e6, hv: hv / 1e6, sect, perT: Array.from(perT, x => x / 1e6) };   // ГВт·ч
    }
    const other = 0.02, net = AEP.hv * (avail ?? 0.97) * (1 - other);
    return { ...AEP, net, cf: net * 1000 / (N * T.rated / 1000 * 8760), steps: [['Без потерь', AEP.gross], ['Следы соседних ВЭУ', AEP.waked - AEP.gross], ['Кабели 33 кВ и трансформаторы', AEP.hv - AEP.waked], ['Готовность ' + Math.round((avail ?? 0.97) * 100) + ' %', AEP.hv * ((avail ?? 0.97) - 1)], ['Прочие потери 2 %', -AEP.hv * (avail ?? 0.97) * other]] };
  }
  const speedUp = (h, hm) => Math.max(0.9, Math.min(1.12, 1 + 0.0012 * (h - hm)));     // упрощённое ускорение потока на возвышениях

  /* суточный ход ветра для режима эксплуатации */
  const DAYS = { calm: ['Слабый ветер', 4.6, 1.5], normal: ['Обычный день', 8.4, 2.2], strong: ['Сильный ветер', 13.5, 2.5], storm: ['Буря', 21.5, 4.2] };
  function windAt(min, day) {
    const h = min / 60, [, base, amp] = DAYS[day];
    return { v: Math.max(0.5, base + amp * Math.sin(2 * Math.PI * (h - 9) / 24) + 0.45 * amp * Math.sin(2 * Math.PI * h / 5.3 + 1) + 0.2 * amp * Math.sin(2 * Math.PI * h / 1.7)),
      dir: (62 + 20 * Math.sin(2 * Math.PI * (h - 4) / 24) + 9 * Math.sin(2 * Math.PI * h / 6) + 360) % 360, temp: 11 + 7 * Math.cos(2 * Math.PI * (h - 15) / 24) };
  }
  window.WIND = { T, EL, N, NF, X, Z, feeder, fpos, route, elev, feeders, density, power, ratedSpeed, ct, rpm, pitch, wake, collect, ohl, section, aep, speedUp, ROSE, KW, DAYS, windAt, resetAep: () => { AEP = null; } };
})();
