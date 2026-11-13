"use client";

import type { ReactNode } from "react";
import styles from "./bento.module.css";
import type { BentoSpan } from "./bento-layout";

const desktop = {
  3: styles.lg3,
  4: styles.lg4,
  6: styles.lg6,
  8: styles.lg8,
  12: styles.lg12,
} as const;

const tablet = { 1: styles.md1, 2: styles.md2 } as const;

export function ChallengeBento({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={styles.bento}>{children}</div>;
}

export function ChallengeBentoItem({
  children,
  span,
}: Readonly<{ children: ReactNode; span: BentoSpan }>) {
  return (
    <section
      className={`${styles.item} ${tablet[span.md]} ${desktop[span.lg]}`}
      data-bento-lg={span.lg}
      data-bento-md={span.md}
      data-challenge-tile={span.id}
    >
      {children}
    </section>
  );
}
