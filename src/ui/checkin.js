/**
 * Утренний чек-ин: одна форма, живой подсчёт сна и XP прямо во время ввода.
 */

import {
  validateEntry, scoreEntry, formatDuration, formatDateHuman, todayISO, GRADE_LABELS,
} from '../model.js';
import { getData, saveEntry, deleteEntry } from '../state.js';
import { esc, energyLabel, ENERGY_LEVELS, VIOLATION_ITEMS, PHONE_PRESETS } from './common.js';

function blankForm(date, settings) {
  return {
    date,
    phoneOffTime: '',
    phoneGapMinutes: null,
    bedTime: settings.bedTime,
    wakeTime: settings.wakeTime,
    energy: 6,
    violations: { caffeine: false, badRoom: false, snoozed: false },
    note: '',
  };
}

/** Блок «во сколько отложил телефон» — выбор способа живёт в настройках */
function phoneFieldHTML(form, settings) {
  if (settings.phoneInput === 'clock') {
    return `
      <div class="field">
        <label class="field-label" for="f-phone">Во сколько отложил телефон</label>
        <input type="time" id="f-phone" name="phoneOffTime" value="${esc(form.phoneOffTime || '')}">
      </div>`;
  }

  return `
    <div class="field">
      <label class="field-label">За сколько до сна отложил телефон</label>
      <div class="chips" id="f-phone-chips">
        ${PHONE_PRESETS.map((preset) => `
          <button type="button" class="chip ${form.phoneGapMinutes === preset.value ? 'on' : ''}"
                  data-gap="${preset.value}">${esc(preset.label)}</button>`).join('')}
      </div>
    </div>`;
}

function liveHTML(form, settings) {
  const { errors, warnings, resolved } = validateEntry(form);

  if (errors.length) {
    return `<div class="msg error">${errors.map(esc).join('<br>')}</div>`;
  }

  const score = scoreEntry(form, settings);
  const bits = [];
  if (resolved.phoneFreeMinutes !== null && resolved.phoneFreeMinutes > 0) {
    bits.push(`без телефона ${formatDuration(resolved.phoneFreeMinutes)} до сна`);
  }
  bits.push(`план ${score.plan.bedTime} → ${score.plan.wakeTime}`);
  // Неотмеченный телефон не штрафуется — но и молчать об этом не стоит
  if (resolved.phoneFreeMinutes === null) bits.push('телефон не отмечен');

  // Три самых дорогих нарушения: сразу видно, что именно стоило очков
  const top = [...score.reasons].sort((a, b) => b.points - a.points).slice(0, 3);

  return `
    <div class="live live-${score.grade}">
      <div class="live-head">
        <div>
          <div class="live-main">${esc(formatDuration(resolved.sleepMinutes))} сна</div>
          <div class="live-sub">${esc(bits.join(' · '))}</div>
        </div>
        <span class="grade grade-${score.grade}">${score.totalPenalty}</span>
      </div>
      ${top.length
        ? `<div class="live-reasons">${top.map((r) => `<span>${esc(r.label)} <b>+${r.points}</b></span>`).join('')}</div>`
        : '<div class="live-reasons" style="color:var(--green)">Ни одного штрафного очка</div>'}
      ${score.blackFlags.length
        ? `<div class="live-reasons" style="color:var(--black-grade)">${score.blackFlags.map(esc).join(' · ')}</div>`
        : ''}
    </div>
    ${warnings.map((w) => `<div class="msg warn">${esc(w)}</div>`).join('')}`;
}

