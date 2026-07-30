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
import { actionErrorMessage } from "@/lib/ui/action-error";
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

function projectInput(projectId: string) {
  return { projectId };
}

function transferProgress(sentChunks: number, totalChunks: number, message: string) {
  return { message, sentChunks, stage: "transferring" as const, totalChunks };
}

export function useChunkedTransfer() {
  const [progress, setProgress] = useState<ChunkedTransferProgress | null>(null);

  async function runSingleShotTransfer({ projectId, targetOrigin, token }: RunTransferInput) {
    const file = await exportCloudImportPackage(projectInput(projectId));
    setProgress(transferProgress(0, 1, "Transferring package."));
    const completion = unwrapActionResult(
      await transferCloudImportPackage({
        ...projectInput(projectId),
        content: file.content,
        filename: file.filename,
        targetOrigin,
        token,
      }),
    );
    setProgress({ message: "Transfer accepted.", sentChunks: 1, stage: "done", totalChunks: 1 });
    return { completion, file, mode: "single" as const };
  }

  async function runChunkedTransfer({
    projectId,
    targetOrigin,
    token,
  }: RunTransferInput): Promise<TransferResult> {
    setProgress({
      message: "Planning transfer.",
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
      if (!target.reachable)
        throw new Error(target.reason ?? "Target instance could not be reached.");
      if (!target.supportsSessions && plan.useSessions) {
        throw new Error(
          target.reason ??
            "Target instance does not support chunked sessions. Upgrade it before transferring this project.",
        );
      }
      if (!plan.useSessions) return await runSingleShotTransfer({ projectId, targetOrigin, token });

      const totalChunks = plan.chunkCount;
      setProgress(transferProgress(0, totalChunks, "Creating import session."));
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
        setProgress(transferProgress(index + 1, totalChunks, "Transferring keyword chunks."));
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
      setProgress(transferProgress(totalChunks, totalChunks, "Transferred sections."));
      setProgress({
        message: "Finalizing import session.",
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
        message: "Transfer complete.",
        sentChunks: totalChunks,
        stage: "done",
        totalChunks,
      });
      return { completion, mode: "sessions" };
    } catch (error) {
      const message = actionErrorMessage(error, "Chunked transfer failed.");
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
