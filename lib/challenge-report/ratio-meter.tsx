"use client";

import styles from "./ratio-meter.module.css";

/** A share bar in the same accent used for visibility, never a budget warning colour. */
export function RatioMeter({
  label,
  max,
  value,
}: Readonly<{ label: string; max: number; value: number }>) {
  const empty = max <= 0;
  return (
    <meter
      aria-label={label}
      className={styles.meter}
      max={empty ? 1 : max}
      min={0}
      value={empty ? 0 : Math.min(value, max)}
    />
  );
}
