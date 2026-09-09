"use client";

import { AlertBanner } from "@/components/ui/AlertBanner";
import { Tooltip } from "@/components/ui/Tooltip";
import { appPath } from "@/lib/routing/app-path";
import type { ReactNode } from "react";
import { useProjectWriteMode } from "./ProjectWriteModeProvider";

export function ProjectReadOnlyTooltip({
  children,
  className = "inline-flex",
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  const { readOnly, readOnlyReason } = useProjectWriteMode();
  // Always render the wrapper span so callers can rely on it for layout (flex
  // containers, flex-1 sizing) in both the writable and read-only states.
  const wrapped = (
    <span aria-label={readOnly ? readOnlyReason : undefined} className={className}>
      {children}
    </span>
  );
  if (!readOnly) {
    return wrapped;
  }

  return <Tooltip content={readOnlyReason}>{wrapped}</Tooltip>;
}

export function ProjectWriteModeBanner() {
  const { projectRef, readOnly, writeMode } = useProjectWriteMode();
  if (!readOnly) {
    return null;
  }

  if (writeMode === "migrated") {
    return (
      <AlertBanner
        action={{
          href: projectRef ? `${appPath(projectRef, "settings")}#migration` : undefined,
          icon: "arrow",
          label: "Migration settings",
        }}
        detail="This project moved to another bisibility instance. Writes and rank checks stay off until you reactivate it in settings."
        tint="yellow"
        title="Project migrated - disabled on this instance."
      />
    );
  }

  return (
    <AlertBanner
      action={{
        href: projectRef ? `${appPath(projectRef, "settings")}#migration` : undefined,
        icon: "arrow",
        label: "Migration settings",
      }}
      detail="Reads still work. Writes, imports, provider changes, and rank-check starts are paused. Cancel the migration in settings to resume writes. Advanced shows when the hold becomes eligible for automatic release; the hourly worker releases it shortly afterward."
      tint="yellow"
      title="Project is read-only - migration in progress."
    />
  );
}
