/**
 * «Штрих-код сна»: по строке на день, полоска от отбоя до подъёма.
 * Регулярность видно глазами — это главный смысл виджета.
 */

import { addDays, weekdayShort, fromMinutes } from '../model.js';
import { esc } from './common.js';

// Ось: от 20:00 (−240 на шкале «минут от полуночи дня подъёма») до 12:00 (+720)
const AXIS_FROM = -240;
const AXIS_TO = 720;
const AXIS_SPAN = AXIS_TO - AXIS_FROM;

function position(minutes) {
  return ((minutes - AXIS_FROM) / AXIS_SPAN) * 100;
}

export function renderBarcode(state, days = 14) {
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(state.today, -i);
    const day = state.byDate[date];
    let bar = '';
    if (day) {
      const left = Math.max(0, position(day.bedAbs));
      const right = Math.min(100, position(day.wakeClock));
      const width = Math.max(1.2, right - left);
      const title = `${day.entry.bedTime} → ${day.entry.wakeTime}`;
      bar = `<div class="barcode-bar ${day.grade}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%" title="${esc(title)}"></div>`;
    }
    rows.push(
      `<div class="barcode-row">
         <div class="barcode-day">${esc(weekdayShort(date))}</div>
         <div class="barcode-track">${bar}</div>
       </div>`
    );
  }

  const ticks = [-240, 0, 240, 480, 720]
    .map((m) => `<span>${fromMinutes(m)}</span>`).join('');

  return `
    <section class="card">
      <h2 class="card-title">Штрих-код сна · ${days} дней</h2>
      <div class="barcode">${rows.join('')}</div>
      <div class="barcode-scale">${ticks}</div>
    </section>`;
}
