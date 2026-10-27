"use client";

import { AlertBanner } from "@/components/ui/AlertBanner";
import { Tooltip } from "@/components/ui/Tooltip";
import { appPath } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useProjectWriteMode } from "./ProjectWriteModeProvider";

export function ProjectReadOnlyTooltip({
  children,
  className = "inline-flex",
  focusable = false,
}: Readonly<{
  children: ReactNode;
  className?: string;
  focusable?: boolean;
}>) {
  const { readOnly, readOnlyReason } = useProjectWriteMode();
  // Always render the wrapper span so callers can rely on it for layout (flex
  // containers, flex-1 sizing) in both the writable and read-only states.
  const wrapped = (
    <span
      aria-label={readOnly ? (readOnlyReason ?? undefined) : undefined}
      className={cn(
        className,
        "rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid",
      )}
      role={focusable && readOnly && readOnlyReason ? "group" : undefined}
      tabIndex={focusable && readOnly && readOnlyReason ? 0 : undefined}
    >
      {children}
    </span>
  );
  if (!readOnly || !readOnlyReason) {
    return wrapped;
  }

  return (
    <Tooltip content={readOnlyReason} semantics={focusable ? "description" : "label"}>
      {wrapped}
    </Tooltip>
  );
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
