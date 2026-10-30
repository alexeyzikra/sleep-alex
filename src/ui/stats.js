/**
 * Страница статистики: выбираешь характеристику и период, смотришь
 * ломаную. Штрих-код показывает две недели и только «когда я спал»;
 * здесь — любая метрика на любом отрезке.
 */

import {
  addDays, parseISO, todayISO, fromMinutes, formatCompact, formatDuration,
  PHONE_CLEAN_MINUTES, GRADE_LIMITS,
} from '../model.js';
import { esc } from './common.js';
import { renderChart } from './chart.js';

/** Телефон бывает отрицательным — это экран уже в кровати */
function compactSigned(minutes) {
  return minutes < 0 ? '−' + formatCompact(-minutes) : formatCompact(minutes);
}

export const METRICS = [
  {
    key: 'duration', label: 'Сколько спал', unit: 'сна',
    value: (d) => d.sleepMinutes, plan: (d) => d.plan.durationMinutes,
    format: formatCompact, describe: formatDuration,
  },
  {
    // Время суток идёт по непрерывной шкале вокруг полуночи, иначе
    // переход 23:00 → 01:00 рисовал бы скачок через весь график
    key: 'bed', label: 'Во сколько лёг', unit: '',
    value: (d) => d.bedAbs, plan: (d) => d.plan.bedAbs,
    format: fromMinutes, describe: fromMinutes,
  },
  {
    key: 'wake', label: 'Во сколько встал', unit: '',
    value: (d) => d.wakeClock, plan: (d) => d.plan.wakeClock,
    format: fromMinutes, describe: fromMinutes,
  },
  {
    key: 'phone', label: 'Без телефона перед сном', unit: '',
    value: (d) => d.phoneFreeMinutes, plan: () => PHONE_CLEAN_MINUTES,
    format: compactSigned, describe: compactSigned,
  },
  {
    key: 'energy', label: 'Самочувствие', unit: 'из 10',
    value: (d) => d.entry.energy, plan: null,
    format: (v) => String(Math.round(v)), describe: (v) => Math.round(v * 10) / 10 + ' из 10',
  },
  {
    key: 'penalty', label: 'Штрафные очки', unit: 'за ночь',
    value: (d) => d.totalPenalty, plan: () => GRADE_LIMITS.green,
    format: (v) => String(Math.round(v)), describe: (v) => String(Math.round(v)),
  },
];

export const PERIODS = [
  { key: 'week', label: 'Неделя', days: 7 },
  { key: 'month', label: 'Месяц', days: 30 },
  { key: 'quarter', label: '3 мес.', days: 90 },
  { key: 'all', label: 'Всё', days: null },
];

/** Дальше этого числа точек переходим на средние по неделям */
const DAILY_LIMIT = 35;

function shortDate(iso) {
  const date = parseISO(iso);
  return `${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Собирает точки графика: по дню, а на длинных периодах — по неделям */
export function buildSeries(state, metric, period) {
  const today = state.today;
  const dates = Object.keys(state.byDate).sort();
  if (!dates.length) return { points: [], weekly: false };

  const from = period.days
    ? addDays(today, -(period.days - 1))
    : dates[0];

  const span = [];
  for (let date = from; date <= today; date = addDays(date, 1)) span.push(date);

  const pick = (date) => {
    const day = state.byDate[date];
    if (!day) return { value: null, plan: null };
    const value = metric.value(day);
    return {
      value: (value === null || value === undefined || Number.isNaN(value)) ? null : value,
      plan: metric.plan ? metric.plan(day) : null,
    };
  };

  if (span.length <= DAILY_LIMIT) {
    return {
      weekly: false,
      points: span.map((date) => ({ label: shortDate(date), ...pick(date) })),
    };
  }

  // Недельные корзины отсчитываются от сегодня, чтобы последняя была полной
  const points = [];
  for (let end = span.length; end > 0; end -= 7) {
    const bucket = span.slice(Math.max(0, end - 7), end);
    const picked = bucket.map(pick);
    points.unshift({
      label: shortDate(bucket[0]),
      value: average(picked.map((p) => p.value).filter((v) => v !== null)),
      plan: average(picked.map((p) => p.plan).filter((v) => v !== null && v !== undefined)),
    });
  }
  return { weekly: true, points };
}

function summary(points, metric) {
  const values = points.map((p) => p.value).filter((v) => v !== null && v !== undefined);
  if (!values.length) return '';
  const avg = average(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `
    <div class="stat-summary">
      <span><b>${esc(metric.describe(avg))}</b> в среднем</span>
      <span>от ${esc(metric.describe(min))} до ${esc(metric.describe(max))}</span>
      <span>${values.length} ${values.length === 1 ? 'точка' : 'точек'}</span>
    </div>`;
}

export function renderStats(state, flags) {
  const metric = METRICS.find((m) => m.key === flags.metric) || METRICS[0];
  const period = PERIODS.find((p) => p.key === flags.period) || PERIODS[1];

  if (!Object.keys(state.byDate).length) {
    return `
      <div class="view">
        <section class="card">
          <div class="empty">
            <span class="empty-icon">📈</span>
            Графики появятся, когда накопятся записи.
          </div>
        </section>
      </div>`;
  }

  const { points, weekly } = buildSeries(state, metric, period);

  return `
    <div class="view">
      <section class="card">
        <h2 class="card-title">Что смотрим</h2>
        <div class="chips">
          ${METRICS.map((m) => `
            <button class="chip ${m.key === metric.key ? 'on' : ''}"
                    data-action="metric" data-metric="${m.key}">${esc(m.label)}</button>`).join('')}
        </div>
      </section>

      <section class="card">
        <div class="segmented">
          ${PERIODS.map((p) => `
            <button class="${p.key === period.key ? 'active' : ''}"
                    data-action="period" data-period="${p.key}">${esc(p.label)}</button>`).join('')}
        </div>

        ${summary(points, metric)}
        ${renderChart(points, metric.format)}

        <div class="chart-note">
          ${weekly ? 'Точка — среднее за неделю: по дням на таком отрезке линия превращается в кашу.' : 'Точка — одна ночь.'}
          ${metric.plan ? ' Пунктир — план.' : ''}
          Пропущенные ночи разрывают линию.
        </div>
      </section>
    </div>`;
}
