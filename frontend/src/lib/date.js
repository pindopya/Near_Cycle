const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export function bangkokDateInputValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function todayBangkokDateInputValue(now = new Date()) {
  return bangkokDateInputValue(now);
}

export function formatBangkokDate(value, locale = 'th-TH') {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(locale, { timeZone: 'Asia/Bangkok' });
}
