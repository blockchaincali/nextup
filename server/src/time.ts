// Time-zone helpers built on Intl, so we need no date library.

/** Wall-clock parts of an instant in a given IANA zone. */
export function partsIn(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  })
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]))
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday as string),
  }
}

/** Offset of the zone from UTC at that instant, in minutes (Lagos = +60). */
export function offsetMinutes(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000)
}

/** The instant at which the wall clock in `timeZone` reads the given local time. */
export function zonedToDate(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute)
  let off = offsetMinutes(new Date(guess), timeZone)
  let result = new Date(guess - off * 60_000)
  // Re-check once in case the guess crossed a daylight-saving change.
  const off2 = offsetMinutes(result, timeZone)
  if (off2 !== off) result = new Date(guess - off2 * 60_000)
  return result
}

/** ISO string with the zone's offset, e.g. 2026-12-01T10:00:00+01:00. */
export function isoIn(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone)
  const off = offsetMinutes(date, timeZone)
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** "14:00" */
export function hhmm(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/** "Tue Dec 1" */
export function dayLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })
    .format(date)
    .replace(',', '')
}

/** "Nov 18" */
export function shortDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(date)
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Finds a spoken day/time in a phrase, relative to `now` in the user's zone.
 * Handles "today", "tomorrow", "Friday", "next Tuesday", "next week",
 * optionally with "at 3", "at 3pm", "at 15:30", "morning", "afternoon".
 * Returns null when the phrase names no day. Used when no LLM is configured,
 * and to sanity-check LLM output.
 */
export function parseWhen(phrase: string, now: Date, timeZone: string, defaultHour = 10): Date | null {
  const text = phrase.toLowerCase()
  const today = partsIn(now, timeZone)
  let addDays: number | null = null

  if (/\btoday\b/.test(text)) addDays = 0
  else if (/\btomorrow\b/.test(text)) addDays = 1
  else {
    const m = text.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
    if (m) {
      const target = WEEKDAYS.indexOf(m[2]!)
      if (m[1]) {
        // "next Tuesday" = Tuesday of next week (weeks start on Monday).
        const toNextMonday = (1 - today.weekday + 7) % 7 || 7
        addDays = toNextMonday + ((target - 1 + 7) % 7)
      } else {
        // "Tuesday" = the coming Tuesday; said on a Tuesday, a week from today.
        addDays = (target - today.weekday + 7) % 7 || 7
      }
    } else if (/\bnext week\b/.test(text)) {
      addDays = ((1 - today.weekday + 7) % 7 || 7) // the coming Monday
    }
  }
  if (addDays === null) return null

  let hour = defaultHour
  let minute = 0
  const t = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/)
  if (t) {
    hour = Number(t[1])
    minute = Number(t[2] ?? 0)
    if (t[3] === 'pm' && hour < 12) hour += 12
    if (t[3] === 'am' && hour === 12) hour = 0
    if (!t[3] && hour >= 1 && hour <= 7) hour += 12 // "at 3" in business talk means 15:00
  } else if (/\bafternoon\b/.test(text)) hour = 14
  else if (/\bmorning\b/.test(text)) hour = 9
  else if (/\bevening\b/.test(text)) hour = 17

  const base = new Date(Date.UTC(today.year, today.month - 1, today.day + addDays))
  return zonedToDate(
    { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate(), hour, minute },
    timeZone,
  )
}
