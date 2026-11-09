"use client";
import { CopyButton } from "@/components/ui/CopyButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { getSerpPlaygroundRawAction } from "@/lib/actions/serp-playground";
import type { ComparisonProvider } from "@/lib/provider-comparison/types";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
export function RawProviderResult({
  projectRef,
  runId,
  provider,
}: {
  projectRef: string;
  runId: string;
  provider: ComparisonProvider;
}) {
  const t = useTranslations("projectRankTracker.serpPlayground");
  const [state, setState] = useState<{
    status: "loading" | "missing" | "error" | "ready";
    json?: string;
  }>({ status: "loading" });
  useEffect(() => {
    let active = true;
    void getSerpPlaygroundRawAction({ projectRef, runId, provider })
      .then((result) => {
        if (active)
          setState(
            result.ok
              ? result.response === null
                ? { status: "missing" }
                : { status: "ready", json: JSON.stringify(result.response, null, 2) }
              : { status: "error" },
          );
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [projectRef, runId, provider]);
  if (state.status === "loading")
    return (
      <div
        className="grid min-h-48 flex-1 place-items-center"
        role="status"
        aria-label={t("loadingResults")}
      >
        <Spinner size={20} />
      </div>
    );
  if (state.status !== "ready")
    return (
      <div className="grid flex-1 place-items-center">
        <EmptyState
          compact
          title={t(state.status === "missing" ? "rawMissing" : "rawError")}
          description={t("rawMissingHelp")}
        />
      </div>
    );
  return (
    <div className="relative min-w-0">
      <div className="absolute right-3 top-3 z-10">
        <CopyButton text={state.json ?? ""} label={t("copyJson")} />
      </div>
      <pre className="m-0 max-h-[560px] overflow-auto p-5 pr-14 text-xs leading-5">
        {state.json}
      </pre>
      <p className="m-0 px-5 pb-3 text-xs text-fg-muted">{t("rawRedacted")}</p>
    </div>
  );
}
