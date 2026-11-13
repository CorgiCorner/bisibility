"use client";

import type { ReactNode } from "react";
import styles from "./public-report-motion.module.css";

const delays = [
  styles.d0,
  styles.d1,
  styles.d2,
  styles.d3,
  styles.d4,
  styles.d5,
  styles.d6,
  styles.d7,
] as const;

export function TileMotion({
  active,
  children,
  index,
}: Readonly<{ active: boolean; children: ReactNode; index: number }>) {
  const delay = delays[index] ?? styles.d7;
  return <div className={active ? `${styles.enter} ${delay}` : undefined}>{children}</div>;
}
