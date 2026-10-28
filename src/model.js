/**
 * Модель и все расчёты. Чистые функции: ни DOM, ни localStorage.
 *
 * Главное соглашение: запись привязана к ДАТЕ ПРОБУЖДЕНИЯ.
 * Лёг в 01:30 и встал 19-го — это запись за 19 октября.
 *
 * Оценка ночи — через ШТРАФНЫЕ ОЧКИ: каждое нарушение добавляет очки,
 * сумма попадает в один из уровней (зелёный / жёлтый / красный / чёрный).
 * Ноль очков — идеальная ночь.
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

/** Компактно, для узких колонок: 470 -> "7ч50", 480 -> "8ч" */
export function formatCompact(min) {
  const v = Math.max(0, Math.round(min));
  const h = Math.floor(v / 60);
  const m = v % 60;
  return m === 0 ? `${h}ч` : `${h}ч${String(m).padStart(2, '0')}`;
}

/** Со знаком: "+35 мин", "−1 ч 10 мин", "0" */
export function formatSigned(min) {
  const r = Math.round(min);
  if (r === 0) return '0';
  return (r > 0 ? '+' : '') + formatDuration(r);
}

/** Кратчайшее расстояние между двумя точками на циферблате суток */
export function circularDistance(a, b) {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
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

/** Дни недели в порядке «понедельник первый», с индексом JS getDay() */
export const WEEK_ORDER = [
  { index: 1, short: 'пн', full: 'Понедельник' },
  { index: 2, short: 'вт', full: 'Вторник' },
  { index: 3, short: 'ср', full: 'Среда' },
  { index: 4, short: 'чт', full: 'Четверг' },
  { index: 5, short: 'пт', full: 'Пятница' },
  { index: 6, short: 'сб', full: 'Суббота' },
  { index: 0, short: 'вс', full: 'Воскресенье' },
];

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

// ---------- Чётность недели ----------

/**
 * Номер недели по ISO 8601 — тот же, что показывают календари.
 * Нужен для расписаний, которые чередуются через неделю.
 */
export function isoWeek(dateISO) {
  const date = parseISO(dateISO);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Переходим на четверг своей недели: по ISO год недели определяет именно он
  target.setDate(target.getDate() - ((target.getDay() + 6) % 7) + 3);

  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);

  return 1 + Math.round((target - firstThursday) / (7 * 86400000));
}

/**
 * 'even' — чётная неделя, 'odd' — нечётная.
 *
 * Номер ISO-недели считается от начала года, а в учебном расписании
 * чётность обычно отсчитывают от начала семестра — совпадать они
 * не обязаны. Поэтому точка отсчёта не угадывается, а задаётся
 * пользователем: weekParityOffset сдвигает нумерацию на единицу,
 * если приложение разошлось с его расписанием.
 */
export function weekParity(dateISO, settings) {
  const offset = Number(settings && settings.weekParityOffset) ? 1 : 0;
  return (isoWeek(dateISO) + offset) % 2 === 0 ? 'even' : 'odd';
}

export const PARITY_LABELS = { even: 'чёт', odd: 'нечёт' };

// ---------- План на конкретную ночь ----------

/** Промежуток между отбоем и подъёмом, с переходом через полночь */
function spanOf(bedTime, wakeTime) {
  const wakeClock = toMinutes(wakeTime);
  const bedClock = toMinutes(bedTime);
  const bedAbs = bedClock > wakeClock ? bedClock - 1440 : bedClock;
  return { bedTime, wakeTime, bedClock, wakeClock, bedAbs, durationMinutes: wakeClock - bedAbs };
}

/** Расписание конкретного дня недели, с учётом чётности, или null */
function daySchedule(settings, dayOfWeek, parity) {
  if (settings.scheduleMode !== 'weekly') return null;
  const day = settings.days && settings.days[dayOfWeek];
  if (!day) return null;
  // Основной вариант — чётная неделя, alt — нечётная.
  // Нет alt — день одинаков обе недели.
  return (day.alt && parity === 'odd') ? day.alt : day;
}

/**
 * Якорь ритма — то, относительно чего считается «сдвиг плана».
 *
 * В простом режиме это единственное время подъёма. В недельном —
 * медиана всех запланированных подъёмов, включая оба варианта
 * чередующихся дней. Отдельной настройки якоря не нужно: он и так
 * однозначно следует из расписания.
 */
