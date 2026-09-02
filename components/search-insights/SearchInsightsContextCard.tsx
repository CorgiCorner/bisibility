"use client";

import type { ReactNode } from "react";

type ContextCardProps = {
  /** The sub-bar: property picker, period, Export CSV and Sync now. */
  children: ReactNode;
  /**
   * Provenance strip. It carries its own top border: a `<Suspense>` element is truthy even
   * when the strip inside it resolves to nothing, so a divider painted from here would outlive
   * its child and rule off an empty edge.
   */
  trustStrip?: ReactNode;
};

export function SearchInsightsContextCard({ children, trustStrip }: Readonly<ContextCardProps>) {
  return (
    <section className="overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex flex-wrap items-center gap-2.5 px-3 py-2.5">{children}</div>
      {trustStrip}
    </section>
  );
}
