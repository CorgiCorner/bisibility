"use client";

import { Modal, type ModalProps } from "@/components/ui/Modal";
import type { ReactNode } from "react";

export type RankCheckRunStep = "confirm" | "starting" | "running" | "success" | "failed";

type Props = Omit<ModalProps, "title"> & {
  step: RankCheckRunStep;
  title: ReactNode;
};

export function RankCheckRunModal({ step: _step, title, ...props }: Readonly<Props>) {
  return <Modal {...props} title={title} />;
}
