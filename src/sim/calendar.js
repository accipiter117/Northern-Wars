// The calendar ignores leap years: a reign is long, and a fixed 365-day year
// keeps day counts and saves simple.

export const MONTHS = [
  { name: 'January', days: 31 }, { name: 'February', days: 28 }, { name: 'March', days: 31 },
  { name: 'April', days: 30 }, { name: 'May', days: 31 }, { name: 'June', days: 30 },
  { name: 'July', days: 31 }, { name: 'August', days: 31 }, { name: 'September', days: 30 },
  { name: 'October', days: 31 }, { name: 'November', days: 30 }, { name: 'December', days: 31 },
];

export const YEAR_DAYS = 365;

const SEASON_OF_MONTH = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer',
  'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];

export const SEASON_NAMES = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };

// start is { year, month (1-12), day (1-based) }. Returns the absolute day
// number of that date, counting from 1 January of year 0.
export function dayNumber({ year, month, day }) {
  let n = year * YEAR_DAYS;
  for (let m = 0; m < month - 1; m++) n += MONTHS[m].days;
  return n + day - 1;
}

export function dateOf(absDay) {
  const year = Math.floor(absDay / YEAR_DAYS);
  let rest = absDay - year * YEAR_DAYS;
  let month = 0;
  while (rest >= MONTHS[month].days) {
    rest -= MONTHS[month].days;
    month++;
  }
  return { year, month: month + 1, day: rest + 1, season: SEASON_OF_MONTH[month] };
}

export function formatDate(absDay) {
  const d = dateOf(absDay);
  return `${d.day} ${MONTHS[d.month - 1].name} ${d.year}`;
}

export function seasonOf(absDay) {
  return dateOf(absDay).season;
}
