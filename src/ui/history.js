/**
 * История: месячный календарь с цветными днями, статистика и список ночей.
 */

import {
  formatDuration, formatSigned, formatDateHuman, fromMinutes,
  parseISO, toISODate, weekdayIndexMonday, todayISO,
} from '../model.js';
import { esc } from './common.js';

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export const CALENDAR_MODES = [
  { key: 'penalty', label: 'Как спал' },
  { key: 'energy', label: 'Как себя чувствовал' },
];

/**
 * Десять оттенков самочувствия.
 *
 * Шкала та же красно-жёлто-зелёная, что у штрафов, а не отдельная
 * палитра: два режима показывают одни и те же дни, и сравнивать их
 * имеет смысл только в одних цветах. Самое интересное — расхождения:
 * зелёный день по режиму и красный по самочувствию.
 *
 * Опорные цвета взяты осветлённые, те же, что у ячеек уровней, —
 * иначе на тёмном фоне цифра в клетке не читалась бы.
 */
const ENERGY_ANCHORS = [
  [235, 155, 150],  // 1 — разбитый
  [232, 196, 136],  // 5-6 — нормально
  [143, 214, 177],  // 10 — как новый
];

function mixChannel(from, to, t) {
  return Math.round(from + (to - from) * t);
}

export function energyColor(value) {
  const level = Math.min(10, Math.max(1, Math.round(value)));
  const t = (level - 1) / 9;

  const [from, to, local] = t < 0.5
    ? [ENERGY_ANCHORS[0], ENERGY_ANCHORS[1], t * 2]
    : [ENERGY_ANCHORS[1], ENERGY_ANCHORS[2], (t - 0.5) * 2];

  const rgb = from.map((channel, i) => mixChannel(channel, to[i], local));
  return {
    text: `rgb(${rgb.join(',')})`,
    bg: `rgba(${rgb.join(',')},0.18)`,
    border: `rgba(${rgb.join(',')},0.45)`,
  };
}

function calendarCard(state, cursor, mode) {
  const byEnergy = mode === 'energy';
  const [year, month] = cursor.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const lead = weekdayIndexMonday(toISODate(first));
  const today = todayISO();

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="cal-cell empty"></div>');

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = toISODate(new Date(year, month - 1, d));
    const day = state.byDate[iso];
    const classes = ['cal-cell'];
    let tint = '';

    if (day) {
      classes.push('filled');
      if (byEnergy) {
        const color = energyColor(day.entry.energy);
        tint = `background:${color.bg};border-color:${color.border};color:${color.text}`;
      } else {
        classes.push(day.grade);
      }
    }
    if (iso === today) classes.push('today');

    const future = iso > today;
    const title = day
      ? `${formatDuration(day.sleepMinutes)} · ${day.entry.bedTime} → ${day.entry.wakeTime}`
        + ` · ${day.totalPenalty} штрафных · самочувствие ${day.entry.energy}`
      : (future ? 'Ещё не наступило' : 'Нет записи');

    cells.push(
      `<button class="${classes.join(' ')}" ${future ? 'disabled' : ''}
         ${tint ? `style="${tint}"` : ''}
         data-action="edit-day" data-date="${iso}" title="${esc(title)}">${d}</button>`
    );
  }

  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const prevMonth = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
  const nextDisabled = `${nextMonth}-01` > today;

  const energyScale = Array.from({ length: 10 }, (_, i) =>
    `<i style="background:${energyColor(i + 1).text}"></i>`).join('');

  return `
    <section class="card">
      <div class="segmented">
        ${CALENDAR_MODES.map((m) => `
          <button class="${m.key === mode ? 'active' : ''}"
                  data-action="calendar-mode" data-mode="${m.key}">${esc(m.label)}</button>`).join('')}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <button class="btn btn-ghost btn-sm" data-action="month" data-month="${prevMonth}">‹</button>
        <strong style="font-size:15px">${MONTH_NAMES[month - 1]} ${year}</strong>
        <button class="btn btn-ghost btn-sm" data-action="month" data-month="${nextMonth}"
          ${nextDisabled ? 'disabled style="opacity:0.3"' : ''}>›</button>
      </div>
      <div class="cal-head">${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
      ${byEnergy ? `<div class="legend">
        <span class="energy-ramp">разбитый ${energyScale} как новый</span>
        <span><i style="background:var(--surface-2)"></i>нет записи</span>
      </div>` : `<div class="legend">
        <span><i style="background:var(--green)"></i>чисто</span>
        <span><i style="background:var(--yellow)"></i>есть штрафы</span>
        <span><i style="background:var(--red)"></i>режим сбит</span>
        <span><i style="background:var(--black-grade)"></i>срыв</span>
        <span><i style="background:var(--surface-2)"></i>нет записи</span>
      </div>`}
    </section>`;
}

