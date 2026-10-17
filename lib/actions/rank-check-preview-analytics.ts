import {
  readAnalyticsSurfaceFromHeaders,
  readConsentFromCookies,
  trackServerEvent,
} from "@/lib/analytics/server";
import { prisma } from "@/lib/db/prisma";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { after } from "next/server";
import { v5 as uuidv5 } from "uuid";
import type { RunFirstCheckPreviewResult } from "./rank-check-preview-result";

export async function emitFirstCheckPreviewResult(input: {
  actorId: string;
  projectId: string;
  result: RunFirstCheckPreviewResult;
  startedAt: number;
}): Promise<void> {
  try {
    const surface = await readAnalyticsSurfaceFromHeaders();
    if (surface !== "onboarding" && surface !== "getting_started") return;
    const connections = await loadSerpProviderChain(input.projectId);
    const provider =
      input.result.status === "completed" ? input.result.provider : connections[0]?.provider;
    if (!provider) return;
    await trackServerEvent("rank_check_preview_completed", {
      consent: await readConsentFromCookies(),
      distinctId: input.actorId,
      properties: {
        duration_ms: Math.max(0, Date.now() - input.startedAt),
        provider,
        status: input.result.status,
        surface,
      },
    });
  } catch {
    // Analytics must not change the preview result if request metadata or capture is unavailable.
  }
}

/** Called only after the request has authorized the project and read its results. */
export async function emitFirstCheckRunCompletion(input: {
  actorId: string;
  projectId: string;
  runPublicIds: string[];
}): Promise<void> {
  if (input.runPublicIds.length === 0) return;
  try {
    const surface = await readAnalyticsSurfaceFromHeaders();
    if (surface !== "onboarding" && surface !== "getting_started") return;
    const consent = await readConsentFromCookies();
    if (!consent.analytics || consent.status !== "decided" || consent.decidedAt === null) return;
    const consentAt = new Date(consent.decidedAt * 1000);
    const completedItem = { status: "completed", rankCheck: { status: "completed" } };
    const runs = await prisma.rankCheckRun.findMany({
      where: {
        publicId: { in: [...new Set(input.runPublicIds)].slice(0, 100) },
        projectId: input.projectId,
        requestedById: input.actorId,
        deletedAt: null,
        trigger: "manual",
        createdAt: { gte: consentAt },
        project: { isSample: false },
        items: { some: completedItem },
      },
      select: {
        publicId: true,
        createdAt: true,
        items: {
          where: completedItem,
          orderBy: [{ finishedAt: "asc" }, { id: "asc" }],
          take: 1,
          select: {
            status: true,
            rankCheck: { select: { status: true, provider: true, finishedAt: true } },
          },
        },
      },
    });
    for (const run of runs) {
      const item = run.items[0];
      const check = item?.rankCheck;
      if (
        run.createdAt < consentAt ||
        item?.status !== "completed" ||
        check?.status !== "completed" ||
        !check.finishedAt
      )
        continue;
      const finishedAt = check.finishedAt;
      after(async () => {
        try {
          await trackServerEvent("rank_check_preview_completed", {
            consent,
            distinctId: input.actorId,
            uuid: uuidv5(
              `bisibility/first-check/${input.actorId}/${run.publicId}/completed`,
              uuidv5.URL,
            ),
            timestamp: finishedAt,
            properties: {
              duration_ms: Math.max(0, finishedAt.getTime() - run.createdAt.getTime()),
              provider: check.provider,
              status: "completed",
              surface,
            },
          });
        } catch {
          // Delivery remains best effort after the result response has been sent.
        }
      });
    }
  } catch {
    // Optional analytics must not prevent a user from reading a completed result.
  }
}
