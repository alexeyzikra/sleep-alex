/**
 * Модель и все расчёты. Чистые функции: ни DOM, ни localStorage.
 *
 * Главное соглашение: запись привязана к ДАТЕ ПРОБУЖДЕНИЯ.
 * Лёг в 01:30 и встал 19-го — это запись за 19 октября.
 */

// ---------- Время ----------

/** "23:40" -> 1420 (минут от полуночи) */
export function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/** 1420 -> "23:40". Значение приводится к суткам. */
export function fromMinutes(min) {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(v / 60);
  return String(h).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}

/** 455 -> "7 ч 35 мин" */
export function formatDuration(min) {
  const sign = min < 0 ? '−' : '';
  const v = Math.abs(Math.round(min));
  const h = Math.floor(v / 60);
  const m = v % 60;
  if (h === 0) return sign + m + ' мин';
  if (m === 0) return sign + h + ' ч';
  return sign + h + ' ч ' + m + ' мин';
}

/** Со знаком: "+35 мин", "−1 ч 10 мин", "0" */
export function formatSigned(min) {
  const r = Math.round(min);
  if (r === 0) return '0';
  return (r > 0 ? '+' : '') + formatDuration(r);
}

/** Кратчайшее расстояние между двумя точками на циферблате суток */
function circularDistance(a, b) {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}

/** Попадает ли время в окно. Окно может проходить через полночь (23:00–00:30). */
export function inWindow(timeMin, startMin, endMin) {
  if (startMin <= endMin) return timeMin >= startMin && timeMin <= endMin;
  return timeMin >= startMin || timeMin <= endMin;
}

/** На сколько минут время промахнулось мимо окна. 0 — попал. */
export function windowDeviation(timeMin, startMin, endMin) {
  if (inWindow(timeMin, startMin, endMin)) return 0;
  return Math.min(circularDistance(timeMin, startMin), circularDistance(timeMin, endMin));
}

// ---------- Даты ----------

