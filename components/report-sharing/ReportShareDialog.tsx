"use client";

import { ChallengeReportView } from "@/components/challenge-report/ChallengeReportView";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import {
  publishReportShareAction,
  publishReportShareUpdateAction,
  reissueReportShareAction,
  revokeReportShareAction,
  updateReportShareExpiryAction,
  updateReportShareSettingsAction,
} from "@/lib/actions/report-sharing";
import type { ChallengeReportBody } from "@/lib/challenge-report/schema";
import type { ReportShareActionResult, ReportShareSummary } from "@/lib/report-sharing/model";
import { publicReportView } from "@/lib/report-sharing/projection";
import type { ShareExpiryChoice, ShareSettings } from "@/lib/report-sharing/settings";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ReportShareAccess, ReportSharePublish, ReportShareSettings } from "./ReportSharePanels";

type Days = 7 | 30 | 90 | null;

function daysToChoice(days: Days): ShareExpiryChoice {
  if (days === null) return "never";
  return String(days) as ShareExpiryChoice;
}

export function ReportShareDialog({
  canEdit,
  body,
  onClose,
  open,
  projectId,
  summary,
  title,
}: Readonly<{
  canEdit: boolean;
  body?: ChallengeReportBody;
  onClose: () => void;
  open: boolean;
  projectId: string;
  summary: ReportShareSummary;
  title: string;
}>) {
  const t = useTranslations("challengeReport.share");
  const router = useRouter();
  const { showToast } = useToast();
  const [state, setState] = useState(() =>
    summary.access === "members"
      ? { ...summary, settings: { ...summary.settings, showLessons: false } }
      : summary,
  );
  const [previewing, setPreviewing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [editingTiles, setEditingTiles] = useState(false);
  const [mode, setMode] = useState<"link" | "new">("link");
  const [busy, setBusy] = useState(false);

  async function apply(result: ReportShareActionResult, copiedToken = false) {
    if (!result.ok) {
      showToast(t("failed"), { severity: "error" });
      return null;
    }
    setState(result.summary);
    if (result.token) setToken(result.token);
    router.refresh();
    if (!copiedToken) showToast(t("saved"), { severity: "success" });
    return result.token;
  }

  async function ensureToken() {
    if (token) return token;
    setBusy(true);
    const result = await reissueReportShareAction({ projectId, reportId: state.reportId });
    setBusy(false);
    const next = await apply(result, true);
    return next;
  }

  async function copyLink() {
    const value = await ensureToken();
    if (!value) return;
    await navigator.clipboard.writeText(`${window.location.origin}/r/${value}`);
    showToast(t("linkCopied"), { severity: "success" });
  }

  async function publish() {
    if (!canEdit || busy) return;
    const { version: _version, ...settings } = state.settings;
    setBusy(true);
    try {
      const result = await publishReportShareAction({
        ...settings,
        expires: state.expires,
        projectId,
        reportId: state.reportId,
      });
      await apply(result);
    } catch {
      showToast(t("failed"), { severity: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(patch: Partial<ShareSettings>) {
    if (!canEdit || busy) return;
    if (state.access === "members") {
      setState({ ...state, settings: { ...state.settings, ...patch } });
      return;
    }
    setBusy(true);
    const result = await updateReportShareSettingsAction({
      projectId,
      reportId: state.reportId,
      ...patch,
    });
    setBusy(false);
    await apply(result);
  }

  async function saveExpiry(days: Days) {
    if (!canEdit || busy) return;
    if (state.access === "members") {
      setState({ ...state, expires: daysToChoice(days) });
      return;
    }
    setBusy(true);
    const result = await updateReportShareExpiryAction({
      expires: daysToChoice(days),
      projectId,
      reportId: state.reportId,
    });
    setBusy(false);
    await apply(result);
  }

  async function revoke() {
    setBusy(true);
    const result = await revokeReportShareAction({ projectId, reportId: state.reportId });
    setBusy(false);
    setConfirming(false);
    setToken(null);
    await apply(result);
  }

  async function publishUpdate() {
    if (!canEdit || busy || !state.pending) return;
    setBusy(true);
    const result = await publishReportShareUpdateAction({
      mode,
      projectId,
      reportId: state.reportId,
    });
    setBusy(false);
    if (!result.ok) {
      showToast(t("failed"), { severity: "error" });
      return;
    }
    setState(result.summary);
    router.refresh();
    if (result.token) {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${result.token}`);
      showToast(t("linkCopied"), { severity: "success" });
      return;
    }
    showToast(t("published"), { severity: "success" });
  }

  const owner = state.ownerIsViewer ? t("you") : state.ownerName || t("owner");
  return (
    <Modal
      footer={
        confirming ? (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => setConfirming(false)}
              size="input"
              type="button"
              variant="secondary"
            >
              {t("revokeCancel")}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void revoke()}
              size="input"
              type="button"
              variant="destructive"
            >
              {t("revokeConfirm")}
            </Button>
          </div>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-ui-caption text-fg-muted">
              {t("views", { count: state.views7d })}
            </p>
            <div className="flex flex-wrap gap-2">
              {body ? (
                <Button
                  disabled={busy}
                  onClick={() => setPreviewing(!previewing)}
                  size="input"
                  variant="secondary"
                >
                  {t(previewing ? "backToSettings" : "preview")}
                </Button>
              ) : null}
              {state.access === "link" ? (
                <Button disabled={!canEdit || busy} onClick={() => void copyLink()} size="input">
                  {t(token ? "copyLink" : "replaceLink")}
                </Button>
              ) : (
                <Button
                  disabled={!canEdit || busy}
                  onClick={() => (preparing ? void publish() : setPreparing(true))}
                  size="input"
                >
                  {t(preparing ? "publishLink" : "prepareLink")}
                </Button>
              )}
            </div>
          </div>
        )
      }
      dismissDisabled={busy}
      onClose={onClose}
      open={open}
      size="md"
      title={t("title", { title })}
    >
      {previewing && body ? (
        <ChallengeReportView body={publicReportView(body, state.settings)} />
      ) : (
        <div className="grid gap-4">
          {confirming ? (
            <div className="grid gap-1">
              <h2 className="m-0 text-ui-section">{t("revokeTitle")}</h2>
              <p className="m-0 text-ui-caption text-fg-muted">{t("revokeBody")}</p>
            </div>
          ) : null}
          <ReportShareAccess
            busy={busy}
            canEdit={canEdit}
            hasToken={Boolean(token)}
            onRevoke={confirming ? undefined : () => setConfirming(true)}
            owner={owner}
            summary={state}
          />
          {state.access === "link" || preparing ? (
            <ReportShareSettings
              busy={busy}
              canEdit={canEdit}
              editingTiles={editingTiles}
              onExpiry={(days) => void saveExpiry(days)}
              onSettings={(patch) => void saveSettings(patch)}
              onToggleTiles={() => setEditingTiles((value) => !value)}
              summary={state}
            />
          ) : null}
          {state.pending && canEdit ? (
            <ReportSharePublish
              busy={busy}
              mode={mode}
              onMode={setMode}
              onPublish={() => void publishUpdate()}
              summary={state}
            />
          ) : null}
        </div>
      )}
    </Modal>
  );
}
