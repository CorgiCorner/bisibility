"use client";
import {
  searchLocationLabel,
  searchScopeKeyword,
} from "@/components/keywords/serp-playground/search-scope";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatMeasuredPaymentAmount } from "@/lib/action-payment/format";
import {
  previewSerpOverviewFetchAction,
  readSavedSerpOverviewAction,
} from "@/lib/actions/serp-overview-fetch";
import {
  launchSerpPlaygroundAction,
  readSerpPlaygroundAction,
} from "@/lib/actions/serp-playground";
import type { ComparisonPreview, ComparisonRun } from "@/lib/provider-comparison/types";
import type { UrlRepairTarget } from "@/lib/serp-url-repair/model";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { AiOverviewContent } from "./AiOverviewContent";
import { KeywordCheckScope } from "./KeywordCheckScope";

type Props = { projectRef: string; target: UrlRepairTarget };
export function FetchAiOverview(props: Props) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <FetchControl {...props} />
    </QueryClientProvider>
  );
}
function FetchControl({ projectRef, target }: Props) {
  const t = useTranslations("projectRankTracker.keywordDetail.results.overviewFetch");
  const locale = useLocale(),
    format = useFormatter();
  const [review, setReview] = useState<{ preview: ComparisonPreview; requestKey: string } | null>(
    null,
  );
  const [run, setRun] = useState<ComparisonRun | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  // An overview fetched earlier for the same search is shown again for free.
  const saved = useQuery({
    queryKey: ["overview-saved", projectRef, target],
    queryFn: () => readSavedSerpOverviewAction({ projectRef, target }),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const source = run ?? saved.data?.run ?? null;
  const query = useQuery({
    queryKey: ["overview-fetch", projectRef, source?.id],
    enabled: source !== null,
    initialData: source ? { ok: true as const, run: source } : undefined,
    queryFn: () => readSerpPlaygroundAction({ projectRef, runId: source?.id }),
    refetchInterval: (state) =>
      state.state.data?.ok &&
      state.state.data.run.sides.some((side) => ["queued", "claimed"].includes(side.status))
        ? 2000
        : false,
    retry: false,
  });
  const current = query.data?.ok ? query.data.run : source;
  const side = current?.sides.find((side) => side.provider === "serpapi");
  const pending = side && ["queued", "claimed"].includes(side.status);
  const ai = side?.result?.features?.aiOverview;
  const completedAt = side?.result?.observedAt ?? current?.createdAt;
  const money = (cents: number) =>
    formatMeasuredPaymentAmount(
      {
        value: String(cents / 100),
        unit: { kind: "currency", code: "USD" },
        certainty: "measured",
      },
      locale,
    );
  async function preview() {
    setBusy(true);
    setError(false);
    try {
      setReview({
        preview: await previewSerpOverviewFetchAction({ projectRef, target }),
        requestKey: crypto.randomUUID(),
      });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  async function launch() {
    if (!review) return;
    setBusy(true);
    setError(false);
    try {
      const result = await launchSerpPlaygroundAction({
        projectRef,
        previewId: review.preview.id,
        previewHash: review.preview.hash,
        requestKey: review.requestKey,
      });
      if (!result.ok) throw new Error("Lookup unavailable.");
      setRun(result.run);
      setReview(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4 border-t border-border pt-4">
      {side?.status === "completed" && ai && completedAt ? (
        <>
          <p className="m-0 text-xs text-fg-muted">
            {t(run ? "fresh" : "saved", {
              date: format.dateTime(new Date(completedAt), {
                dateStyle: "medium",
                timeStyle: "medium",
              }),
            })}
          </p>
          {ai.present ? (
            <AiOverviewContent ai={ai} />
          ) : (
            <p className="m-0 text-sm text-fg-muted">{t("absent")}</p>
          )}
        </>
      ) : (
        <p className="m-0 text-xs leading-5 text-fg-muted">{t(pending ? "running" : "help")}</p>
      )}
      {side?.status === "completed" && side.quantity !== null ? (
        <p className="m-0 text-xs text-fg-muted">
          {t("usage", { count: side.quantity })}
          {side.customerCostCents != null ? ` · ${money(side.customerCostCents)}` : ""}
        </p>
      ) : null}
      {!run && !saved.isPending ? (
        <Button variant="outline" size="sm" loading={busy} onClick={() => void preview()}>
          {t(source ? "refetch" : "action")}
        </Button>
      ) : null}
      {error ||
      query.isError ||
      (query.data && !query.data.ok) ||
      (side && ["failed", "unknown", "cancelled"].includes(side.status)) ? (
        <p className="m-0 text-xs text-red-text" role="alert">
          {t("failed")}
        </p>
      ) : null}
      <Modal
        open={review !== null}
        onClose={() => !busy && setReview(null)}
        dismissDisabled={busy}
        title={t("title")}
        description={t("costHelp")}
        footer={
          <>
            <Button
              variant="outline"
              className="min-h-11 sm:min-h-9"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              {t("cancel")}
            </Button>
            <Button className="min-h-11 sm:min-h-9" loading={busy} onClick={() => void launch()}>
              {t("confirm")}
            </Button>
          </>
        }
      >
        {review ? (
          <div className="space-y-4">
            <p className="m-0 text-sm font-medium">{review.preview.keyword.text}</p>
            <KeywordCheckScope
              keyword={searchScopeKeyword(review.preview, locale)}
              locationLabel={searchLocationLabel(review.preview, locale)}
            />
            <dl className="m-0 flex items-center justify-between gap-4 text-sm">
              <dt>{t("maximum")}</dt>
              <dd className="m-0 font-semibold">
                {review.preview.sides[0]?.fundingSource === "own"
                  ? t("quantity", { count: review.preview.sides[0].nativeQuantity })
                  : money(
                      review.preview.sides.reduce((sum, side) => sum + side.estimatedCostCents, 0),
                    )}
              </dd>
            </dl>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
