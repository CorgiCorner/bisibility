"use client";

import { Modal, type ModalProps } from "@/components/ui";
import {
  CheckCircleIcon as CheckCircle,
  CircleNotchIcon as CircleNotch,
  PlayCircleIcon as PlayCircle,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

export type RankCheckRunStep = "confirm" | "starting" | "running" | "success" | "failed";

type Props = Omit<ModalProps, "title"> & {
  step: RankCheckRunStep;
  title: ReactNode;
};

function StatusIcon({ step }: Readonly<{ step: RankCheckRunStep }>) {
  const className =
    step === "failed"
      ? "text-red-text"
      : step === "success"
        ? "text-green-text"
        : step === "starting" || step === "running"
          ? "text-accent-text"
          : "text-fg-muted";
  const Icon =
    step === "failed"
      ? WarningCircle
      : step === "success"
        ? CheckCircle
        : step === "starting" || step === "running"
          ? CircleNotch
          : PlayCircle;

  return (
    <span className={`grid h-6 w-6 shrink-0 place-items-center ${className}`}>
      <Icon
        aria-hidden
        className={
          step === "starting" || step === "running" ? "motion-safe:animate-spin" : undefined
        }
        size={19}
        weight="bold"
      />
    </span>
  );
}

export function RankCheckRunModal({ step, title, ...props }: Readonly<Props>) {
  return (
    <Modal
      {...props}
      title={
        <span className="inline-flex min-w-0 items-center gap-2">
          <StatusIcon step={step} />
          <span className="min-w-0">{title}</span>
        </span>
      }
    />
  );
}