export function anchorWake(settings) {
  if (settings.scheduleMode !== 'weekly') return toMinutes(settings.wakeTime);

  const times = [];
  for (const day of WEEK_ORDER) {
    const entry = settings.days && settings.days[day.index];
    if (!entry) { times.push(toMinutes(settings.wakeTime)); continue; }
    times.push(toMinutes(entry.wakeTime));
    if (entry.alt) times.push(toMinutes(entry.alt.wakeTime));
  }
  const sorted = times.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Во сколько по плану надо лечь и встать именно в эту ночь.
 *
 * Норма часов НЕ вводится руками: она всегда равна промежутку между
 * отбоем и подъёмом, поэтому противоречивые настройки («ложусь в 23:00,
 * встаю в 6:00, сплю 9 часов») невозможны в принципе.
 *
 * Если у записи есть снимок плана (snapshot), берётся он. Расписание —
 * исторический факт: какой у тебя был план в ту ночь. Иначе смена
 * режима задним числом превращала бы прошлые идеальные ночи в провалы,
 * потому что они оценивались бы по плану, которого тогда не было.
 * Веса штрафов, наоборот, остаются общими и применяются ко всей истории.
 */
export function plannedFor(dateISO, settings, snapshot) {
  const dayOfWeek = parseISO(dateISO).getDay();
  const parity = weekParity(dateISO, settings);
  const scheduled = daySchedule(settings, dayOfWeek, parity);

  const frozen = snapshot && snapshot.bedTime && snapshot.wakeTime;

  const span = frozen
    ? spanOf(snapshot.bedTime, snapshot.wakeTime)
    : (scheduled
      ? spanOf(scheduled.bedTime, scheduled.wakeTime)
      : spanOf(settings.bedTime, settings.wakeTime));

  const anchor = (frozen && snapshot.anchor)
    ? toMinutes(snapshot.anchor)
    : anchorWake(settings);

  const entry = settings.days && settings.days[dayOfWeek];

  return {
    ...span,
    parity,
    week: isoWeek(dateISO),
    frozen: Boolean(frozen),
    alternates: Boolean(settings.scheduleMode === 'weekly' && entry && entry.alt),
    isWeekly: settings.scheduleMode === 'weekly',
    driftFromAnchor: circularDistance(span.wakeClock, anchor),
  };
}

/** Снимок плана, который кладётся в запись в момент её создания */
export function planSnapshot(dateISO, settings) {
  const plan = plannedFor(dateISO, settings);
  return {
    bedTime: plan.bedTime,
    wakeTime: plan.wakeTime,
    anchor: fromMinutes(anchorWake(settings)),
  };
}

/** Самое частое значение; при ничьей — встреченное раньше по неделе */
function mostFrequent(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);

  let best = values[0];
  let bestCount = 0;
  for (const v of values) {
    const count = counts.get(v);
    if (count > bestCount) { best = v; bestCount = count; }
  }
  return best;
}

/**
 * Типичный план — одна пара времён на весь штрих-код.
 *
 * В недельном режиме расписание у каждого дня своё, но ломать линии
 * по дням смысла нет: глазу нужна прямая, относительно которой видно
 * разброс. Поэтому берутся самые частые времена отбоя и подъёма —
 * в отличие от медианы они всегда совпадают с реальным днём расписания.
 */
export function referencePlan(settings) {
  if (settings.scheduleMode !== 'weekly') {
    return { ...spanOf(settings.bedTime, settings.wakeTime), isTypical: false };
  }

  const beds = [];
  const wakes = [];
  for (const day of WEEK_ORDER) {
    const entry = settings.days && settings.days[day.index];
    if (!entry) {
      beds.push(settings.bedTime);
      wakes.push(settings.wakeTime);
      continue;
    }
    beds.push(entry.bedTime);
    wakes.push(entry.wakeTime);
    if (entry.alt) {
      beds.push(entry.alt.bedTime);
      wakes.push(entry.alt.wakeTime);
    }
  }

  return { ...spanOf(mostFrequent(beds), mostFrequent(wakes)), isTypical: true };
}

/** Раскладка недели для экрана настроек */
export function weeklyPlan(settings) {
  const anchor = anchorWake(settings);

  return WEEK_ORDER.map((day) => {
    const entry = (settings.days && settings.days[day.index])
      || { bedTime: settings.bedTime, wakeTime: settings.wakeTime };

    const variant = (source) => {
      const span = spanOf(source.bedTime, source.wakeTime);
      return { ...span, driftFromAnchor: circularDistance(span.wakeClock, anchor) };
    };

    return {
      ...day,
      main: variant(entry),
      alt: entry.alt ? variant(entry.alt) : null,
      alternates: Boolean(entry.alt),
    };
  });
}

