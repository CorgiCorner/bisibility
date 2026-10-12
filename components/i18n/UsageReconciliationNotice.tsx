"use client";

import { useSharedErrorMessages } from "./useSharedErrorMessages";

export function UsageReconciliationNotice() {
  const errors = useSharedErrorMessages();
  return (
    <p
      className="rounded-control border border-border bg-bg-sunken p-4 text-sm text-fg"
      role="alert"
    >
      {errors.usageReconciliationRequired()}
    </p>
  );
}
