"use client";

import { useId } from "react";
import type { MigrationDirection, MigrationTokenFormApi } from "./MigrateToCloudWizard.types";
import { MigrationReachabilityHint } from "./MigrationReachabilityHint";

export function MigrationDestinationField({
  destinationUnreachable = false,
  direction,
  form,
}: Readonly<{
  destinationUnreachable?: boolean;
  direction: MigrationDirection;
  form: MigrationTokenFormApi;
}>) {
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
        className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted"
        htmlFor={inputId}
      >
        {direction === "to-cloud" ? "Destination URL" : "Self-host URL"}
      </label>
      <input
        aria-describedby={describedBy || undefined}
        className="min-h-11 rounded-control border border-border-control bg-transparent px-[13px] font-sans text-[13px] font-medium text-fg outline-none placeholder:text-[12px] placeholder:leading-4 focus:border-accent"
        id={inputId}
        placeholder="https://rank.example.com"
        {...form.register("targetOrigin")}
      />
      {direction === "to-cloud" ? (
        <span
          className="font-sans text-[11.5px] normal-case tracking-normal text-fg-muted"
          id={helperId}
        >
          Prefilled from this instance&apos;s configuration. You can change it before running the
          check.
        </span>
      ) : null}
      {error ? (
        <span
          className="font-sans text-[11.5px] normal-case tracking-normal text-red-text"
          id={errorId}
        >
          {error.message}
        </span>
      ) : null}
      <MigrationReachabilityHint targetOrigin={targetOrigin} unreachable={destinationUnreachable} />
    </div>
  );
}