// ---------- Штрафные очки ----------

/**
 * Веса подобраны «на глаз» по принципу «регулярность важнее длительности»
 * и нуждаются в калибровке. Всё в одном месте, чтобы крутить было просто.
 */
export const PENALTY = {
  // За каждую минуту отклонения факта от плана
  wakeDeviationPerMin: 1.5,   // подъём — главный якорь ритма, вес наибольший
  bedLatePerMin: 1.0,         // лёг позже плана
  bedEarlyPerMin: 0.5,        // лёг раньше — нарушение ритма, но куда безобиднее

  // За каждую минуту отклонения длительности от нормы этой ночи
  underSleepPerMin: 1.2,
  overSleepPerMin: 0.5,

  // Сам план уехал от якоря: штраф за каждую минуту СВЕРХ часа.
  // Это то, что не даёт «законно» спать до обеда по субботам,
  // просто прописав субботу в настройках.
  planDriftPerMin: 1.0,
  planDriftGraceMin: 60,

  /**
   * Экран перед сном. Шкала градуальная, а не пороговая: фиксированная
   * отсечка «за 30 минут» в данных держится слабо (когортное исследование
   * JAMA Pediatrics 2024 связи не нашло), а вот экран уже В КРОВАТИ —
   * самый устойчивый сигнал (Frontiers 2025: +59% к шансам бессонницы
   * за каждый лишний час). Поэтому время в кровати штрафуется круче.
   * Час до сна как точка нуля — самая цитируемая рекомендация (AAP),
   * но разброс в источниках 30–60 минут, так что цифра калибруемая.
   */
  phone: {
    freeAfterMin: 60,    // отложил за час и раньше — штрафа нет
    // Срезано неравномерно и намеренно: отсечка «за час до сна»
    // в данных держится слабо, а экран уже в кровати — сильный сигнал.
    // Поэтому «до сна» вдвое дешевле прежнего, «в кровати» — в полтора.
    perMinBefore: 0.45,
    perMinInBed: 1.0,
    max: 200,   // потолок выше красной границы: по данным это сильнейший одиночный фактор
  },

  /**
   * Нарушения отмечаются галочкой: по умолчанию ничего не нарушено
   * и отмечать нечего. Обратный вариант («не пил кофе») заставлял бы
   * каждое утро подтверждать то, что и так верно почти всегда.
   */
  violations: {
    caffeine: 35,
    badRoom: 20,
    snoozed: 30,
  },

  /**
   * Положительные действия: гасят набранные очки, а не добавляют свои.
   * Утренний свет — главный задатчик циркадных часов, то есть бьёт
   * ровно в ту цель, ради которой всё и затевалось. По весу примерно
   * равен одному мелкому нарушению: день он вытянуть может, сорванную
   * ночь — нет.
   */
  bonuses: {
    morningLight: 30,
  },
};

/**
 * Множитель штрафа в зависимости от накопленного баланса.
 *
 * Гасишь дисбаланс — вдвое дешевле: при долге лечь раньше и поспать
 * дольше это осознанное отсыпание, а не нарушение режима. Углубляешь —
 * вдвое дороже: недосып поверх долга бьёт сильнее отдельной короткой
 * ночи, потому что вред от накопленного долга нелинеен.
 *
 * Множители связаны одной константой: factor и обратный ему.
 *
 * Подъём не масштабируется НИКОГДА: отсыпаться, вставая позже, — не тот
 * способ, ритм ставит именно стабильное время подъёма.
 *
 * Баланс берётся ДО этой ночи, иначе ночь влияла бы на собственный штраф.
 */
export const BALANCE_RELIEF = {
  windowDays: 7,
  minMinutes: 30,   // меньше — шум, ничего не меняем
  factor: 0.5,
};

/** Границы уровней по сумме очков. Выше жёлтого — красный. */
export const GRADE_LIMITS = { green: 50, yellow: 180 };

/**
 * Порог «чистой ночи» для стрика — отдельный от зелёного уровня.
 *
 * Зелёный калиброван как «идеально», а стрик должен означать
 * «стараюсь и в целом держусь»: мелкие отклонения складываются,
 * и на бюджете в 50 очков обычная приличная ночь (чуть позже лёг,
 * чуть позже встал, телефон за полчаса) уже не проходила бы —
 * стрик рвался бы постоянно и демотивировал.
 */
