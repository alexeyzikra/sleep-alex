/**
 * «Штрих-код сна»: по строке на день, полоска от отбоя до подъёма.
 * Регулярность видно глазами — это главный смысл виджета.
 *
 * Справа у каждой строки длительность числом: длина полоски и так
 * означает, сколько ты спал, а цифра делает это чтение точным —
 * можно пробежаться по колонке и не вглядываться в полоски.
 */

import { addDays, weekdayShort, fromMinutes, formatCompact, formatDuration } from '../model.js';
import { esc } from './common.js';

// Ось: от 20:00 (−240 на шкале «минут от полуночи дня подъёма») до 12:00 (+720)
const AXIS_FROM = -240;
const AXIS_TO = 720;
const AXIS_SPAN = AXIS_TO - AXIS_FROM;

function position(minutes) {
  return ((minutes - AXIS_FROM) / AXIS_SPAN) * 100;
}

const HOUR_PERCENT = (60 / AXIS_SPAN) * 100;
const MIDNIGHT = position(0);

/**
 * Часовая сетка рисуется фоном трека, а не отдельными элементами:
 * иначе на четырнадцать строк пришлось бы больше двух сотен лишних узлов.
 */
const TRACK_GRID = `repeating-linear-gradient(to right,`
  + ` var(--border) 0 1px,`
  + ` transparent 1px ${HOUR_PERCENT}%)`;

// Полночь — главный ориентир «лёг до или после», поэтому рисуется
// поверх полоски (::after), а не фоном: иначе она пропадала бы ровно
// в тех строках, где по ней и надо свериться.
const MIDNIGHT_VAR = `--midnight:${MIDNIGHT}%`;

export function renderBarcode(state, days = 14) {
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(state.today, -i);
    const day = state.byDate[date];
    let bar = '';
    let duration = '';
    if (day) {
      const left = Math.max(0, position(day.bedAbs));
      const right = Math.min(100, position(day.wakeClock));
      const width = Math.max(1.2, right - left);
      const title = `${day.entry.bedTime} → ${day.entry.wakeTime} · ${formatDuration(day.sleepMinutes)}`;
      bar = `<div class="barcode-bar ${day.grade}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%" title="${esc(title)}"></div>`;
      duration = esc(formatCompact(day.sleepMinutes));
    }
    rows.push(
      `<div class="barcode-row">
         <div class="barcode-day">${esc(weekdayShort(date))}</div>
         <div class="barcode-track" style="background-image:${TRACK_GRID};${MIDNIGHT_VAR}">${bar}</div>
         <div class="barcode-dur">${duration}</div>
       </div>`
    );
  }

  // Подписи через два часа: каждый час при ширине телефона сливается
  const ticks = [];
  for (let m = AXIS_FROM; m <= AXIS_TO; m += 120) {
    ticks.push(`<span class="${m === 0 ? 'midnight' : ''}">${fromMinutes(m).slice(0, 2)}</span>`);
  }

  return `
    <section class="card">
      <h2 class="card-title">Штрих-код сна · ${days} дней</h2>
      <div class="barcode">${rows.join('')}</div>
      <div class="barcode-scale">${ticks.join('')}</div>
    </section>`;
}
