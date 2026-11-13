"use client";

import { Modal } from "@/components/ui/Modal";
import type { ReactNode } from "react";

export type IntroductionStep = {
  title: string;
  description: string;
  /** Optional decorative example. It sits in a padded inset panel beside the text. */
  visual?: ReactNode;
};

/**
 * A short, step-by-step HTML introduction to a feature. Each step pairs its
 * copy with an optional visual example; on narrow screens the visual stacks
 * under the copy. Opening it must never change any state on its own.
 */
export function IntroductionExplainer({
  footer,
  lead,
  onClose,
  open,
  steps,
  title,
}: Readonly<{
  footer?: ReactNode;
  lead?: string;
  onClose: () => void;
  open: boolean;
  steps: readonly IntroductionStep[];
  title: string;
}>) {
  return (
    <Modal footer={footer} onClose={onClose} open={open} size="lg" title={title}>
      {open ? (
        <div className="grid min-w-0 gap-5">
          {lead ? <p className="m-0 text-ui-body text-fg-muted">{lead}</p> : null}
          <ol className="m-0 grid list-none gap-5 p-0">
            {steps.map((step, index) => (
              <li
                className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] sm:items-start sm:gap-5"
                key={step.title}
              >
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                  <span
                    aria-hidden
                    className="row-span-2 flex size-6 items-center justify-center rounded-full bg-accent-soft text-ui-caption font-semibold text-accent-text tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <h3 className="m-0 text-ui-body font-semibold">{step.title}</h3>
                  <p className="m-0 text-ui-body text-fg-muted">{step.description}</p>
                </div>
                {step.visual ? (
                  <div
                    aria-hidden
                    className="min-w-0 rounded-card border border-border-soft bg-bg-sunken p-4"
                  >
                    {step.visual}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Modal>
  );
}