export function checkinSheet(date, ctx) {
  const data = getData();
  const settings = data.settings;
  const existing = data.entries[date];
  const form = existing
    ? JSON.parse(JSON.stringify(existing))
    : blankForm(date, settings);

  const html = () => {
    const energy = energyLabel(form.energy);
    return `
      <div class="field">
        <label class="field-label" for="f-date">За какую ночь (дата пробуждения)</label>
        <input type="date" id="f-date" name="date" value="${esc(form.date)}" max="${todayISO()}">
      </div>

      ${phoneFieldHTML(form, settings)}

      <div class="row">
        <div class="field">
          <label class="field-label" for="f-bed">Во сколько лёг</label>
          <input type="time" id="f-bed" name="bedTime" value="${esc(form.bedTime)}" required>
        </div>
        <div class="field">
          <label class="field-label" for="f-wake">Во сколько проснулся</label>
          <input type="time" id="f-wake" name="wakeTime" value="${esc(form.wakeTime)}" required>
        </div>
      </div>

      <div id="live-slot">${liveHTML(form, settings)}</div>

      <div class="field">
        <div class="energy-head">
          <label class="field-label" for="f-energy" style="margin:0">Как себя чувствуешь</label>
          <span class="energy-value" id="energy-text">${energy.icon} ${esc(energy.label)}</span>
        </div>
        <input type="range" id="f-energy" name="energy" min="1" max="10" step="1"
               list="energy-ticks" value="${form.energy}">
        <datalist id="energy-ticks">
          ${ENERGY_LEVELS.map((l) => `<option value="${l.value}"></option>`).join('')}
        </datalist>
        <div class="energy-scale">
          ${ENERGY_LEVELS.map((l) => `<span class="${l.value === form.energy ? 'on' : ''}"
             data-tick="${l.value}">${l.value}</span>`).join('')}
        </div>
      </div>

      <div class="field">
        <label class="field-label">Что пошло не так <span class="muted">(отмечай только нарушения)</span></label>
        <div class="checks">
          ${VIOLATION_ITEMS.map((item) => `
            <label class="check bad ${form.violations[item.key] ? 'on' : ''}" data-check="${item.key}">
              <input type="checkbox" name="${item.key}" ${form.violations[item.key] ? 'checked' : ''}>
              <span>${esc(item.label)}</span>
            </label>`).join('')}
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="f-note">Заметка <span class="muted">(не обязательно)</span></label>
        <textarea id="f-note" name="note" rows="2" placeholder="Например: не мог уснуть из-за кофе">${esc(form.note || '')}</textarea>
      </div>

      <div id="save-msg"></div>
      <button class="btn btn-primary" data-role="save">Сохранить</button>
      ${existing ? `<button class="btn btn-danger mt" data-role="delete">Удалить запись за этот день</button>` : ''}`;
  };

  const mount = (root) => {
    const liveSlot = root.querySelector('#live-slot');
    const refreshLive = () => { liveSlot.innerHTML = liveHTML(form, settings); };

    root.querySelectorAll('input[type="time"], input[type="date"]').forEach((input) => {
      input.addEventListener('input', () => {
        form[input.name] = input.value || (input.name === 'phoneOffTime' ? '' : input.value);
        refreshLive();
      });
    });

    const energyInput = root.querySelector('#f-energy');
    const energyText = root.querySelector('#energy-text');
    energyInput.addEventListener('input', () => {
      form.energy = Number(energyInput.value);
      const label = energyLabel(form.energy);
      energyText.textContent = `${label.icon} ${label.label}`;
      root.querySelectorAll('[data-tick]').forEach((tick) => {
        tick.classList.toggle('on', Number(tick.dataset.tick) === form.energy);
      });
    });

    const chips = root.querySelector('#f-phone-chips');
    if (chips) {
      chips.addEventListener('click', (event) => {
        const chip = event.target.closest('.chip');
        if (!chip) return;
        const value = Number(chip.dataset.gap);
        // Повторное нажатие снимает отметку: ночь без ответа лучше, чем с выдуманным
        form.phoneGapMinutes = form.phoneGapMinutes === value ? null : value;
        chips.querySelectorAll('.chip').forEach((c) => {
          c.classList.toggle('on', Number(c.dataset.gap) === form.phoneGapMinutes);
        });
        refreshLive();
      });
    }

    root.querySelectorAll('.check').forEach((label) => {
      const box = label.querySelector('input');
      box.addEventListener('change', () => {
        form.violations[label.dataset.check] = box.checked;
        label.classList.toggle('on', box.checked);
        refreshLive();
      });
    });

    root.querySelector('#f-note').addEventListener('input', (e) => {
      form.note = e.target.value;
    });

    root.querySelector('[data-role="save"]').addEventListener('click', () => {
      const { errors } = validateEntry(form);
      const slot = root.querySelector('#save-msg');
      if (errors.length) {
        slot.innerHTML = `<div class="msg error">${errors.map(esc).join('<br>')}</div>`;
        return;
      }
      if (!form.date) {
        slot.innerHTML = '<div class="msg error">Укажи дату.</div>';
        return;
      }
      // Дата могла измениться — старую запись за этот день не плодим,
      // а переносим: удаляем прежний ключ, если он отличается.
      if (existing && existing.date !== form.date) deleteEntry(existing.date);
      saveEntry(form);
      ctx.close();
      const score = scoreEntry(form, settings);
      ctx.toast(score.totalPenalty === 0
        ? `Записано: ${formatDuration(score.sleepMinutes)} · идеальная ночь`
        : `Записано: ${formatDuration(score.sleepMinutes)} · ${score.totalPenalty} штрафных`);
    });

    const deleteButton = root.querySelector('[data-role="delete"]');
    if (deleteButton) {
      deleteButton.addEventListener('click', () => {
        if (!confirm('Удалить запись за ' + formatDateHuman(form.date) + '?')) return;
        deleteEntry(existing.date);
        ctx.close();
        ctx.toast('Запись удалена');
      });
    }
  };

  return {
    title: existing ? 'Исправить запись' : 'Сегодняшний сон',
    html,
    mount,
  };
}