function statsCard(state) {
  const s = state.stats;
  if (s.nights === 0) {
    return `<section class="card"><h2 class="card-title">Статистика</h2>
      <div class="empty" style="padding:8px 0">Появится после первой записи.</div></section>`;
  }

  const rows = [
    { label: `Средний сон за ${s.nights} ночей`, value: formatDuration(s.avgSleep) },
    { label: 'Среднее штрафных за ночь', value: String(Math.round(s.avgPenalty)) },
    s.bedSpread !== null
      ? { label: 'Разброс времени отбоя', value: '±' + formatDuration(s.bedSpread) }
      : null,
    s.wakeSpread !== null
      ? { label: 'Разброс времени подъёма', value: '±' + formatDuration(s.wakeSpread) }
      : null,
    s.avgMidpoint !== null
      ? { label: 'Середина сна', value: fromMinutes(s.avgMidpoint) }
      : null,
    { label: 'Всего записано ночей', value: String(state.days.length) },
  ].filter(Boolean);

  return `
    <section class="card">
      <h2 class="card-title">Статистика</h2>
      <div class="statlist">${rows.map((r) => `
        <div class="stat">
          <span class="stat-label">${esc(r.label)}</span>
          <span class="stat-value">${esc(r.value)}</span>
        </div>`).join('')}</div>
      ${s.worstFactor ? `<div class="divider"></div>
        <div class="small muted">
          Чаще всего в неудачные ночи подводит <strong style="color:var(--text-dim)">${esc(s.worstFactor.label)}</strong>
          — ${s.worstFactor.count} из ${s.worstFactor.of} таких ночей.
        </div>` : `<div class="divider"></div>
        <div class="small muted">
          Фактор плохого сна покажу, когда наберётся хотя бы 5 неудачных ночей — раньше это просто угадывание.
        </div>`}
    </section>`;
}

function dayListCard(state) {
  if (state.days.length === 0) return '';
  const recent = [...state.days].reverse().slice(0, 30);

  return `
    <section class="card">
      <h2 class="card-title">Последние ночи</h2>
      <div class="daylist">${recent.map((day) => {
        const bits = [`${day.entry.bedTime} → ${day.entry.wakeTime}`];
        if (day.phoneFreeMinutes !== null && day.phoneFreeMinutes > 0) {
          bits.push(`📱 ${formatDuration(day.phoneFreeMinutes)}`);
        }
        return `
          <button class="dayitem" data-action="edit-day" data-date="${day.entry.date}">
            <span class="dayitem-dot ${day.grade}"></span>
            <span class="dayitem-main">
              <span class="dayitem-date">${esc(formatDateHuman(day.entry.date))}</span>
              <span class="dayitem-sub">${esc(bits.join(' · '))}</span>
            </span>
            <span>
              <span class="dayitem-dur">${esc(formatDuration(day.sleepMinutes))}</span>
              <span class="dayitem-xp">${day.totalPenalty} штрафных</span>
            </span>
          </button>`;
      }).join('')}</div>
    </section>`;
}

export function renderHistory(state, flags) {
  const cursor = flags.month || state.today.slice(0, 7);
  const mode = flags.calendarMode === 'energy' ? 'energy' : 'penalty';
  return `
    <div class="view">
      ${calendarCard(state, cursor, mode)}
      ${statsCard(state)}
      ${dayListCard(state)}
    </div>`;
}
