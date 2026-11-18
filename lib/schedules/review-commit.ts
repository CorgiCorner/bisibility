import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { verifiedReviewedConsent } from "@/lib/measurement-settings/host/reviewed-consent";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { PreviewTokenError } from "@/lib/rank-check/runs/preview-token";
import {
  ScheduleReviewGateError,
  ScheduleReviewRequiredError,
  ScheduleReviewStaleError,
} from "./errors";
import type { ScheduleChange } from "./preview";
import {
  type ScheduleReviewPrincipal,
  scheduleReviewBinding,
  scheduleReviewIdentity,
} from "./review-binding";
import { reviewWindow } from "./review-cost";
import { assessScheduleSpend } from "./review-decision";
import { loadScheduleSpend } from "./review-load";
import { mintSchedulePermit, runWithSchedulePermit } from "./review-permit";
import { consumeDurableScheduleReview } from "./review-receipt";

const WINDOW_SKEW_MS = 10 * 60 * 1000 + 24 * 60 * 60 * 1000;

function echoedWindow(value: string | undefined, now: Date) {
  if (!value) return null;
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return null;
  if (Math.abs(start.getTime() - now.getTime()) > WINDOW_SKEW_MS) return null;
  return start;
}

export type ScheduleReviewSubmission = {
  consent_summary?: unknown;
  expected_revision?: string;
  preview_token?: string;
  window_start?: string;
};

export const WEB_UNGATED_REVIEW = { review: "web_ungated" as const };

type ScheduleWriteDb = {
  $transaction: <T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ) => Promise<T>;
};

/** `web_ungated` is the explicit web marker. Omitting the gate and the marker throws. */
export type ScheduleWriteOptions = {
  db?: ScheduleWriteDb;
  atomic?: boolean;
  rejectStaleToken?: boolean;
  gate?: boolean;
  now?: Date;
  review?: ScheduleReviewSubmission | "web_ungated";
  reviewPrincipal?: ScheduleReviewPrincipal;
};

export async function commitReviewedScheduleWrite<T>(args: {
  actor: ScheduleReviewPrincipal;
  change: ScheduleChange;
  now?: Date;
  options?: ScheduleWriteOptions;
  projectId: string;
  run: (consent: unknown, tx?: Prisma.TransactionClient) => Promise<T>;
}): Promise<T> {
  const review = args.options?.review;
  if (review === "web_ungated") return args.run(null);
  if (!args.options?.gate && !review) throw new ScheduleReviewGateError();
  const now = args.now ?? args.options?.now ?? new Date();
  const submission = review;
  const loaded = await loadScheduleSpend(args.projectId, args.change, now);
  loaded.spend.windowStart = reviewWindow(now).start;
  const decision = assessScheduleSpend(loaded.spend);
  // Local activation requires a separate recurring approval and worker wake.
  if (
    decision.requires_review &&
    args.change.op === "state" &&
    args.change.command.kind === "local_monitor" &&
    args.change.state === "active"
  ) {
    throw new ScheduleReviewGateError();
  }
  const token = submission?.preview_token;
  const revision = submission?.expected_revision;
  if (revision && revision !== loaded.revision)
    throw new ScheduleReviewStaleError("preview_mismatch");
  if (
    !decision.requires_review &&
    (!token || !(args.options?.atomic || args.options?.rejectStaleToken))
  ) {
    if (!args.options?.atomic) return args.run(null);
    const execute = async (tx: Prisma.TransactionClient) => {
      await lockProjectForProviderMutation(tx, args.projectId);
      const current = await loadScheduleSpend(args.projectId, args.change, now, tx);
      if (assessScheduleSpend(current.spend).requires_review)
        throw new ScheduleReviewRequiredError();
      return args.run(null, tx);
    };
    return args.options.db ? args.options.db.$transaction(execute) : prisma.$transaction(execute);
  }
  if (!token || !revision) throw new ScheduleReviewRequiredError();
  const start = echoedWindow(submission?.window_start, now);
  if (!start) throw new ScheduleReviewStaleError("preview_mismatch");
  loaded.spend.windowStart = start;
  const signed = assessScheduleSpend(loaded.spend);
  const preview = { ...signed, window_start: start.toISOString() };
  const { subject, actorId } = scheduleReviewIdentity(args.options?.reviewPrincipal ?? args.actor);
  try {
    verifiedReviewedConsent(
      "schedule",
      token,
      scheduleReviewBinding(
        args.projectId,
        subject,
        loaded.bindingChange ?? args.change,
        loaded.revision,
        preview,
      ),
      now,
    );
  } catch (error) {
    if (error instanceof ScheduleReviewStaleError) throw error;
    const code =
      error instanceof PreviewTokenError
        ? error.code
        : typeof error === "object" && error && "code" in error
          ? error.code
          : undefined;
    throw new ScheduleReviewStaleError(code === "expired" ? "preview_expired" : "preview_mismatch");
  }
  const permit = mintSchedulePermit(
    token,
    args.projectId,
    subject,
    submission?.consent_summary ?? null,
  );
  const run = async (consent: unknown, tx: Prisma.TransactionClient) => {
    await consumeDurableScheduleReview(tx, {
      actorId,
      guard: loaded.guard,
      projectId: args.projectId,
      revision: loaded.revision,
      token,
    });
    if (args.options?.atomic) {
      const current = await loadScheduleSpend(args.projectId, args.change, now, tx);
      current.spend.windowStart = start;
      const actual = assessScheduleSpend(current.spend);
      if (
        current.revision !== loaded.revision ||
        actual.cost_before_cents !== signed.cost_before_cents ||
        actual.cost_after_cents !== signed.cost_after_cents ||
        actual.review_reasons.join() !== signed.review_reasons.join()
      )
        throw new ScheduleReviewStaleError("preview_mismatch");
    }
    return args.run(consent, tx);
  };
  const transaction = args.options?.db?.$transaction;
  return transaction
    ? runWithSchedulePermit(permit, args.projectId, subject, run, (callback, options) =>
        transaction(callback, options),
      )
    : runWithSchedulePermit(permit, args.projectId, subject, run);
}
