import { useEffect } from "react";
import {
  INTRADAY_POLL_MS,
  isRegularMarketOpen,
  msUntilMarketOpen,
  msUntilSessionClose,
} from "../utils/marketSession";

/** Fetch once on mount; poll only while the regular US session is open. */
export function useMarketSessionPolling(
  fetchFn: (initialLoad: boolean) => Promise<void>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let pollId: number | undefined;
    let wakeId: number | undefined;

    const clearWake = () => {
      if (wakeId != null) window.clearTimeout(wakeId);
      wakeId = undefined;
    };

    const stopPolling = () => {
      if (pollId != null) window.clearInterval(pollId);
      pollId = undefined;
    };

    const scheduleWakeForOpen = () => {
      clearWake();
      const openIn = msUntilMarketOpen();
      wakeId = window.setTimeout(async () => {
        if (cancelled) return;
        await fetchFn(false);
        startPolling();
      }, Math.max(openIn, 1_000));
    };

    const startPolling = () => {
      stopPolling();
      pollId = window.setInterval(() => {
        if (!cancelled) void fetchFn(false);
      }, INTRADAY_POLL_MS);

      const closeIn = msUntilSessionClose();
      if (closeIn > 0) {
        clearWake();
        wakeId = window.setTimeout(() => {
          stopPolling();
          scheduleWakeForOpen();
        }, closeIn);
      }
    };

    (async () => {
      await fetchFn(true);
      if (cancelled) return;
      if (isRegularMarketOpen()) {
        startPolling();
      } else {
        scheduleWakeForOpen();
      }
    })();

    return () => {
      cancelled = true;
      stopPolling();
      clearWake();
    };
  }, [enabled, fetchFn]);
}
