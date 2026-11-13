/* The calendar a data set runs on.

   Day 0 of period 1 is Monday 6 July 2026, the first full week under the rules
   in force from 30 June 2026 (sources.json, calendar.why); period n starts
   (n - 1) x days later, so a bank's periods follow one another. Bacs and CHAPS
   run on working days only, so the generator needs weekends and the bank
   holidays of England and Wales. The holidays are computed by the rules
   GOV.UK publishes them by (New Year's Day, Good Friday, Easter Monday, the
   first and last Mondays of May, the last Monday of August, Christmas Day and
   Boxing Day, each moved to the next weekday when it falls at a weekend), and
   scripts/qa-gen.ts checks the computed list against GOV.UK's own list for
   2025 to 2027 in sources.json. A one-off holiday (a coronation, a jubilee)
   is not predictable and is not modelled. */

import sources from "./sources.json";

const DAY_MS = 86_400_000;
export const DAY0_PERIOD1 = sources.calendar.day0;
const BASE = Date.parse(`${DAY0_PERIOD1}T00:00:00Z`);

/** The UTC time of day 0 of this period. */
export function periodStart(period: number, days: number): number {
  return BASE + (Math.max(1, period) - 1) * days * DAY_MS;
}

export interface Calendar {
  /** yyyy-mm-dd of day 0 */
  day0: string;
  /** the date of a day, yyyy-mm-dd */
  date: (day: number) => string;
  /** 0 Sunday .. 6 Saturday */
  weekday: (day: number) => number;
  /** a bank holiday in England and Wales */
  holiday: (day: number) => boolean;
  /** Monday to Friday and not a bank holiday */
  working: (day: number) => boolean;
  /** the first working day at or after this day (may run past the period) */
  nextWorking: (day: number) => number;
  /** the last working day at or before this day (may be before day 0) */
  prevWorking: (day: number) => number;
  /** day of the month, 1 to 31 */
  dom: (day: number) => number;
  /** month number 0 to 11 */
  month: (day: number) => number;
  /** days in this day's month */
  monthLength: (day: number) => number;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Easter Sunday for a year (the anonymous Gregorian algorithm, Meeus/Jones/Butcher). */
export function easter(year: number): number {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

const firstMonday = (year: number, month: number) => { let t = Date.UTC(year, month, 1); while (new Date(t).getUTCDay() !== 1) t += DAY_MS; return t; };
const lastMonday = (year: number, month: number) => { let t = Date.UTC(year, month + 1, 0); while (new Date(t).getUTCDay() !== 1) t -= DAY_MS; return t; };

/** The bank holidays of England and Wales in a year, yyyy-mm-dd, by the published rules. */
export function bankHolidays(year: number): string[] {
  const out: number[] = [];
  const e = easter(year);
  // New Year's Day, moved to Monday at a weekend
  let ny = Date.UTC(year, 0, 1);
  while ([0, 6].includes(new Date(ny).getUTCDay())) ny += DAY_MS;
  out.push(ny, e - 2 * DAY_MS, e + DAY_MS, firstMonday(year, 4), lastMonday(year, 4), lastMonday(year, 7));
  // Christmas Day and Boxing Day: a weekend day moves to the next weekday not already a holiday
  const xmas = Date.UTC(year, 11, 25), boxing = Date.UTC(year, 11, 26);
  const taken = new Set<number>();
  for (const d of [xmas, boxing]) {
    let t = d;
    while ([0, 6].includes(new Date(t).getUTCDay()) || taken.has(t)) t += DAY_MS;
    taken.add(t);
    out.push(t);
  }
  return out.sort((a, b) => a - b).map(iso);
}

const holidayCache = new Map<number, Set<string>>();
function holidaysOf(year: number): Set<string> {
  let s = holidayCache.get(year);
  if (!s) { s = new Set(bankHolidays(year)); holidayCache.set(year, s); }
  return s;
}

export function makeCalendar(period: number, days: number): Calendar {
  const start = periodStart(period, days);
  const at = (day: number) => start + day * DAY_MS;
  const date = (day: number) => iso(at(day));
  const weekday = (day: number) => new Date(at(day)).getUTCDay();
  const holiday = (day: number) => { const d = new Date(at(day)); return holidaysOf(d.getUTCFullYear()).has(iso(at(day))); };
  const working = (day: number) => { const w = weekday(day); return w !== 0 && w !== 6 && !holiday(day); };
  return {
    day0: date(0), date, weekday, holiday, working,
    nextWorking: (day) => { let d = day; while (!working(d)) d++; return d; },
    prevWorking: (day) => { let d = day; while (!working(d)) d--; return d; },
    dom: (day) => new Date(at(day)).getUTCDate(),
    month: (day) => new Date(at(day)).getUTCMonth(),
    monthLength: (day) => { const d = new Date(at(day)); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); },
  };
}

const lastSunday = (year: number, month: number) => { let t = Date.UTC(year, month + 1, 0); while (new Date(t).getUTCDay() !== 0) t -= DAY_MS; return t; };
/** Whether a UK local date is in British Summer Time (last Sunday of March to last Sunday of October). */
export function inBst(dateMs: number): boolean {
  const y = new Date(dateMs).getUTCFullYear();
  return dateMs >= lastSunday(y, 2) && dateMs < lastSunday(y, 9);
}

/** The timestamp of a day and minute of a data set as an ISO string. The minute is UK clock time, so a summer date carries +01:00. */
export function stampOf(period: number, days: number, day: number, minute: number): string {
  const d = periodStart(period, days) + day * DAY_MS;
  const hh = String(Math.floor(minute / 60)).padStart(2, "0"), mm = String(minute % 60).padStart(2, "0");
  return `${iso(d)}T${hh}:${mm}:00${inBst(d) ? "+01:00" : "Z"}`;
}
