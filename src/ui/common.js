/** Экранирование — в заметках к ночи пользователь пишет свободный текст */
export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Своя реакция на каждое из десяти делений, а не одна на пару */
/** Самочувствие не отмечено — отдельное состояние, а не «серединка» */
export const ENERGY_UNSET = { icon: '', label: 'не отмечено' };

export const ENERGY_LEVELS = [
  { value: 1, icon: '💀', label: 'Убитый' },
  { value: 2, icon: '😵', label: 'Очень тяжко' },
  { value: 3, icon: '😩', label: 'С трудом встал' },
  { value: 4, icon: '🫩', label: 'Встал, но овощь' },
  { value: 5, icon: '😕', label: 'Так себе' },
  { value: 6, icon: '🙃', label: 'Нормик' },
  { value: 7, icon: '😀', label: 'Неплохо' },
  { value: 8, icon: '😁', label: 'Бодрый' },
  { value: 9, icon: '⚡', label: 'Ой, хорошо' },
  { value: 10, icon: '🤩', label: 'Отлично!' },
];

export function energyLabel(value) {
  if (!Number.isFinite(value)) return ENERGY_UNSET;
  return ENERGY_LEVELS[Math.min(10, Math.max(1, Math.round(value))) - 1];
}

/**
 * Отмечаются именно НАРУШЕНИЯ: в обычную ночь ничего отмечать не нужно.
 * Обратный вариант («не пил кофе») заставлял бы каждое утро
 * подтверждать то, что и так верно почти всегда.
 */
/** Положительные действия: гасят набранные очки, а не добавляют свои */
export const BONUS_ITEMS = [
  { key: 'morningLight', label: 'Утром сразу вышел на свет' },
  { key: 'morningExercise', label: 'Сделал зарядку утром' },
];

export const VIOLATION_ITEMS = [
  { key: 'caffeine', label: 'Пил кофе или энергетики во второй половине дня' },
  { key: 'badRoom', label: 'Было душно, жарко или светло' },
  { key: 'snoozed', label: 'Вставал не с первого раза, откладывал будильник' },
];

