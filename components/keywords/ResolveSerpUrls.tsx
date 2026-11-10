"use client";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { readSerpUrlRepairAction, resolveSerpUrlsAction } from "@/lib/actions/serp-url-repair";
import type { UrlRepairTarget } from "@/lib/serp-url-repair/model";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Props = {
  projectRef: string;
  target: UrlRepairTarget;
  onResolved?: () => Promise<unknown>;
};
export function ResolveSerpUrls(props: Props) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <ResolveControl {...props} />
    </QueryClientProvider>
  );
}
function ResolveControl({ projectRef, target, onResolved }: Props) {
  const t = useTranslations("projectRankTracker.keywordDetail.results.urlRepair");
  const client = useQueryClient();
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(false);
  const [reloading, setReloading] = useState(false);
  const state = useQuery({
    queryKey: ["serp-url-repair", projectRef, target, workflowId],
    queryFn: () => readSerpUrlRepairAction({ projectRef, target, workflowId }),
    enabled: workflowId !== null,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 3000 : false),
    retry: false,
  });
  const running =
    starting ||
    (workflowId !== null && (!state.data || state.data.status === "running") && !state.isError);
  const completed = state.data?.status === "completed" ? state.data.result : null;
  async function start() {
    setStarting(true);
    setError(false);
    try {
      const result = await resolveSerpUrlsAction({ projectRef, target });
      client.setQueryData(["serp-url-repair", projectRef, target, result.workflowId], result);
      setWorkflowId(result.workflowId);
      await client.invalidateQueries({
        queryKey: ["serp-url-repair", projectRef, target, result.workflowId],
      });
      if (result.status === "completed") await onResolved?.();
    } catch {
      setError(true);
    } finally {
      setStarting(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
      <p className="m-0 min-w-0 flex-1 text-xs text-fg-muted" role="status">
        {error || state.isError || state.data?.status === "failed"
          ? t("failed")
          : running
            ? t("running")
            : completed
              ? t("complete", {
                  resolved: String(completed.resolved),
                  unresolved: String(completed.unresolved),
                })
              : t("help")}
      </p>
      {completed && onResolved ? (
        <Button
          size="sm"
          variant="outline"
          loading={reloading}
          onClick={async () => {
            setReloading(true);
            try {
              await onResolved();
            } catch {
              setError(true);
            } finally {
              setReloading(false);
            }
          }}
        >
          {t("reload")}
        </Button>
      ) : null}
      {!completed || completed.unresolved > 0 ? (
        <Tooltip content={t("hint")} semantics="description">
          <Button
            size="sm"
            variant="outline"
            loading={running}
            disabled={running}
            onClick={() => void start()}
          >
            {t("action")}
          </Button>
        </Tooltip>
      ) : null}
    </div>
  );
}
