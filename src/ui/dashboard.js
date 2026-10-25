import {
  formatDuration, formatSigned, plannedFor,
  GRADE_LABELS, GRADE_LIMITS, FORM_WINDOW,
} from '../model.js';
import { esc } from './common.js';
import { renderBarcode } from './barcode.js';

function gradeBadge(grade, penalty) {
  return `<span class="grade grade-${grade}">${penalty} ${penalty === 1 ? 'очко' : (penalty % 10 >= 2 && penalty % 10 <= 4 && (penalty < 10 || penalty > 20) ? 'очка' : 'очков')}</span>`;
}

function balanceCard(state) {
  const { balanceMinutes, nights, windowDays } = state.balance;
  if (nights === 0) {
    return `
      <section class="card">
        <h2 class="card-title">Баланс сна</h2>
        <div class="empty" style="padding:8px 0">Пока нет записей за последние ${windowDays} дней.</div>
      </section>`;
  }

  let tone = 'good';
  if (balanceMinutes < -180) tone = 'bad';
  else if (balanceMinutes < -45) tone = 'warn';

  const caption = balanceMinutes >= 0
    ? `Спал даже чуть больше своей нормы. Ночей учтено: ${nights}.`
    : `Недосып относительно твоей нормы. Ночей учтено: ${nights}.`;

  return `
    <section class="card">
      <h2 class="card-title">Баланс сна за ${windowDays} дней</h2>
      <div class="balance-value ${tone}">${esc(formatSigned(balanceMinutes))}</div>
      <div class="balance-caption">${esc(caption)}</div>
    </section>`;
}

function streaksCard(state) {
  // От самого лояльного к самому строгому: записал → без срывов → чисто.
  // Нижний всегда капает, пока держишься в рамках, даже если ночи так себе.
  const items = [
    { icon: '🔥', num: state.recordStreak, label: 'дней подряд<br>с записями' },
    { icon: '🛡️', num: state.noBlackStreak, label: 'ночей подряд<br>без срывов' },
    { icon: '✅', num: state.cleanStreak, label: 'чистых ночей<br>подряд' },
  ];
  return `<div class="streaks">${items.map((s) => `
    <div class="streak">
      <div class="streak-icon">${s.icon}</div>
      <div class="streak-num ${s.num === 0 ? 'zero' : ''}">${s.num}</div>
      <div class="streak-label">${s.label}</div>
    </div>`).join('')}</div>`;
}

function formCard(state) {
  const f = state.form;

  if (!f.enough) {
    const word = f.needed === 1 ? 'ночь' : (f.needed < 5 ? 'ночи' : 'ночей');
    return `
      <section class="card">
        <h2 class="card-title">Форма</h2>
        <div class="small muted">
          Осталось записать ещё ${f.needed} ${word} — тогда покажу,
          как режим держится за последнюю неделю.
        </div>
      </section>`;
  }

  let trendLine = '<span class="muted">Сравню с прошлой неделей, когда наберётся история.</span>';
  if (f.trend) {
    if (f.trend.direction === 'flat') {
      trendLine = '<span class="muted">Без заметных изменений к прошлой неделе.</span>';
    } else {
      const better = f.trend.direction === 'better';
      const amount = Math.abs(f.trend.delta);
      trendLine = `<span class="trend trend-${better ? 'better' : 'worse'}">
        ${better ? '↓' : '↑'} на ${amount} ${amount % 10 === 1 && amount % 100 !== 11 ? 'очко' : 'очков'}
        ${better ? 'лучше' : 'хуже'}, чем неделю назад</span>`;
    }
  }

  return `
    <section class="card">
      <h2 class="card-title">Форма за неделю</h2>
      <div class="form-head">
        <div>
          <div class="form-value tone-${f.band.tone}">${Math.round(f.avgPenalty)}</div>
          <div class="form-caption">штрафных очков за ночь в среднем</div>
        </div>
        <span class="grade grade-${f.band.tone}">${esc(f.band.title)}</span>
      </div>
      <div class="form-trend">${trendLine}</div>
    </section>`;
}

function milestonesCard(state) {
  const done = state.milestones.filter((m) => m.done).length;

  // Незакрытые наверх, ближайшая к цели первой: это то, на что можно
  // повлиять сегодня. Пройденные уходят вниз, им внимание уже не нужно.
  const ordered = [...state.milestones].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.progress - a.progress;
  });

  return `
    <section class="card">
      <h2 class="card-title">Вехи · ${done} из ${state.milestones.length}</h2>
      <div class="milestones">${ordered.map((m) => {
        if (m.done) {
          return `<div class="milestone done">
            <span class="milestone-check">✓</span>
            <span class="milestone-title">${esc(m.title)}</span>
          </div>`;
        }
        return `<div class="milestone">
          <div class="milestone-row">
            <span class="milestone-title">${esc(m.title)}</span>
            <span class="milestone-count">${m.current} / ${m.target}</span>
          </div>
          <div class="milestone-bar"><div style="width:${(m.progress * 100).toFixed(1)}%"></div></div>
        </div>`;
      }).join('')}</div>
    </section>`;
}

