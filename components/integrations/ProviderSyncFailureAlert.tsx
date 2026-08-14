import { ZonedTime } from "@/components/ui";
import { pluralize } from "@/lib/format/pluralize";
import type { IntegrationProviderData } from "@/lib/integrations/types";

type ProviderSyncFailure = NonNullable<IntegrationProviderData["syncFailure"]>;

function failureClass(value: string) {
  return value === "unknown"
    ? "unclassified (recorded before error-class upgrade)"
    : value.replaceAll("_", " ");
}

export function ProviderSyncFailureAlert({
  failure,
  timeZone,
}: Readonly<{ failure: ProviderSyncFailure; timeZone: string }>) {
  const since = new Date(failure.since);
  return (
    <p
      className="m-0 mt-3 rounded-lg border border-red bg-red/5 px-3 py-2 text-[12.5px] leading-[1.45] text-red-text sm:col-span-2"
      role="alert"
    >
      <strong className="font-semibold">Traffic sync is failing.</strong>{" "}
      {failure.errorClass === "config_invalid"
        ? "The saved property looks misconfigured - open Manage and re-select it. "
        : null}
      Failing since{" "}
      {Number.isNaN(since.getTime()) ? (
        "unknown time"
      ) : (
        <ZonedTime
          options={{
            day: "numeric",
            hour: "2-digit",
            hourCycle: "h23",
            minute: "2-digit",
            month: "short",
            year: "numeric",
          }}
          timeZone={timeZone}
          value={failure.since}
        />
      )}{" "}
      · {pluralize(failure.consecutiveFailures, "consecutive failure")} ·{" "}
      {failureClass(failure.errorClass)}.
    </p>
  );
}
