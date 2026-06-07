import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiJson,
  getErrorInfo,
  type ErrorInfo,
  type MetricsResponse,
  type SummaryResponse,
} from "../api/client";
import { isServerWakeupError } from "../api/errors";
import { setCachedSummary } from "../api/symbolCache";

const RETRY_MS = 5_000;
const WAKE_BANNER_DELAY_MS = 1_000;

export function useAppBootstrap() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const lastGoodSummary = useRef<SummaryResponse | null>(null);
  const hasAppDataRef = useRef(false);
  const [hasAppData, setHasAppData] = useState(false);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [waitingForServer, setWaitingForServer] = useState(false);
  const [loadErr, setLoadErr] = useState<ErrorInfo | null>(null);

  const markHasAppData = useCallback(() => {
    if (hasAppDataRef.current) return;
    hasAppDataRef.current = true;
    setHasAppData(true);
    setWaitingForServer(false);
    setLoadErr(null);
  }, []);

  const applySummary = useCallback(
    (data: SummaryResponse) => {
      lastGoodSummary.current = data;
      setCachedSummary(data);
      setSummary(data);
      if (data.tickers?.some((t) => t.last_close != null)) {
        markHasAppData();
      }
    },
    [markHasAppData],
  );

  const refreshMetrics = useCallback(async () => {
    setMetrics(await apiJson<MetricsResponse>("/api/metrics"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryId: number | undefined;
    let wakeBannerId: number | undefined;

    const clearWakeBannerTimer = () => {
      if (wakeBannerId != null) {
        window.clearTimeout(wakeBannerId);
        wakeBannerId = undefined;
      }
    };

    const scheduleWakeBanner = () => {
      if (wakeBannerId != null || hasAppDataRef.current) return;
      wakeBannerId = window.setTimeout(() => {
        if (!cancelled && !hasAppDataRef.current) {
          setWaitingForServer(true);
        }
      }, WAKE_BANNER_DELAY_MS);
    };

    const scheduleRetry = () => {
      retryId = window.setTimeout(() => {
        void run();
      }, RETRY_MS);
    };

    const run = async () => {
      if (cancelled || hasAppDataRef.current) return;

      scheduleWakeBanner();

      try {
        const data = await apiJson<SummaryResponse>("/api/summary");
        if (cancelled) return;
        clearWakeBannerTimer();
        applySummary(data);

        try {
          const metricData = await apiJson<MetricsResponse>("/api/metrics");
          if (!cancelled) setMetrics(metricData);
        } catch {
          /* metrics are optional on first paint */
        }
        return;
      } catch (e) {
        if (cancelled) return;

        if (lastGoodSummary.current) {
          clearWakeBannerTimer();
          setSummary(lastGoodSummary.current);
          markHasAppData();
          return;
        }

        if (isServerWakeupError(e)) {
          setLoadErr(null);
          scheduleRetry();
          return;
        }

        clearWakeBannerTimer();
        setWaitingForServer(false);
        setLoadErr(getErrorInfo(e));
      }
    };

    void run();

    return () => {
      cancelled = true;
      clearWakeBannerTimer();
      if (retryId != null) window.clearTimeout(retryId);
    };
  }, [applySummary, markHasAppData]);

  return {
    summary,
    lastGoodSummary,
    metrics,
    setMetrics,
    hasAppData,
    markHasAppData,
    waitingForServer,
    loadErr,
    applySummary,
    refreshMetrics,
  };
}