export const STREAK_CLEAN_LIMIT = 100;

/** Чёрный уровень — не по сумме, а по отдельным правилам «так нельзя». */
export const BLACK_RULES = {
  minSleepMinutes: 240,     // меньше 4 часов сна
  maxWakeDeviation: 180,    // встал на 3+ часа мимо плана
  maxMidpointShift: 180,    // середина сна уехала на 3+ часа от привычной
};

export const GRADE_LABELS = {
  green: 'всё в порядке',
  yellow: 'есть над чем поработать',
  red: 'режим сбит',
  black: 'так нельзя',
};

export const BONUS_LABELS = {
  morningLight: 'Утром сразу вышел на свет',
};

export const VIOLATION_LABELS = {
  caffeine: 'Кофе или энергетики во второй половине дня',
  badRoom: 'Душная, жаркая или светлая комната',
  snoozed: 'Вставал не с первого раза, откладывал будильник',
};

/** Отложил телефон за столько минут и раньше — чисто */
export const PHONE_CLEAN_MINUTES = PENALTY.phone.freeAfterMin;

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

  const bedAbs = bedClock > wakeClock ? bedClock - 1440 : bedClock;
  const sleepMinutes = wakeClock - bedAbs;

  // Телефон задаётся либо «за сколько минут до сна», либо точным временем.
  // Промежуток — источник правды, если он указан: иначе правка времени
  // отбоя молча меняла бы и его.
  let phoneAbs = null;
  let phoneFreeMinutes = null;
  if (Number.isFinite(entry.phoneGapMinutes)) {
    phoneFreeMinutes = entry.phoneGapMinutes;
    phoneAbs = bedAbs - phoneFreeMinutes;
  } else if (entry.phoneOffTime) {
    const p = toMinutes(entry.phoneOffTime);
    // Выбираем ту календарную дату, при которой «отложил телефон»
    // оказывается ближе всего к отбою (в пределах ±12 часов).
    const candidates = [p, p - 1440, p + 1440];
    phoneAbs = candidates.reduce((best, c) =>
      Math.abs(c - bedAbs) < Math.abs(best - bedAbs) ? c : best);
    phoneFreeMinutes = bedAbs - phoneAbs;
  }

  const midpointAbs = (bedAbs + wakeClock) / 2;

  return { wakeClock, bedClock, bedAbs, sleepMinutes, phoneAbs, phoneFreeMinutes, midpointAbs };
}

// ---------- Оценка одной ночи ----------

/**
 * @param context { midpointBaseline } — привычная середина сна (медиана
 *        предыдущих ночей) или null, если истории ещё мало.
 */
