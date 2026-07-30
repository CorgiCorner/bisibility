import { pluralize } from "@/lib/format/pluralize";
import { createUserDateTimeFormatter } from "@/lib/format/user-datetime";
import type { IntegrationProviderData } from "@/lib/integrations/types";

type ProviderSyncFailure = NonNullable<IntegrationProviderData["syncFailure"]>;

const dateFormatter = createUserDateTimeFormatter({
  dateFormat: "long",
  language: "en",
  timezone: "UTC",
});

function failureDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "unknown time"
    : `${dateFormatter.formatDateTime(date)} UTC`;
}

function failureClass(value: string) {
  return value === "unknown"
    ? "unclassified (recorded before error-class upgrade)"
    : value.replaceAll("_", " ");
}

export function ProviderSyncFailureAlert({ failure }: Readonly<{ failure: ProviderSyncFailure }>) {
  return (
    <p
      className="m-0 mt-3 rounded-lg border border-red bg-red/5 px-3 py-2 text-[12.5px] leading-[1.45] text-red sm:col-span-2"
      role="alert"
    >
      <strong className="font-semibold">Traffic sync is failing.</strong>{" "}
      {failure.errorClass === "config_invalid"
        ? "The saved property looks misconfigured - open Manage and re-select it. "
        : null}
      Failing since <time dateTime={failure.since}>{failureDate(failure.since)}</time> ·{" "}
      {pluralize(failure.consecutiveFailures, "consecutive failure")} ·{" "}
      {failureClass(failure.errorClass)}.
    </p>
  );
}
