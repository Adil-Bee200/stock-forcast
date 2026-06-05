import { useEffect, useState } from "react";
import {
  isRegularMarketOpen,
  msUntilMarketOpen,
  msUntilSessionClose,
} from "../utils/marketSession";

/** Re-renders when the US regular session opens or closes. */
export function useRegularMarketOpen(): boolean {
  const [open, setOpen] = useState(() => isRegularMarketOpen());

  useEffect(() => {
    let wakeId: number | undefined;

    const sync = () => setOpen(isRegularMarketOpen());

    const arm = () => {
      if (wakeId != null) window.clearTimeout(wakeId);
      const delay = isRegularMarketOpen()
        ? msUntilSessionClose()
        : msUntilMarketOpen();
      wakeId = window.setTimeout(() => {
        sync();
        arm();
      }, Math.max(delay, 1_000));
    };

    sync();
    arm();

    return () => {
      if (wakeId != null) window.clearTimeout(wakeId);
    };
  }, []);

  return open;
}
