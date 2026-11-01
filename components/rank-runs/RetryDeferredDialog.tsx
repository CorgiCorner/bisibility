"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { RunPageItem } from "./RunPageTypes";

export function RetryDeferredDialog({
  open,
  busy,
  projectRef,
  runId,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  projectRef: string;
  runId: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("projectRuns.rankRuns");
  const [items, setItems] = useState<RunPageItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setItems([]);
    setState("loading");
    async function load() {
      let cursor: string | null = null;
      const rows: RunPageItem[] = [];
      do {
        const query = new URLSearchParams({
          project: projectRef,
          limit: "200",
          status: "deferred",
        });
        if (cursor) query.set("cursor", cursor);
        const response = await fetch(`/api/rank-check-runs/${runId}/items?${query}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const page: { data?: RunPageItem[]; meta?: { next_cursor?: string | null } } =
          await response.json();
        if (!response.ok || !Array.isArray(page.data))
          throw new Error("Unable to load deferred checks");
        rows.push(...page.data);
        const next = page.meta?.next_cursor ?? null;
        if (next && next === cursor) throw new Error("Cursor did not advance");
        cursor = next;
      } while (cursor);
      if (!controller.signal.aborted) {
        setItems(rows);
        setState("ready");
      }
    }
    void load().catch(() => {
      if (!controller.signal.aborted) setState("error");
    });
    return () => controller.abort();
  }, [open, projectRef, runId]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t("retryReview.title")}
      footer={
        <>
          <Button disabled={busy} onClick={onClose} size="sm" variant="ghost">
            {t("retryReview.cancel")}
          </Button>
          <Button
            disabled={state !== "ready" || items.length === 0}
            loading={busy}
            onClick={onConfirm}
            size="sm"
          >
            {t("retryReview.confirm")}
          </Button>
        </>
      }
    >
      <p className="m-0 text-[12.5px] text-fg-muted">{t("retryReview.warning")}</p>
      <p className="mb-2 mt-4 text-[12px] font-semibold">
        {t("retryReview.targets", { count: items.length })}
      </p>
      {state === "loading" ? (
        <p role="status">{t("loadingTargets")}</p>
      ) : state === "error" ? (
        <p role="alert">{t("retryReview.loadFailed")}</p>
      ) : (
        <ul className="m-0 max-h-64 list-disc overflow-auto pl-5 text-[12px] text-fg-muted">
          {items.map((item) => (
            <li key={item.id}>
              {item.keyword.text} · {item.keyword.location} ·{" "}
              {t(item.keyword.device === "mobile" ? "retryReview.mobile" : "retryReview.desktop")}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
