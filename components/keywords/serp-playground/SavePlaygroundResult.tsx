"use client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  previewSerpPlaygroundSaveAction,
  saveSerpPlaygroundAction,
} from "@/lib/actions/serp-playground";
import type { ComparisonProvider } from "@/lib/provider-comparison/types";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
export function SavePlaygroundResult({
  projectRef,
  runId,
  provider,
  saved = false,
}: {
  projectRef: string;
  runId: string;
  provider: ComparisonProvider;
  saved?: boolean;
}) {
  const t = useTranslations("projectRankTracker.serpPlayground");
  const format = useFormatter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [done, setDone] = useState(saved);
  const [match, setMatch] =
    useState<
      Awaited<ReturnType<typeof previewSerpPlaygroundSaveAction>> extends infer R
        ? R extends { ok: true; match: infer M }
          ? M
          : null
        : never
    >(null);
  const input = { projectRef, runId, provider };
  async function review() {
    setBusy(true);
    setError(false);
    try {
      const r = await previewSerpPlaygroundSaveAction(input);
      if (r.ok) setMatch(r.match);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      const r = await saveSerpPlaygroundAction(input);
      if (r.ok) {
        setDone(true);
        setMatch(null);
      } else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={done || busy}
        loading={busy}
        onClick={() => void review()}
      >
        {t(done ? "saved" : "save")}
      </Button>
      {error ? (
        <p role="alert" className="m-0 text-xs text-fg-muted">
          {t("saveMismatch")}
        </p>
      ) : null}
      <Modal
        open={Boolean(match)}
        onClose={() => !busy && setMatch(null)}
        dismissDisabled={busy}
        title={t("saveTitle")}
        description={t("saveDescription")}
        footer={
          <>
            <Button variant="outline" disabled={busy} onClick={() => setMatch(null)}>
              {t("cancel")}
            </Button>
            <Button disabled={busy} loading={busy} onClick={() => void save()}>
              {t("saveConfirm")}
            </Button>
          </>
        }
      >
        {match ? (
          <div>
            {error ? (
              <p role="alert" className="text-sm text-fg-muted">
                {t("saveMismatch")}
              </p>
            ) : null}
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-fg-muted">{t("query")}</dt>
                <dd className="m-0 break-words">{match.keyword}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">{t("location")}</dt>
                <dd className="m-0">
                  {match.location} · {match.language} · {t(match.device)}
                </dd>
              </div>
              <div>
                <dt className="text-fg-muted">{t("provider")}</dt>
                <dd className="m-0">
                  {match.provider} ·{" "}
                  {format.dateTime(new Date(match.date), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
