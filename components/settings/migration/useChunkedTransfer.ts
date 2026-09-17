"use client";

import type { CloudImportPackageFile } from "@/components/cloud/cloud-token";
import { unwrapActionFailureResult, unwrapActionResult } from "@/lib/actions/action-result";
import {
  exportCloudImportPackage,
  preflightMigrationTarget,
  transferCloudImportPackage,
} from "@/lib/actions/cloud";
import {
  createRemoteImportSession,
  exportAndTransferChunk,
  finalizeRemoteImportSession,
  planChunkedTransfer,
  transferSectionsChunk,
} from "@/lib/actions/instance-migration";
import type { MigrationImportCompletion } from "@/lib/migration/result";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type ChunkedTransferProgress = {
  message: string;
  sentChunks: number;
  stage: "planning" | "transferring" | "finalizing" | "done" | "error";
  totalChunks: number;
};

type RunTransferInput = {
  projectId: string;
  targetOrigin?: string;
  token: string;
};

type TransferResult = {
  completion: MigrationImportCompletion;
  file?: CloudImportPackageFile;
  mode: "single" | "sessions";
};

export class ChunkedTransferError extends Error {
  constructor(readonly reason: "sessionsUnsupported" | "unreachable") {
    super(reason);
  }
}

function projectInput(projectId: string) {
  return { projectId };
}

function transferProgress(sentChunks: number, totalChunks: number, message: string) {
  return { message, sentChunks, stage: "transferring" as const, totalChunks };
}

export function useChunkedTransfer() {
  const t = useTranslations("projectSettingsMigration.transfer");
  const [progress, setProgress] = useState<ChunkedTransferProgress | null>(null);

  async function runSingleShotTransfer({ projectId, targetOrigin, token }: RunTransferInput) {
    const file = await exportCloudImportPackage(projectInput(projectId));
    setProgress(transferProgress(0, 1, t("progress.single")));
    const completion = unwrapActionResult(
      await transferCloudImportPackage({
        ...projectInput(projectId),
        content: file.content,
        filename: file.filename,
        targetOrigin,
        token,
      }),
    );
    setProgress({ message: t("progress.accepted"), sentChunks: 1, stage: "done", totalChunks: 1 });
    return { completion, file, mode: "single" as const };
  }

  async function runChunkedTransfer({
    projectId,
    targetOrigin,
    token,
  }: RunTransferInput): Promise<TransferResult> {
    setProgress({
      message: t("progress.planning"),
      sentChunks: 0,
      stage: "planning",
      totalChunks: 0,
    });
    try {
      const [plan, target] = await Promise.all([
        planChunkedTransfer(projectInput(projectId)),
        preflightMigrationTarget({ ...projectInput(projectId), targetOrigin }).then(
          unwrapActionFailureResult,
        ),
      ]);
      if (!target.reachable) throw new ChunkedTransferError("unreachable");
      if (!target.supportsSessions && plan.useSessions) {
        throw new ChunkedTransferError("sessionsUnsupported");
      }
      if (!plan.useSessions) return await runSingleShotTransfer({ projectId, targetOrigin, token });

      const totalChunks = plan.chunkCount;
      setProgress(transferProgress(0, totalChunks, t("progress.creatingSession")));
      const session = unwrapActionResult(
        await createRemoteImportSession({
          ...projectInput(projectId),
          chunkCount: plan.chunkCount,
          targetOrigin,
          token,
          totals: { keywords: plan.totalKeywords, rankChecks: plan.totalRankChecks },
        }),
      );
      let cursor: string | null = null;
      const keywordChunks = Math.max(0, totalChunks - 1);
      for (let index = 0; index < keywordChunks; index += 1) {
        const result: { chunksReceived: number; done: boolean; nextCursor: string | null } =
          unwrapActionResult(
            await exportAndTransferChunk({
              ...projectInput(projectId),
              cursor,
              index,
              sessionId: session.sessionId,
              targetOrigin,
              token,
            }),
          );
        cursor = result.nextCursor;
        setProgress(transferProgress(index + 1, totalChunks, t("progress.transferringKeywords")));
      }
      unwrapActionResult(
        await transferSectionsChunk({
          ...projectInput(projectId),
          index: keywordChunks,
          sessionId: session.sessionId,
          targetOrigin,
          token,
        }),
      );
      setProgress(transferProgress(totalChunks, totalChunks, t("progress.transferredSections")));
      setProgress({
        message: t("progress.finalizing"),
        sentChunks: totalChunks,
        stage: "finalizing",
        totalChunks,
      });
      const completion = unwrapActionResult(
        await finalizeRemoteImportSession({
          ...projectInput(projectId),
          sessionId: session.sessionId,
          targetOrigin,
          token,
        }),
      );
      setProgress({
        message: t("progress.complete"),
        sentChunks: totalChunks,
        stage: "done",
        totalChunks,
      });
      return { completion, mode: "sessions" };
    } catch (error) {
      const message =
        error instanceof ChunkedTransferError
          ? error.reason === "unreachable"
            ? t("error.unreachable")
            : t("error.sessionsUnsupported")
          : t("error.generic");
      setProgress((current) => ({
        message,
        sentChunks: current?.sentChunks ?? 0,
        stage: "error",
        totalChunks: current?.totalChunks ?? 0,
      }));
      throw error;
    }
  }

  return { progress, runChunkedTransfer };
}
