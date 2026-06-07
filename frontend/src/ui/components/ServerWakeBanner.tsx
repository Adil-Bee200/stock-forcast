import type { CSSProperties } from "react";

type Props = {
  style?: CSSProperties;
};

export function ServerWakeBanner({ style }: Props) {
  return (
    <div className="server-wake-banner" role="status" aria-live="polite" style={style}>
      <span className="server-wake-banner__spinner" aria-hidden />
      <div>
        <strong className="server-wake-banner__title">Connecting to the API</strong>
        <p className="server-wake-banner__text">
          The server may take up to a minute to wake up on first load. Your dashboard
          will appear automatically.
        </p>
      </div>
    </div>
  );
}
