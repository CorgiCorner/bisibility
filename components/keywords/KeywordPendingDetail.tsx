"use client";

import { useToast } from "@/components/ui";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordRow } from "@/lib/queries/keywords";
import { isBudgetExhaustedResult } from "@/lib/rank-check/budget-contract";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowRightIcon as ArrowRight,
  FlagIcon as Flag,
  GlobeSimpleIcon as GlobeSimple,
  MonitorIcon as Monitor,
  PencilSimpleIcon as PencilSimple,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  actionErrorMessage,
  type KeywordDetailActions,
  type KeywordWorkspaceActions,
} from "./action-utils";
import { KeywordEditDrawer } from "./KeywordEditDrawer";
import { KeywordIndexStatus } from "./KeywordIndexStatus";
import { KeywordPendingDeleteButton } from "./KeywordPendingDeleteButton";
import { emptyRankCopy, KeywordPendingEmptyState } from "./KeywordPendingEmptyState";
import { addedLabel, formatVolume } from "./keyword-pending-format";

type KeywordPendingDetailProps = {
  bulkDeleteAction: KeywordWorkspaceActions["bulkDeleteAction"];
  canDeleteKeyword: boolean;
  canManageProviders: boolean;
  canUpdateKeyword: boolean;
  costContext?: ProjectCostContext;
  keyword: KeywordRow;
  providerConnected: boolean;
  projectId: string;
  projectRef: ProjectRef;
  runCheckNowAction: KeywordDetailActions["runCheckNowAction"];
  updateKeywordAction: KeywordDetailActions["updateKeywordAction"];
  updateKeywordScheduleAction?: NonNullable<KeywordDetailActions["updateKeywordScheduleAction"]>;
};

const AMBER_TINT = {
  background: "color-mix(in srgb, var(--yellow) 14%, transparent)",
  color: "var(--yellow-strong)",
} as const;

const RED_TINT = {
  background: "color-mix(in srgb, var(--red) 12%, transparent)",
  color: "var(--red)",
} as const;

function ContextChip({ children, icon: ChipIcon }: Readonly<{ children: string; icon: Icon }>) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-sunken px-2.5 py-1 font-mono text-[11px] text-fg-muted">
      <ChipIcon size={13} />
      {children}
    </span>
  );
}

function MetaItem({ children, label }: Readonly<{ children: string; label: string }>) {
  return (
    <span>
      {label} <strong className="font-semibold text-fg-muted">{children}</strong>
    </span>
  );
}

function MetaDivider() {
  return <span className="h-[11px] w-px bg-border-strong" />;
}

export function KeywordPendingDetail({
  bulkDeleteAction,
  canDeleteKeyword,
  canManageProviders,
  canUpdateKeyword,
  costContext,
  keyword,
  providerConnected,
  projectId,
  projectRef,
  runCheckNowAction,
  updateKeywordAction,
  updateKeywordScheduleAction,
}: Readonly<KeywordPendingDetailProps>) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [runPending, setRunPending] = useState(false);
  const checkState =
    keyword.checkState ??
    (keyword.hasRankData
      ? "ranked"
      : keyword.lastCheckStatus === "failed" || keyword.lastCheckStatus === "running"
        ? keyword.lastCheckStatus
        : keyword.lastCheckStatus === "completed"
          ? "not_ranked"
          : "never_checked");
  const state = checkState === "ranked" ? "not_ranked" : checkState;
  const copy = emptyRankCopy(state, projectRef, keyword.trackedDepth, providerConnected);
  const tagLabel = keyword.tags.length ? keyword.tags.join(", ") : "None";
  const volumeLabel = keyword.volumeKnown === false ? "No data" : formatVolume(keyword.volume);
  const canRunFirstCheck = state === "never_checked" && providerConnected;
  const providerRate = costContext
    ? {
        overrideCents: costContext.costPerCheckCents,
        providerId: costContext.providerId,
      }
    : undefined;

  async function runFirstCheck() {
    setRunPending(true);
    try {
      const result = await runCheckNowAction({ keywordId: keyword.id });
      if (isBudgetExhaustedResult(result)) {
        showToast(result.message, { tint: "red" });
        return;
      }
      showToast("Check started", { tint: "green" });
      router.refresh();
    } catch (error) {
      showToast(actionErrorMessage(error), { tint: "red" });
    } finally {
      setRunPending(false);
    }
  }

  return (
    <>
      <div className="rounded-[14px] border border-border bg-bg-elev p-[20px_22px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="m-0 min-w-0 text-[23px] font-semibold leading-tight tracking-[-0.6px]">
                {keyword.keyword}
              </h2>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] font-mono text-[10.5px] font-semibold"
                style={state === "failed" ? RED_TINT : AMBER_TINT}
              >
                <span
                  className={`h-[6px] w-[6px] rounded-full ${state === "failed" ? "bg-red" : "bg-yellow"}`}
                />
                {copy.badge}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-[7px]">
              <ContextChip icon={Flag}>{keyword.location.displayName}</ContextChip>
              <ContextChip icon={Monitor}>{keyword.device}</ContextChip>
              <ContextChip icon={GlobeSimple}>{keyword.engine}</ContextChip>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canDeleteKeyword ? (
              <KeywordPendingDeleteButton
                bulkDeleteAction={bulkDeleteAction}
                keywordId={keyword.id}
                keywordLabel={keyword.keyword}
                projectId={projectId}
                projectRef={projectRef}
              />
            ) : null}
            {canUpdateKeyword ? (
              <button
                className="inline-flex flex-none items-center justify-center gap-[7px] rounded-[10px] border border-border-strong px-4 py-2.5 text-[13px] font-semibold text-fg-muted outline-none hover:bg-bg-sunken focus-visible:bg-bg-sunken"
                onClick={() => setEditing((value) => !value)}
                type="button"
              >
                <PencilSimple size={14} weight="bold" />
                Edit
              </button>
            ) : null}
            {canUpdateKeyword && canRunFirstCheck ? (
              <button
                className="inline-flex flex-none items-center gap-[7px] rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-55"
                disabled={runPending}
                onClick={() => void runFirstCheck()}
                type="button"
              >
                {runPending ? "Starting..." : "Run first check"}
                <ArrowRight size={14} weight="bold" />
              </button>
            ) : copy.href !== appPath(projectRef, "integrations") || canManageProviders ? (
              <Link
                className="inline-flex flex-none items-center gap-[7px] rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
                href={copy.href}
              >
                {copy.link}
                <ArrowRight size={14} weight="bold" />
              </Link>
            ) : null}
          </div>
        </div>
        <div className="mt-[18px] flex flex-wrap items-center gap-x-7 gap-y-2 border-t border-border-soft pt-4 font-mono text-[11px] text-fg-faint">
          <MetaItem label="Search volume">{volumeLabel}</MetaItem>
          <MetaDivider />
          <MetaItem label="Tag">{tagLabel}</MetaItem>
          <MetaDivider />
          <MetaItem label="Added">{addedLabel(keyword.createdAt)}</MetaItem>
          <MetaDivider />
          <MetaItem label="Position">{copy.position}</MetaItem>
        </div>
        <KeywordIndexStatus presence={keyword.urlPresence} />
        {canUpdateKeyword ? (
          <KeywordEditDrawer
            keyword={keyword}
            onClose={() => setEditing(false)}
            open={editing}
            projectId={projectId}
            providerRate={providerRate}
            updateKeywordAction={updateKeywordAction}
            updateKeywordScheduleAction={updateKeywordScheduleAction}
          />
        ) : null}
      </div>

      <KeywordPendingEmptyState copy={copy} state={state} />
    </>
  );
}
