import { DateTime } from 'luxon';

const DEFAULT_TIMEZONE = 'UTC';

/**
 * Calendar boundaries (start of today, start of month, etc.) depend on the
 * user's timezone — a bill due "today" can already be tomorrow in UTC.
 * `now` itself doesn't need this (an instant is timezone-independent), only
 * calendar math does.
 */
export function startOfTodayUtc(timezone: string | null | undefined): Date {
  return DateTime.now().setZone(timezone || DEFAULT_TIMEZONE).startOf('day').toUTC().toJSDate();
}

export function startOfMonthUtc(timezone: string | null | undefined): Date {
  return DateTime.now().setZone(timezone || DEFAULT_TIMEZONE).startOf('month').toUTC().toJSDate();
}

export function startOfNextMonthUtc(timezone: string | null | undefined): Date {
  return DateTime.now()
    .setZone(timezone || DEFAULT_TIMEZONE)
    .startOf('month')
    .plus({ months: 1 })
    .toUTC()
    .toJSDate();
}

export function daysFromTodayUtc(timezone: string | null | undefined, days: number): Date {
  return DateTime.now()
    .setZone(timezone || DEFAULT_TIMEZONE)
    .startOf('day')
    .plus({ days })
    .toUTC()
    .toJSDate();
}
