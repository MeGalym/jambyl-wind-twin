// Номиналы ветроустановки и функция state(v): один вход — скорость ветра на оси, все цифры на экране считаются из него.
// Источники: чертёж фундамента 104218-CI-DW-040 (нагрузки по SANY SI-19580, ось 110 м; размеры фундамента и анкерной корзины),
// раскладка L14 и RFP (140 ВЭУ на 1000 МВт), Global Wind Atlas (ветер). Значения со звёздочкой приняты: паспорта ВЭУ в папках нет.

export const NOM = {
  model: 'SANY SI-19580', rotorD: 195, hubH: 110, ratedKw: 7150, platformKw: 8000,
  cutIn: 3, cutOut: 25, storm: 22, rpmMin: 4.6, rpmMax: 8.9, tsr: 9.4, cp: 0.46, eff: 0.935,
  gearRatio: 131,      // под генератор двойного питания: 1000 об/мин синхронных, на номинале около 1170 towerBaseD: 4.56, towerTopD: 3.3, towerSections: 5, bladeL: 95.4,
  fnd: { slabD: 26, pedestalD: 6.6, ringOuterD: 4.782, ringInnerD: 4.346, bolts: 200, concrete: 680.5, steelT: 81.8, depth: 3.7 },
  rho: 1.08, vMean: 9.05,
};
// что взято из документов, а что принято
export const ASSUMED = new Set(['rpmMin', 'rpmMax', 'tsr', 'cp', 'eff', 'gearRatio', 'towerTopD', 'towerSections', 'bladeL', 'cutIn', 'cutOut', 'storm']);

// подшипники и уставки: температура 75/90 °C, вибрация 4,5/7,1 мм/с — приняты*, заводских уставок нет
export const BEARINGS = [
  { id: 'ГП1', name: 'Главный подшипник, передний', unit: 'bear1', k: 1.0 },
  { id: 'ГП2', name: 'Главный подшипник, задний', unit: 'bear2', k: 0.85 },
  { id: 'Р1', name: 'Редуктор, входной вал', unit: 'gear', k: 1.1 },
  { id: 'Р2', name: 'Редуктор, выходной вал', unit: 'gear', k: 1.5 },
  { id: 'Г1', name: 'Генератор, приводная сторона', unit: 'gen', k: 1.35 },
  { id: 'Г2', name: 'Генератор, свободная сторона', unit: 'gen', k: 1.2 },
];
export const LIMITS = { tWarn: 75, tAlarm: 90, vWarn: 4.5, vAlarm: 7.1 };

const AREA = Math.PI * NOM.rotorD * NOM.rotorD / 4;
export function state(v, tAir = 12, rho = NOM.rho) {
  const run = v >= NOM.cutIn && v < NOM.cutOut;
  const cp = NOM.cp * (1 - Math.exp(-(v - 2.4) / 1.1));
  let p = run ? Math.min(NOM.ratedKw, 0.5 * rho * AREA * cp * v * v * v * NOM.eff / 1000) : 0;
  if (v > NOM.storm && run) p *= (NOM.cutOut - v) / (NOM.cutOut - NOM.storm);
  const vRated = Math.cbrt(NOM.ratedKw * 1000 / (0.5 * rho * AREA * NOM.cp * NOM.eff));
  const rpm = run ? Math.max(NOM.rpmMin, Math.min(NOM.rpmMax, 60 * NOM.tsr * v / (Math.PI * NOM.rotorD))) : 0;
  const pitch = !run ? 88 : v <= vRated ? 0 : Math.min(30, 3.4 * Math.pow(v - vRated, 0.8));
  const load = p / NOM.ratedKw, omega = rpm * Math.PI / 30;
  const bearings = BEARINGS.map(b => ({ id: b.id, t: tAir + 16 + 34 * load * b.k, vib: run ? 0.6 + 1.7 * load * b.k + 0.25 * (rpm / NOM.rpmMax) : 0.05 }));
  return {
    v, run, p, load, rpm, pitch, vRated, cpNow: run ? p * 1000 / (0.5 * rho * AREA * v * v * v * NOM.eff) : 0,
    torque: omega > 0 ? p / omega : 0,                 // кН·м на главном валу
    genRpm: rpm * NOM.gearRatio, tip: omega * NOM.rotorD / 2, thrust: run ? 0.5 * rho * AREA * v * v * (v <= vRated ? 0.8 : 0.8 * Math.pow(vRated / v, 2.6)) / 1000 : 0,
    tGear: tAir + 24 + 36 * load, tGen: tAir + 22 + 52 * load, tConv: tAir + 15 + 28 * load, tTrf: tAir + 22 + 40 * load, tAir, bearings,
  };
}
export const stateOf = (t, vib) => t >= LIMITS.tAlarm || vib >= LIMITS.vAlarm ? 'alarm' : t >= LIMITS.tWarn || vib >= LIMITS.vWarn ? 'warn' : 'ok';
