import { MARKET_TIMEZONE } from "./format";

// Poll interval while the regular session is open (matches 5-min bars).
export const INTRADAY_POLL_MS = 60_000;

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
