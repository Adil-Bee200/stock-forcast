import { MARKET_TIMEZONE } from "./format";

// Matches 5-min bars and backend intraday cache TTL (default 300s).
export const INTRADAY_POLL_MS = 300_000;

// While the market is closed, EOD summary only changes after the nightly worker.
export const EOD_SUMMARY_POLL_MS = 15 * 60 * 1000;

const SESSION_OPEN_MINUTES = 9 * 60 + 30;
const SESSION_CLOSE_MINUTES = 16 * 60;

type EtClock = {
  weekday: string;
  minutesOfDay: number;
};

function etClock(now: Date): EtClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIMEZONE,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    weekday: get("weekday"),
    minutesOfDay: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function isWeekday(weekday: string): boolean {
  return weekday !== "Sat" && weekday !== "Sun";
}

/** US equities regular session, Mon–Fri 9:30am–4:00pm Eastern. */
export function isRegularMarketOpen(now = new Date()): boolean {
  const { weekday, minutesOfDay } = etClock(now);
  if (!isWeekday(weekday)) return false;
  return (
    minutesOfDay >= SESSION_OPEN_MINUTES &&
    minutesOfDay < SESSION_CLOSE_MINUTES
  );
}

function msUntil(predicate: (at: Date) => boolean, from = new Date()): number {
  const probe = new Date(from.getTime() + 60_000);
  const limit = from.getTime() + 4 * 24 * 60 * 60 * 1000;

  while (probe.getTime() < limit) {
    if (predicate(probe)) {
      return probe.getTime() - from.getTime();
    }
    probe.setTime(probe.getTime() + 60_000);
  }

  return INTRADAY_POLL_MS;
}

export function msUntilMarketOpen(from = new Date()): number {
  if (isRegularMarketOpen(from)) return 0;
  return msUntil(isRegularMarketOpen, from);
}

export function msUntilSessionClose(from = new Date()): number {
  if (!isRegularMarketOpen(from)) return 0;
  return msUntil((at) => !isRegularMarketOpen(at), from);
}

/** UTC ISO timestamp for a wall-clock time on an Eastern calendar date. */
export function etWallClockToIso(
  dateEt: string,
  hour: number,
  minute: number,
): string {
  const [y, m, d] = dateEt.split("-").map(Number);
  const anchor = Date.UTC(y, m - 1, d, 17, 0, 0);

  for (let delta = -8 * 60; delta <= 8 * 60; delta += 1) {
    const candidate = new Date(anchor + delta * 60_000);
    const formattedDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: MARKET_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(candidate);
    if (formattedDate !== dateEt) continue;

    const timeParts = new Intl.DateTimeFormat("en-US", {
      timeZone: MARKET_TIMEZONE,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(candidate);

    const h = Number(timeParts.find((p) => p.type === "hour")?.value);
    const min = Number(timeParts.find((p) => p.type === "minute")?.value);
    if (h === hour && min === minute) return candidate.toISOString();
  }

  return new Date(anchor).toISOString();
}

/** 4:00 PM Eastern on the given session date (``YYYY-MM-DD``). */
export function sessionCloseIso(sessionDateEt: string): string {
  return etWallClockToIso(sessionDateEt, 16, 0);
}
