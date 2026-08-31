"use client";

import type { ReactNode } from "react";

type ContextCardProps = {
  /** The sub-bar: property picker, period, Export CSV and Sync now. */
  children: ReactNode;
  /** Provenance strip. The divider only exists when the strip does. */
  trustStrip?: ReactNode;
};

export function SearchInsightsContextCard({ children, trustStrip }: Readonly<ContextCardProps>) {
  return (
    <section className="overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex flex-wrap items-center gap-2.5 px-3 py-2.5">{children}</div>
      {trustStrip ? <div className="border-t border-border">{trustStrip}</div> : null}
    </section>
  );
}
