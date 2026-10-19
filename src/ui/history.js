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

function calendarCard(state, cursor) {
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
    if (day) classes.push('filled', day.grade);
    if (iso === today) classes.push('today');
    const future = iso > today;
    const title = day
      ? `${formatDuration(day.sleepMinutes)} · ${day.entry.bedTime} → ${day.entry.wakeTime} · ${day.totalPenalty} штрафных`
      : (future ? 'Ещё не наступило' : 'Нет записи');
    cells.push(
      `<button class="${classes.join(' ')}" ${future ? 'disabled' : ''}
         data-action="edit-day" data-date="${iso}" title="${esc(title)}">${d}</button>`
    );
  }

  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const prevMonth = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
  const nextDisabled = `${nextMonth}-01` > today;

  return `
    <section class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <button class="btn btn-ghost btn-sm" data-action="month" data-month="${prevMonth}">‹</button>
        <strong style="font-size:15px">${MONTH_NAMES[month - 1]} ${year}</strong>
        <button class="btn btn-ghost btn-sm" data-action="month" data-month="${nextMonth}"
          ${nextDisabled ? 'disabled style="opacity:0.3"' : ''}>›</button>
      </div>
      <div class="cal-head">${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
      <div class="legend">
        <span><i style="background:var(--green)"></i>чисто</span>
        <span><i style="background:var(--yellow)"></i>есть штрафы</span>
        <span><i style="background:var(--red)"></i>режим сбит</span>
        <span><i style="background:var(--black-grade)"></i>срыв</span>
        <span><i style="background:var(--surface-2)"></i>нет записи</span>
      </div>
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
  return `
    <div class="view">
      ${calendarCard(state, cursor)}
      ${statsCard(state)}
      ${dayListCard(state)}
    </div>`;
}
