"use client";

import { Modal } from "@/components/ui/Modal";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { DashboardLayoutEditor, type DashboardLayoutEditorProps } from "./DashboardLayoutEditor";

export function DashboardCustomizationDialog({
  editor,
  recovery,
  conflict,
  dirtyNotice,
  message,
  locked,
  onClose,
}: Readonly<{
  editor: DashboardLayoutEditorProps;
  recovery: ReactNode;
  conflict: ReactNode;
  dirtyNotice: ReactNode;
  message: string;
  locked: boolean;
  onClose: () => void;
}>) {
  const t = useTranslations("shared.dashboardLayout");
  return (
    <Modal
      open
      title={t("title")}
      size="lg"
      width={720}
      dismissDisabled={locked}
      onClose={onClose}
      onExited={editor.onClosedFocusReturn}
      contentClassName="space-y-4"
    >
      {dirtyNotice}
      {recovery}
      {message ? (
        <p role="status" className="m-0 text-sm text-fg-muted">
          {message}
        </p>
      ) : null}
      <DashboardLayoutEditor {...editor} embedded />
      {conflict}
    </Modal>
  );
}