export function scoreEntry(entry, settings, context = {}) {
  const r = resolveEntry(entry);
  const plan = plannedFor(entry.date, settings, entry.plan);

  const reasons = [];
  const add = (label, points, detail) => {
    const rounded = Math.round(points);
    if (rounded > 0) reasons.push({ label, points: rounded, detail });
  };

  // 1. Подъём мимо плана
  const wakeDeviation = circularDistance(r.wakeClock, plan.wakeClock);
  const wakeLate = r.wakeClock > plan.wakeClock;
  add(
    wakeLate ? 'Встал позже плана' : 'Встал раньше плана',
    wakeDeviation * PENALTY.wakeDeviationPerMin,
    `на ${formatDuration(wakeDeviation)} (план ${plan.wakeTime})`
  );

  // Накопленный долг или излишек до этой ночи
  const balanceBefore = Number(context.balanceBefore) || 0;
  const hasDebt = balanceBefore <= -BALANCE_RELIEF.minMinutes;
  const hasSurplus = balanceBefore >= BALANCE_RELIEF.minMinutes;
  // 'repay' — гасишь дисбаланс, 'worsen' — углубляешь, null — баланс ровный
  const direction = (repayWhen, worsenWhen) => {
    if (repayWhen) return 'repay';
    if (worsenWhen) return 'worsen';
    return null;
  };
  const scale = (dir) => {
    if (dir === 'repay') return BALANCE_RELIEF.factor;
    if (dir === 'worsen') return 1 / BALANCE_RELIEF.factor;
    return 1;
  };
  const scaleNote = (dir, debtWord, surplusWord) => {
    if (!dir) return '';
    const what = hasDebt ? debtWord : surplusWord;
    return dir === 'repay' ? ` · вдвое меньше: ${what}` : ` · вдвое больше: ${what}`;
  };
  const DEBT = { repay: 'гасишь долг сна', worsen: 'углубляешь долг сна' };
  const SURPLUS = { repay: 'тратишь запас часов', worsen: 'копишь лишние часы' };

  // 2. Отбой мимо плана
  const bedDeviationSigned = r.bedAbs - plan.bedAbs;
  const bedDeviation = Math.abs(bedDeviationSigned);
  const bedLate = bedDeviationSigned > 0;
  // Лёг раньше: гасит долг, но при излишке копит лишние часы.
  // Лёг позже: тратит запас, но при долге углубляет его.
  const bedDir = bedLate
    ? direction(hasSurplus, hasDebt)
    : direction(hasDebt, hasSurplus);
  add(
    bedLate ? 'Лёг позже плана' : 'Лёг раньше плана',
    bedDeviation * (bedLate ? PENALTY.bedLatePerMin : PENALTY.bedEarlyPerMin) * scale(bedDir),
    `на ${formatDuration(bedDeviation)} (план ${plan.bedTime})`
      + scaleNote(bedDir, bedLate ? DEBT.worsen : DEBT.repay, bedLate ? SURPLUS.repay : SURPLUS.worsen)
  );

  // 3. Длительность сна мимо нормы этой ночи
  const sleepDeviation = r.sleepMinutes - plan.durationMinutes;
  if (sleepDeviation < 0) {
    // Недосып тратит запас, но поверх долга углубляет его
    const dir = direction(hasSurplus, hasDebt);
    add('Недосып', -sleepDeviation * PENALTY.underSleepPerMin * scale(dir),
      `${formatDuration(-sleepDeviation)} до нормы (${formatDuration(plan.durationMinutes)})`
        + scaleNote(dir, DEBT.worsen, SURPLUS.repay));
  } else {
    // Пересып гасит долг, но поверх запаса копит лишние часы
    const dir = direction(hasDebt, hasSurplus);
    add('Пересып', sleepDeviation * PENALTY.overSleepPerMin * scale(dir),
      `${formatDuration(sleepDeviation)} сверх нормы (${formatDuration(plan.durationMinutes)})`
        + scaleNote(dir, DEBT.repay, SURPLUS.worsen));
  }

  // 4. Сам план этого дня уехал от якоря подъёма
  const driftExcess = Math.max(0, plan.driftFromAnchor - PENALTY.planDriftGraceMin);
  add('План дня сдвинут от обычного подъёма', driftExcess * PENALTY.planDriftPerMin,
    `${plan.wakeTime} против обычных ${fromMinutes(anchorWake(settings))}`);

  // 5. Экран перед сном — по времени, а не галочкой
  const gap = r.phoneFreeMinutes;
  if (gap !== null) {
    const { freeAfterMin, perMinBefore, perMinInBed, max } = PENALTY.phone;
    if (gap < 0) {
      // Телефон уже в кровати: полный штраф «ноль минут» плюс время в кровати
      const points = freeAfterMin * perMinBefore + (-gap) * perMinInBed;
      add('Листал телефон уже в кровати', Math.min(points, max),
        `${formatDuration(-gap)} после отбоя`);
    } else if (gap < freeAfterMin) {
      add('Отложил телефон слишком поздно', (freeAfterMin - gap) * perMinBefore,
        `за ${formatDuration(gap)} до сна вместо часа`);
    }
  }

  // 6. Отмеченные нарушения
  for (const [key, points] of Object.entries(PENALTY.violations)) {
    if (entry.violations && entry.violations[key]) add(VIOLATION_LABELS[key], points);
  }

  // 7. Положительные действия вычитаются из набранного
  const bonuses = [];
  for (const [key, points] of Object.entries(PENALTY.bonuses)) {
    if (entry.bonuses && entry.bonuses[key]) {
      bonuses.push({ label: BONUS_LABELS[key], points });
    }
  }

  const rawPenalty = reasons.reduce((sum, item) => sum + item.points, 0);
  const bonusTotal = bonuses.reduce((sum, item) => sum + item.points, 0);
  // Ниже нуля не уходим: идеальная ночь не должна копить запас на будущее
  const totalPenalty = Math.max(0, rawPenalty - bonusTotal);

  // Чёрный уровень — отдельные правила, а не сумма очков
  const blackFlags = [];
  if (r.sleepMinutes < BLACK_RULES.minSleepMinutes) {
    blackFlags.push(`Меньше ${BLACK_RULES.minSleepMinutes / 60} часов сна`);
  }
  if (wakeDeviation > BLACK_RULES.maxWakeDeviation) {
    blackFlags.push(`Подъём мимо плана больше чем на ${BLACK_RULES.maxWakeDeviation / 60} часа`);
  }
  const baseline = context.midpointBaseline;
  if (baseline !== null && baseline !== undefined) {
    const shift = Math.abs(r.midpointAbs - baseline);
    if (shift > BLACK_RULES.maxMidpointShift) {
      blackFlags.push(`Середина сна уехала на ${formatDuration(shift)} от привычной`);
    }
  }

  let grade;
  if (blackFlags.length) grade = 'black';
  else if (totalPenalty <= GRADE_LIMITS.green) grade = 'green';
  else if (totalPenalty <= GRADE_LIMITS.yellow) grade = 'yellow';
  else grade = 'red';

  return {
    ...r, entry, plan,
    wakeDeviation, bedDeviation, bedLate, sleepDeviation,
    reasons, bonuses, rawPenalty, bonusTotal, totalPenalty, blackFlags, grade,
  };
}