/** Date -> "2026-10-19" в локальной зоне (а не в UTC, как делает toISOString) */
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDays(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return toISODate(date);
}

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateHuman(iso) {
  const date = parseISO(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${WEEKDAYS[date.getDay()]}`;
}

export function weekdayShort(iso) {
  return WEEKDAYS[parseISO(iso).getDay()];
}

/** Понедельник = 0, воскресенье = 6 — для сетки календаря */
export function weekdayIndexMonday(iso) {
  return (parseISO(iso).getDay() + 6) % 7;
}

// ---------- Разбор записи ----------

/**
 * Превращает «часы на циферблате» в непрерывную шкалу.
 * Точка отсчёта — полночь даты пробуждения, поэтому отбой в 23:40
 * даёт −20, а отбой в 01:30 даёт +90. Такая шкала непрерывна вокруг
 * полуночи, и по ней можно считать среднее и разброс без хитростей.
 */
export function resolveEntry(entry) {
  const wakeClock = toMinutes(entry.wakeTime);
  const bedClock = toMinutes(entry.bedTime);

  // Лёг на предыдущую календарную дату, если время отбоя «позже» времени подъёма
  const bedAbs = bedClock > wakeClock ? bedClock - 1440 : bedClock;
  const sleepMinutes = wakeClock - bedAbs;

  let phoneAbs = null;
  let phoneFreeMinutes = null;
  if (entry.phoneOffTime) {
    const p = toMinutes(entry.phoneOffTime);
    // Выбираем ту календарную дату, при которой «отложил телефон»
    // оказывается ближе всего к отбою (в пределах ±12 часов).
    const candidates = [p, p - 1440, p + 1440];
    phoneAbs = candidates.reduce((best, c) =>
      Math.abs(c - bedAbs) < Math.abs(best - bedAbs) ? c : best);
    phoneFreeMinutes = bedAbs - phoneAbs; // отрицательное = сидел в телефоне уже в кровати
  }

  const midpointAbs = (bedAbs + wakeClock) / 2; // «середина сна» на той же шкале

  return { wakeClock, bedClock, bedAbs, sleepMinutes, phoneAbs, phoneFreeMinutes, midpointAbs };
}

// ---------- Оценка одной ночи ----------

export const XP = { NORM: 50, SCHEDULE: 50, NO_PHONE: 30, STREAK3: 100 };

/** Промах больше этого — ночь считается «хаосом» (красный день) */
const CHAOS_MINUTES = 120;

export function scoreEntry(entry, settings) {
  const r = resolveEntry(entry);
  const normMinutes = settings.targetSleepHours * 60;
  const buffer = settings.bufferMinutes;

  const sleepDeviation = r.sleepMinutes - normMinutes; // + пересып, − недосып
  const hitNorm = Math.abs(sleepDeviation) <= buffer;

  const bedDeviation = windowDeviation(
    r.bedClock, toMinutes(settings.bedWindow.start), toMinutes(settings.bedWindow.end));
  const wakeDeviation = windowDeviation(
    r.wakeClock, toMinutes(settings.wakeWindow.start), toMinutes(settings.wakeWindow.end));

  const onSchedule = bedDeviation === 0 && wakeDeviation === 0;
  const nearSchedule = bedDeviation <= buffer && wakeDeviation <= buffer;
  const noPhone = Boolean(entry.hygiene && entry.hygiene.noPhone);

  const awards = [];
  if (hitNorm) awards.push({ reason: 'Сон близко к норме', amount: XP.NORM });
  if (onSchedule) awards.push({ reason: 'Лёг и встал в целевое окно', amount: XP.SCHEDULE });
  if (noPhone) awards.push({ reason: 'Без телефона перед сном', amount: XP.NO_PHONE });
  const baseXp = awards.reduce((sum, a) => sum + a.amount, 0);

  const worstDeviation = Math.max(bedDeviation, wakeDeviation, Math.abs(sleepDeviation));
  let grade;
  if (onSchedule && hitNorm) grade = 'green';
  else if (worstDeviation > CHAOS_MINUTES) grade = 'red';
  else grade = 'yellow';

  return {
    ...r, entry,
    normMinutes, sleepDeviation, hitNorm,
    bedDeviation, wakeDeviation, onSchedule, nearSchedule, noPhone,
    awards, baseXp, grade,
  };
}

// ---------- Уровни ----------

export const LEVELS = [
  // Пороги рассчитаны на реальный темп: хорошая ночь даёт 130 XP,
  // плюс 100 за каждый третий день подряд по графику — то есть
  // порядка 100 XP в день при нормальном использовании.
  // Отсюда: Lvl 2 ≈ 3 дня, Lvl 3 ≈ 2 недели, Lvl 4 ≈ месяц,
  // Lvl 5 ≈ 2 месяца, Lvl 6 ≈ 4 месяца.
  { level: 1, from: 0, title: 'Сонный Зомби', icon: '🧟' },
  { level: 2, from: 300, title: 'Дневной Дрыщ', icon: '😪' },
  { level: 3, from: 1200, title: 'Осознанный Студент', icon: '🧑‍🎓' },
  { level: 4, from: 3000, title: 'Мастер Циркадных Ритмов', icon: '🌗' },
  { level: 5, from: 6000, title: 'Повелитель Снов', icon: '🌌' },
  { level: 6, from: 12000, title: 'Легенда Режима', icon: '🏆' },
];

export function levelInfo(xp) {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].from) index = i;
  const current = LEVELS[index];
  const next = LEVELS[index + 1] || null;
  const span = next ? next.from - current.from : 1;
  const progress = next ? Math.min(1, (xp - current.from) / span) : 1;
  return {
    ...current, next, progress,
    toNext: next ? Math.max(0, next.from - xp) : 0,
  };
}

// ---------- Свод по всей истории ----------

/** Стандартное отклонение, минуты */
function stdev(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Пересчитывает ВСЁ из записей и настроек. Единственный источник правды —
 * сами записи, поэтому XP не может «разойтись» с историей.
 *
 * Пропущенные дни стрик не рвут и не продлевают: идём по заполненным
 * ночам и просто пропускаем дырки.
 */
export function computeState(data, today = todayISO()) {
  const settings = data.settings;
  const days = Object.values(data.entries)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((entry) => scoreEntry(entry, settings));

  // XP со бонусами за стрик x3
  let run = 0;
  let bestScheduleStreak = 0;
  let totalXp = 0;
  for (const day of days) {
    if (day.onSchedule) {
      run += 1;
      bestScheduleStreak = Math.max(bestScheduleStreak, run);
      day.bonus = run % 3 === 0 ? XP.STREAK3 : 0;
    } else {
      run = 0;
      day.bonus = 0;
    }
    day.dayXp = day.baseXp + day.bonus;
    totalXp += day.dayXp;
  }

  // Текущие стрики — с конца, по заполненным ночам
  const countFromEnd = (predicate) => {
    let n = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (!predicate(days[i])) break;
      n += 1;
    }
    return n;
  };
  const scheduleStreak = countFromEnd((d) => d.onSchedule);
  const phoneStreak = countFromEnd((d) => d.noPhone);

  let bestPhoneStreak = 0;
  let phoneRun = 0;
  for (const day of days) {
    phoneRun = day.noPhone ? phoneRun + 1 : 0;
    bestPhoneStreak = Math.max(bestPhoneStreak, phoneRun);
  }

  const byDate = {};
  for (const day of days) byDate[day.entry.date] = day;

  return {
    settings, today, days, byDate, totalXp,
    level: levelInfo(totalXp),
    scheduleStreak, phoneStreak, bestScheduleStreak, bestPhoneStreak,
    balance: sleepBalance(days, settings, today, 7),
    stats: weekStats(days, settings, today),
    achievements: evaluateAchievements({
      days, totalXp, bestScheduleStreak, bestPhoneStreak,
      balance: sleepBalance(days, settings, today, 7),
      stats: weekStats(days, settings, today),
    }),
  };
}

/** Баланс сна: сколько набежало относительно нормы за последние N дней */
export function sleepBalance(days, settings, today, windowDays) {
  const from = addDays(today, -(windowDays - 1));
  const used = days.filter((d) => d.entry.date >= from && d.entry.date <= today);
  const balanceMinutes = used.reduce((sum, d) => sum + d.sleepDeviation, 0);
  return { balanceMinutes, nights: used.length, windowDays, from, to: today };
}

/** Статистика за последние 7 заполненных ночей */
export function weekStats(days, settings, today) {
  const last = days.slice(-7);
  if (last.length === 0) {
    return { nights: 0, avgSleep: null, bedSpread: null, wakeSpread: null, avgMidpoint: null, worstFactor: null };
  }
  const avgSleep = last.reduce((s, d) => s + d.sleepMinutes, 0) / last.length;
  const avgMidpoint = last.reduce((s, d) => s + d.midpointAbs, 0) / last.length;

  // Фактор, который чаще всего не соблюдён в неудачные ночи
  const FACTORS = [
    { key: 'noPhone', label: 'телефон перед сном' },
    { key: 'noCaffeine', label: 'кофе во второй половине дня' },
    { key: 'goodRoom', label: 'душная или светлая комната' },
  ];
  const bad = days.filter((d) => d.grade !== 'green');
  let worstFactor = null;
  if (bad.length >= 5) {
    const counts = FACTORS.map((f) => ({
      ...f,
      count: bad.filter((d) => !(d.entry.hygiene && d.entry.hygiene[f.key])).length,
    })).sort((a, b) => b.count - a.count);
    if (counts[0].count > 0) {
      worstFactor = { ...counts[0], of: bad.length };
    }
  }

  return {
    nights: last.length,
    avgSleep,
    bedSpread: stdev(last.map((d) => d.bedAbs)),
    wakeSpread: stdev(last.map((d) => d.wakeClock)),
    avgMidpoint,
    worstFactor,
    badNights: bad.length,
  };
}

// ---------- Достижения ----------

export const ACHIEVEMENTS = [
  { id: 'first', icon: '🌙', title: 'Первая ночь', desc: 'Записал первый сон',
    test: (s) => s.days.length >= 1 },
  { id: 'week', icon: '📅', title: 'Неделя наблюдений', desc: '7 записанных ночей',
    test: (s) => s.days.length >= 7 },
  { id: 'month', icon: '🗓️', title: 'Месяц наблюдений', desc: '30 записанных ночей',
    test: (s) => s.days.length >= 30 },
  { id: 'sched3', icon: '🔥', title: 'Три по графику', desc: '3 ночи подряд в целевом окне',
    test: (s) => s.bestScheduleStreak >= 3 },
  { id: 'sched7', icon: '🔥', title: 'Неделя по графику', desc: '7 ночей подряд в целевом окне',
    test: (s) => s.bestScheduleStreak >= 7 },
  { id: 'phone5', icon: '📱', title: 'Телефон в стороне', desc: '5 ночей подряд без телефона перед сном',
    test: (s) => s.bestPhoneStreak >= 5 },
  { id: 'nodebt', icon: '⚖️', title: 'Долгов нет', desc: 'Баланс сна за неделю вышел в плюс',
    test: (s) => s.balance.nights >= 5 && s.balance.balanceMinutes >= 0 },
  { id: 'steady', icon: '🎯', title: 'Стабильность', desc: 'Разброс отбоя меньше 45 минут за 7 ночей',
    test: (s) => s.stats.nights >= 7 && s.stats.bedSpread !== null && s.stats.bedSpread < 45 },
  { id: 'no6h', icon: '💪', title: 'Без провалов', desc: '14 ночей подряд, ни одной короче 6 часов',
    test: (s) => s.days.length >= 14 && s.days.slice(-14).every((d) => d.sleepMinutes >= 360) },
  { id: 'energy', icon: '⚡', title: 'На зарядке', desc: '3 ночи подряд с энергией 8 и выше',
    test: (s) => s.days.slice(-3).length === 3 && s.days.slice(-3).every((d) => (d.entry.energy || 0) >= 8) },
  { id: 'xp1000', icon: '🏆', title: 'Тысячник', desc: 'Набрать 1000 XP',
    test: (s) => s.totalXp >= 1000 },
];

export function evaluateAchievements(summary) {
  return ACHIEVEMENTS.map((a) => {
    let unlocked = false;
    try { unlocked = Boolean(a.test(summary)); } catch { unlocked = false; }
    return { ...a, unlocked };
  });
}

// ---------- Валидация формы ----------

export function validateEntry(entry) {
  const errors = [];
  const warnings = [];
  if (!entry.bedTime) errors.push('Укажи, во сколько лёг.');
  if (!entry.wakeTime) errors.push('Укажи, во сколько проснулся.');
  if (errors.length) return { errors, warnings, resolved: null };

  const r = resolveEntry(entry);
  if (r.sleepMinutes <= 0) {
    errors.push('Подъём получился раньше отбоя — проверь время.');
  } else {
    if (r.sleepMinutes < 60) warnings.push('Меньше часа сна — это точно верные значения?');
    if (r.sleepMinutes > 14 * 60) warnings.push('Больше 14 часов сна — проверь, не перепутаны ли времена.');
  }
  if (r.phoneFreeMinutes !== null && r.phoneFreeMinutes < 0) {
    warnings.push(`Телефон отложен на ${formatDuration(-r.phoneFreeMinutes)} позже отбоя — значит, листал уже в кровати.`);
  }
  return { errors, warnings, resolved: r };
}