function lastNightCard(state) {
  const day = state.byDate[state.today];
  if (!day) return '';

  return `
    <section class="card">
      <h2 class="card-title">Сегодняшняя запись</h2>
      <div class="stat">
        <div>
          <div style="font-size:21px;font-weight:650;letter-spacing:-0.4px">${esc(formatDuration(day.sleepMinutes))}</div>
          <div class="small muted" style="margin-top:2px">
            ${esc(`Лёг ${day.entry.bedTime}, встал ${day.entry.wakeTime}`)}
          </div>
        </div>
        ${gradeBadge(day.grade, day.totalPenalty)}
      </div>

      ${day.blackFlags.length ? `<div class="msg error mt">
        ${day.blackFlags.map(esc).join('<br>')}
      </div>` : ''}

      ${day.reasons.length || day.bonuses.length ? `<div class="divider"></div>
        <div class="statlist">
          ${day.reasons.map((r) => `
            <div class="stat">
              <span class="stat-label">${esc(r.label)}${r.detail ? `<br><span class="small" style="color:var(--text-faint)">${esc(r.detail)}</span>` : ''}</span>
              <span class="stat-value" style="color:var(--yellow)">+${r.points}</span>
            </div>`).join('')}
          ${day.bonuses.map((b) => `
            <div class="stat">
              <span class="stat-label">${esc(b.label)}</span>
              <span class="stat-value" style="color:var(--green)">−${b.points}</span>
            </div>`).join('')}
        </div>`
      : `<div class="divider"></div>
        <div class="small" style="color:var(--green)">Ни одного штрафного очка. Идеальная ночь.</div>`}

      <button class="btn btn-ghost btn-sm mt" data-action="edit-day" data-date="${state.today}"
              style="width:100%">Исправить запись</button>
    </section>`;
}

// Только то, что относится к сегодняшней ночи. Статистика живёт
// в «Истории» — здесь ей не место, это карточка плана, а не сводка.
function targetCard(state) {
  const plan = plannedFor(state.today, state.settings);

  return `
    <section class="card">
      <h2 class="card-title">План на сегодня</h2>
      <div class="statlist">
        <div class="stat">
          <span class="stat-label">Отбой</span>
          <span class="stat-value">${esc(plan.bedTime)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Подъём${plan.alternates
            ? ` <span class="small muted">(${plan.parity === 'even' ? 'чётная' : 'нечётная'} неделя)</span>`
            : (plan.isWeekly ? ' <span class="small muted">(по дню недели)</span>' : '')}</span>
          <span class="stat-value">${esc(plan.wakeTime)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Норма этой ночи</span>
          <span class="stat-value">${esc(formatDuration(plan.durationMinutes))}</span>
        </div>
      </div>
    </section>`;
}

function scaleCard() {
  return `
    <section class="card">
      <h2 class="card-title">Шкала ночи</h2>
      <div class="scale-list">
        <div class="scale-row"><i class="grade-dot grade-green"></i>
          <span>0–${GRADE_LIMITS.green}</span><span class="muted">${GRADE_LABELS.green}</span></div>
        <div class="scale-row"><i class="grade-dot grade-yellow"></i>
          <span>${GRADE_LIMITS.green + 1}–${GRADE_LIMITS.yellow}</span><span class="muted">${GRADE_LABELS.yellow}</span></div>
        <div class="scale-row"><i class="grade-dot grade-red"></i>
          <span>${GRADE_LIMITS.yellow + 1}+</span><span class="muted">${GRADE_LABELS.red}</span></div>
        <div class="scale-row"><i class="grade-dot grade-black"></i>
          <span>срыв</span><span class="muted">меньше 4 часов сна, подъём мимо на 3+ часа или сбитый ритм</span></div>
      </div>
    </section>`;
}

export function renderDashboard(state, flags) {
  const hasToday = Boolean(state.byDate[state.today]);
  const empty = state.days.length === 0;

  return `
    <div class="view">
      ${flags.backupDue ? `<div class="msg warn">
        Давно не делал бэкап. История живёт только в этом браузере —
        <button class="btn-ghost" data-action="export" style="text-decoration:underline;padding:0;color:inherit;font:inherit">скачай JSON</button>.
      </div>` : ''}

      ${flags.storageBlocked ? `<div class="msg error">
        Браузер запретил сохранение данных — записи исчезнут при перезагрузке.
        Выйди из приватного режима или разреши данные сайта.
      </div>` : ''}

      <button class="btn btn-primary" data-action="checkin">
        ${hasToday ? '✏️ Изменить сегодняшний сон' : '🌙 Записать сегодняшний сон'}
      </button>

      ${empty ? `<section class="card">
        <div class="empty">
          <span class="empty-icon">🌘</span>
          Записывай сон каждое утро — одной кнопкой, за 15 секунд.<br>
          Чем меньше штрафных очков за ночь, тем лучше режим.
        </div>
      </section>` : ''}

      ${lastNightCard(state)}
      ${balanceCard(state)}
      ${streaksCard(state)}
      ${formCard(state)}
      ${!empty ? renderBarcode(state, 14) : ''}
      ${milestonesCard(state)}
      ${targetCard(state)}
      ${empty ? scaleCard() : ''}
    </div>`;
}