/** Медиана — устойчивее среднего к одной-двум диким ночам */
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdev(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

/**
 * Стрик записей: сколько дней подряд у тебя заполнены ночи.
 *
 * Считается по ДАТАМ, а не по моменту нажатия кнопки — заполнил
 * пропущенную ночь задним числом, и стрик восстановился. Но если
 * не вносить вообще ничего дольше пяти дней, он сгорает: после такой
 * паузы счёт начинается заново, даже если пропущенное потом заполнить.
 */
export const RECORD_GRACE_DAYS = 5;

export function recordingStreak(days, today) {
  if (!days.length) return 0;

  const filled = new Set(days.map((d) => d.entry.date));

  // Моменты, когда пользователь реально садился заполнять
  const stamps = days
    .map((d) => Date.parse(d.entry.createdAt))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b);

  let restartedOn = null;
  if (stamps.length) {
    // Молчишь дольше отведённого прямо сейчас — стрик уже сгорел
    const silentDays = (Date.now() - stamps[stamps.length - 1]) / 86400000;
    if (silentDays > RECORD_GRACE_DAYS) return 0;

    // Иначе ищем последнюю такую паузу: раньше неё стрик не тянется
    for (let i = 1; i < stamps.length; i++) {
      if ((stamps[i] - stamps[i - 1]) / 86400000 > RECORD_GRACE_DAYS) {
        restartedOn = toISODate(new Date(stamps[i]));
      }
    }
  }

  // Сегодня ещё можно успеть записать, поэтому пустое «сегодня» стрик не рвёт
  let cursor = filled.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (filled.has(cursor) && (!restartedOn || cursor >= restartedOn)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Сколько ночей нужно, чтобы «привычная середина сна» вообще что-то значила */
const BASELINE_MIN_NIGHTS = 5;

// ---------- Форма ----------

/**
 * «Форма» вместо уровней.
 *
 * Уровни на накопительных очках показывали посещаемость, а не сон:
 * три месяца плохого режима всё равно оставляли высокий уровень,
 * потому что очки только прибавлялись. Форма — это среднее число
 * штрафных очков за ночь в скользящем окне: она растёт и падает
 * вместе с реальным положением дел и не накручивается тем,
 * что ты просто открываешь приложение.
 */

export const FORM_WINDOW = 7;
export const FORM_MIN_NIGHTS = 4;

export const FORM_BANDS = [
  { upTo: 60, title: 'Режим держится', tone: 'green' },
  { upTo: 150, title: 'Режим съезжает', tone: 'yellow' },
  { upTo: Infinity, title: 'Режим сбит', tone: 'red' },
];

function averagePenalty(days) {
  if (!days.length) return null;
  return days.reduce((sum, d) => sum + d.totalPenalty, 0) / days.length;
}

/**
 * Окно — неделя, а не две: за две недели хорошая неделя после плохой
 * всё равно показывала бы «режим сбит», хотя сейчас всё уже в порядке.
 * Тренд сравнивает эту неделю с предыдущей.
 */
export function computeForm(days) {
  const window = days.slice(-FORM_WINDOW);
  if (window.length < FORM_MIN_NIGHTS) {
    return {
      nights: window.length,
      enough: false,
      needed: FORM_MIN_NIGHTS - window.length,
      avgPenalty: null, band: null, trend: null,
    };
  }

  const avgPenalty = averagePenalty(window);
  const band = FORM_BANDS.find((b) => avgPenalty <= b.upTo);

  const recent = days.slice(-7);
  const previous = days.slice(-14, -7);
  let trend = null;
  if (recent.length >= 3 && previous.length >= 3) {
    const delta = averagePenalty(recent) - averagePenalty(previous);
    trend = {
      delta: Math.round(delta),
      direction: Math.abs(delta) < 5 ? 'flat' : (delta < 0 ? 'better' : 'worse'),
    };
  }

  return { nights: window.length, enough: true, avgPenalty, band, trend };
}

// ---------- Свод по всей истории ----------

/**
 * Пересчитывает ВСЁ из записей и настроек. Единственный источник правды —
 * сами записи, поэтому ничего не может «разойтись» с историей.
 *
 * Пропущенные дни стрик не рвут и не продлевают: идём по заполненным
 * ночам и просто пропускаем дырки.
 */
export function computeState(data, today = todayISO()) {
  const settings = data.settings;
  const sorted = Object.values(data.entries).sort((a, b) => (a.date < b.date ? -1 : 1));

  // Привычная середина сна считается по ПРЕДЫДУЩИМ ночам, иначе дикая
  // ночь сама себя сделала бы нормой и чёрный флаг не сработал бы.
  const days = [];
  const midpointHistory = [];
  for (const entry of sorted) {
    const baseline = midpointHistory.length >= BASELINE_MIN_NIGHTS
      ? median(midpointHistory.slice(-14))
      : null;
    // Баланс по уже оценённым предыдущим ночам того же окна,
    // что показано на дашборде, но без текущей ночи
    const from = addDays(entry.date, -BALANCE_RELIEF.windowDays);
    const balanceBefore = days
      .filter((d) => d.entry.date >= from && d.entry.date < entry.date)
      .reduce((sum, d) => sum + d.sleepDeviation, 0);

    days.push(scoreEntry(entry, settings, { midpointBaseline: baseline, balanceBefore }));
    midpointHistory.push(days[days.length - 1].midpointAbs);
  }

  const countFromEnd = (predicate) => {
    let n = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (!predicate(days[i])) break;
      n += 1;
    }
    return n;
  };
  // Срыв не засчитывается никогда, даже если сумма очков невелика
  const isClean = (d) => d.grade !== 'black' && d.totalPenalty <= STREAK_CLEAN_LIMIT;
  const noBlack = (d) => d.grade !== 'black';
  const noPhone = (d) => d.phoneFreeMinutes !== null && d.phoneFreeMinutes >= PHONE_CLEAN_MINUTES;

  const cleanStreak = countFromEnd(isClean);
  const phoneStreak = countFromEnd(noPhone);
  const noBlackStreak = countFromEnd(noBlack);
  const recordStreak = recordingStreak(days, today);

  // Лучший результат запоминается навсегда: сорванный стрик не должен
  // отбирать уже пройденную веху.
  const bestOf = (predicate) => {
    let best = 0;
    let run = 0;
    for (const day of days) {
      run = predicate(day) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  };

  const byDate = {};
  for (const day of days) byDate[day.entry.date] = day;

  const balance = sleepBalance(days, today, 7);
  const stats = weekStats(days, today);

  const summary = {
    days, balance, stats,
    cleanStreak, phoneStreak, noBlackStreak, recordStreak,
    bestCleanStreak: bestOf(isClean),
    bestPhoneStreak: bestOf(noPhone),
    bestNoBlackStreak: bestOf(noBlack),
    hasPerfectNight: days.some((d) => d.totalPenalty === 0),
  };

  return {
    settings, today, days, byDate,
    ...summary,
    form: computeForm(days),
    milestones: evaluateMilestones(summary),
  };
}

/** Баланс сна: сколько набежало относительно нормы за последние N дней */
export function sleepBalance(days, today, windowDays) {
  const from = addDays(today, -(windowDays - 1));
  const used = days.filter((d) => d.entry.date >= from && d.entry.date <= today);
  return {
    balanceMinutes: used.reduce((sum, d) => sum + d.sleepDeviation, 0),
    nights: used.length,
    windowDays,
  };
}

/** Статистика за последние 7 заполненных ночей */
export function weekStats(days, today) {
  const last = days.slice(-7);
  if (last.length === 0) {
    return {
      nights: 0, avgSleep: null, avgPenalty: null, bedSpread: null,
      wakeSpread: null, avgMidpoint: null, worstFactor: null, badNights: 0,
    };
  }

  const bad = days.filter((d) => d.grade !== 'green');
  let worstFactor = null;
  if (bad.length >= 5) {
    const counts = [
      ...Object.keys(PENALTY.violations).map((key) => ({
        key,
        label: VIOLATION_LABELS[key],
        count: bad.filter((d) => d.entry.violations && d.entry.violations[key]).length,
      })),
      {
        key: 'phone',
        label: 'Поздно отложенный телефон',
        count: bad.filter((d) => d.phoneFreeMinutes !== null
          && d.phoneFreeMinutes < PHONE_CLEAN_MINUTES).length,
      },
    ].sort((a, b) => b.count - a.count);
    if (counts[0].count > 0) worstFactor = { ...counts[0], of: bad.length };
  }

  return {
    nights: last.length,
    avgSleep: last.reduce((s, d) => s + d.sleepMinutes, 0) / last.length,
    avgPenalty: last.reduce((s, d) => s + d.totalPenalty, 0) / last.length,
    bedSpread: stdev(last.map((d) => d.bedAbs)),
    wakeSpread: stdev(last.map((d) => d.wakeClock)),
    avgMidpoint: last.reduce((s, d) => s + d.midpointAbs, 0) / last.length,
    worstFactor,
    badNights: bad.length,
  };
}

// ---------- Вехи ----------

/**
 * Вехи вместо достижений с замочками.
 *
 * У каждой есть текущий прогресс и лучший достигнутый результат.
 * Засчитывается по лучшему — сорванный стрик не отбирает пройденное,
 * а прогресс показывает, сколько осталось до следующей. Полоска
 * «4 из 7» тянет вперёд, серый замочек не тянет никуда.
 */
export const MILESTONES = [
  { id: 'first', title: 'Первая записанная ночь', target: 1,
    current: (s) => s.days.length, best: (s) => s.days.length },

  { id: 'perfect', title: 'Ночь без единого штрафного очка', target: 1,
    current: (s) => (s.hasPerfectNight ? 1 : 0), best: (s) => (s.hasPerfectNight ? 1 : 0) },

  { id: 'clean5', title: 'Пять чистых ночей подряд', unit: 'ночей', target: 5,
    current: (s) => s.cleanStreak, best: (s) => s.bestCleanStreak },

  { id: 'noblack7', title: 'Неделя без срывов', unit: 'ночей', target: 7,
    current: (s) => s.noBlackStreak, best: (s) => s.bestNoBlackStreak },

  { id: 'phone7', title: 'Неделя с телефоном отложенным за час', unit: 'ночей', target: 7,
    current: (s) => s.phoneStreak, best: (s) => s.bestPhoneStreak },

  { id: 'clean10', title: 'Десять чистых ночей подряд', unit: 'ночей', target: 10,
    current: (s) => s.cleanStreak, best: (s) => s.bestCleanStreak },

  { id: 'noblack14', title: 'Две недели без срывов', unit: 'ночей', target: 14,
    current: (s) => s.noBlackStreak, best: (s) => s.bestNoBlackStreak },

  { id: 'nights30', title: 'Месяц наблюдений', unit: 'ночей', target: 30,
    current: (s) => s.days.length, best: (s) => s.days.length },
];

export function evaluateMilestones(summary) {
  const safe = (fn) => {
    try { return Math.max(0, Number(fn(summary)) || 0); } catch { return 0; }
  };

  return MILESTONES.map((m) => {
    const best = safe(m.best);
    const current = Math.min(safe(m.current), m.target);
    const done = best >= m.target;
    return {
      ...m, current, best, done,
      progress: done ? 1 : Math.min(1, current / m.target),
      remaining: Math.max(0, m.target - current),
    };
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
  // Предупреждаем только если это похоже на опечатку во времени.
  // Когда пользователь сам отметил «листал в кровати», говорить ему
  // об этом нечего — он это и имел в виду.
  const phoneSetExplicitly = Number.isFinite(entry.phoneGapMinutes);
  if (!phoneSetExplicitly && r.phoneFreeMinutes !== null && r.phoneFreeMinutes < 0) {
    warnings.push(`Телефон отложен на ${formatDuration(-r.phoneFreeMinutes)} позже отбоя — значит, листал уже в кровати.`);
  }
  return { errors, warnings, resolved: r };
}
