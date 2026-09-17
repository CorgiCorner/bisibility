"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import type { MigrationDirection, MigrationTokenFormApi } from "./MigrateToCloudWizard.types";
import { LocalizedMigrationReachabilityHint } from "./MigrationReachabilityHint";

export function MigrationDestinationField({
  destinationUnreachable = false,
  direction,
  form,
}: Readonly<{
  destinationUnreachable?: boolean;
  direction: MigrationDirection;
  form: MigrationTokenFormApi;
}>) {
  const t = useTranslations("projectSettingsMigration.check");
  const inputId = useId();
  const targetOrigin = form.watch("targetOrigin") ?? "";
  const error = form.formState.errors.targetOrigin;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const describedBy = [direction === "to-cloud" ? helperId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mt-4 flex flex-col gap-[7px]">
      <label
        className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted"
        htmlFor={inputId}
      >
        {direction === "to-cloud" ? t("destinationUrl") : t("selfHostUrl")}
      </label>
      <input
        aria-describedby={describedBy || undefined}
        className="min-h-11 rounded-control border border-border-control bg-transparent px-[13px] font-sans tabular-nums text-[13px] font-medium text-fg outline-none placeholder:text-[12px] placeholder:leading-4 focus:border-accent"
        id={inputId}
        placeholder={t("destinationPlaceholder")}
        {...form.register("targetOrigin")}
      />
      {direction === "to-cloud" ? (
        <span
          className="font-sans tabular-nums text-[11.5px] normal-case tracking-normal text-fg-muted"
          id={helperId}
        >
          {t("destinationHelp")}
        </span>
      ) : null}
      {error ? (
        <span
          className="font-sans tabular-nums text-[11.5px] normal-case tracking-normal text-red-text"
          id={errorId}
        >
          {error.message}
        </span>
      ) : null}
      <LocalizedMigrationReachabilityHint
        targetOrigin={targetOrigin}
        unreachable={destinationUnreachable}
      />
    </div>
  );
}
