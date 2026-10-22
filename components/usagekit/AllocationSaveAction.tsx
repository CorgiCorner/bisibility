"use client";
import { createPortal } from "react-dom";
import { Button } from "./primitives/button";
import { UsageSpinner } from "./usage-motion";
/** One action targets the editor's owned form even when rendered in a host footer. */
export function AllocationSaveAction({
  container,
  formId,
  save,
  disabled,
  pending,
  label,
}: {
  container?: HTMLElement | null;
  formId?: string;
  save: () => Promise<void>;
  disabled: boolean;
  pending: boolean;
  label: string;
}) {
  const button = (
    <Button
      type={formId ? "submit" : "button"}
      form={formId}
      onClick={formId ? undefined : () => void save()}
      disabled={disabled}
    >
      {pending && <UsageSpinner />}
      {label}
    </Button>
  );
  return container === undefined ? (
    <div className="border-t border-border pt-4">{button}</div>
  ) : container ? (
    createPortal(button, container)
  ) : null;
}
