/**
 * Ломаная на инлайновом SVG. Библиотеку тянуть не за чем: нужна линия,
 * пунктир плана и подписи осей — это дешевле написать, чем подключить.
 *
 * Пропуски в данных НЕ соединяются: линия рвётся. Иначе график дорисует
 * переход, которого не было, и покажет плавный тренд там, где просто
 * нет записей.
 */

import { esc } from './common.js';

const W = 320;
const H = 170;
const PAD = { top: 8, right: 8, bottom: 20, left: 38 };

const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

/** Делит серию на непрерывные куски, разрывая её на пропусках */
function segments(points) {
  const runs = [];
  let current = [];
  for (const point of points) {
    if (point.value === null || point.value === undefined || Number.isNaN(point.value)) {
      if (current.length) runs.push(current);
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length) runs.push(current);
  return runs;
}

/**
 * Круглые отметки на оси значений.
 *
 * Лестница шагов включает 15, 30, 60 и кратные часу: чистые степени
 * десятки для минут не годятся — на размахе в три часа ближайшим
 * шагом оказывалось 100 минут, и подпись оставалась всего одна.
 */
const TICK_STEPS = [
  1, 2, 5, 10, 15, 20, 30, 60, 90, 120, 180, 240, 360, 480, 720, 1440,
];

function niceTicks(min, max, count = 4) {
  const span = max - min;
  if (span <= 0) return [min];

  const rough = span / (count - 1);
  const build = (step) => {
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-6; v += step) ticks.push(v);
    return ticks;
  };

  const ladder = TICK_STEPS.filter((s) => s <= span);
  const start = TICK_STEPS.findIndex((s) => s >= rough);
  const candidates = start >= 0
    ? [TICK_STEPS[start], ...TICK_STEPS.slice(0, start).reverse()]
    : ladder.reverse();

  // Спускаемся по лестнице, пока на оси не окажется хотя бы две отметки:
  // на сжатых диапазонах крупный шаг давал единственную подпись
  for (const step of candidates) {
    const ticks = build(step);
    if (ticks.length >= 2) return ticks;
  }
  return [min, max];
}

/**
 * @param points  [{ label, value, plan }] — value или plan могут быть null
 * @param format  функция подписи значения на оси
 */
export function renderChart(points, format) {
  const values = [];
  for (const p of points) {
    if (p.value !== null && p.value !== undefined) values.push(p.value);
    if (p.plan !== null && p.plan !== undefined) values.push(p.plan);
  }
  if (values.length < 2) {
    return '<div class="empty" style="padding:26px 0">Для графика нужно хотя бы две ночи.</div>';
  }

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 30; max += 30; }
  const margin = (max - min) * 0.12;
  min -= margin;
  max += margin;

  const x = (i) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v) => PAD.top + plotH - ((v - min) / (max - min)) * plotH;

  const ticks = niceTicks(min + margin, max - margin);
  const grid = ticks.map((v) => `
    <line x1="${PAD.left}" y1="${y(v).toFixed(1)}" x2="${W - PAD.right}" y2="${y(v).toFixed(1)}"
          class="chart-grid" />
    <text x="${PAD.left - 6}" y="${(y(v) + 3).toFixed(1)}" class="chart-ylabel">${esc(format(v))}</text>`).join('');

  const toPath = (run, accessor) => run
    .map((p) => `${x(p.index).toFixed(1)},${y(accessor(p)).toFixed(1)}`).join(' ');

  const indexed = points.map((p, index) => ({ ...p, index }));

  const planRuns = segments(indexed.map((p) => ({ ...p, value: p.plan })));
  const planLines = planRuns
    .filter((run) => run.length > 1)
    .map((run) => `<polyline points="${toPath(run, (p) => p.value)}" class="chart-plan" />`).join('');

  const runs = segments(indexed);
  const lines = runs
    .filter((run) => run.length > 1)
    .map((run) => `<polyline points="${toPath(run, (p) => p.value)}" class="chart-line" />`).join('');

  // Точки рисуем только когда их немного: иначе линия превращается в бусы
  const dots = points.length <= 32
    ? indexed.filter((p) => p.value !== null && p.value !== undefined)
      .map((p) => `<circle cx="${x(p.index).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.2" class="chart-dot" />`).join('')
    : '';

  // Подписи дат: до четырёх, равномерно
  const labelCount = Math.min(4, points.length);
  const xLabels = [];
  for (let i = 0; i < labelCount; i++) {
    const index = Math.round((i / Math.max(1, labelCount - 1)) * (points.length - 1));
    const anchor = i === 0 ? 'start' : (i === labelCount - 1 ? 'end' : 'middle');
    xLabels.push(`<text x="${x(index).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}"
      class="chart-xlabel">${esc(points[index].label)}</text>`);
  }

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
      ${grid}
      ${planLines}
      ${lines}
      ${dots}
      ${xLabels.join('')}
    </svg>`;
}
