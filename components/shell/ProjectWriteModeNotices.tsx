"use client";

import { AlertBanner } from "@/components/ui/AlertBanner";
import { Tooltip } from "@/components/ui/Tooltip";
import { appPath } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";
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
    <span aria-label={readOnly ? (readOnlyReason ?? undefined) : undefined} className={className}>
      {children}
    </span>
  );
  if (!readOnly || !readOnlyReason) {
    return wrapped;
  }

  return <Tooltip content={readOnlyReason}>{wrapped}</Tooltip>;
}

export function ProjectWriteModeBanner() {
  const { projectRef, readOnly, writeMode } = useProjectWriteMode();
  const t = useTranslations("shell.writeMode");
  if (!readOnly) {
    return null;
  }

  if (writeMode === "migrated") {
    return (
      <AlertBanner
        action={{
          href: projectRef ? `${appPath(projectRef, "settings")}#migration` : undefined,
          icon: "arrow",
          label: t("migrationSettings"),
        }}
        detail={t("migrated.detail")}
        tint="yellow"
        title={t("migrated.title")}
      />
    );
  }

  return (
    <AlertBanner
      action={{
        href: projectRef ? `${appPath(projectRef, "settings")}#migration` : undefined,
        icon: "arrow",
        label: t("migrationSettings"),
      }}
      detail={t("migrationHold.detail")}
      tint="yellow"
      title={t("migrationHold.title")}
    />
  );
}
