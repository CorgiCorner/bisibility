"use client";
import { unwrapScheduleActionResult } from "@/lib/schedules/action-result";
import type { ScheduleChange, ScheduleChangePreview } from "@/lib/schedules/preview";
import {
  requestScheduleChangePreview,
  SchedulePreviewRequestError,
} from "@/lib/schedules/preview-client";
import type { ScheduleReviewSubmission } from "@/lib/schedules/review-commit";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { ScheduleCostReviewDialog } from "./ScheduleCostReviewDialog";

export class ScheduleReviewCancelled extends Error {}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return !!value && typeof (value as { then?: unknown }).then === "function";
}

type Pending = {
  preview: ScheduleChangePreview;
  changed: boolean;
  emptyScheduleCreated: boolean;
  submitting: boolean;
};
function refreshedPreview(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error) || !("preview" in error))
    return null;
  return error.code === "schedule_review_required" || error.code === "schedule_review_stale"
    ? (error.preview as ScheduleChangePreview)
    : null;
}
function submission(preview: ScheduleChangePreview): ScheduleReviewSubmission | undefined {
  return preview.requires_review && preview.preview_token
    ? {
        preview_token: preview.preview_token,
        expected_revision: preview.expected_revision,
        window_start: preview.window_start,
      }
    : undefined;
}

/** Every screen uses the same preview, explicit confirmation and stale re-review flow. */
export function useScheduleSpendReview(projectId: string) {
  const t = useTranslations("shared.scheduleReview");
  const [pending, setPending] = useState<Pending | null>(null);
  const active = useRef(false);
  const owner = useRef<symbol | null>(null);
  const waiters = useRef<Array<() => void>>([]);
  const runs = useRef(0);
  const confirming = useRef(false);
  const confirmRef = useRef<() => Promise<void>>(async () => {});
  const cancelRef = useRef<() => void>(() => {});

  async function runCurrent<T>(
    change: ScheduleChange,
    submit: (review?: ScheduleReviewSubmission) => Promise<T>,
    options: { emptyScheduleCreated?: boolean } = {},
  ): Promise<T> {
    if (owner.current) throw new ScheduleReviewCancelled();
    const key = Symbol();
    owner.current = key;
    runs.current += 1;
    active.current = true;
    const release = () => {
      if (owner.current !== key) return;
      owner.current = null;
      for (const wake of waiters.current.splice(0)) wake();
    };
    const acquire = async () => {
      while (owner.current && owner.current !== key)
        await new Promise<void>((resolve) => waiters.current.push(resolve));
      owner.current = key;
    };
    try {
      const result = requestScheduleChangePreview({ projectId, change });
      const preview = unwrapScheduleActionResult(isPromise(result) ? await result : result);
      let fresh = preview;
      let changed = false;
      if (!preview.requires_review) {
        // Independent no-review writes may run together; dialogs still have one owner.
        release();
        try {
          return unwrapScheduleActionResult(await submit());
        } catch (error) {
          const next = refreshedPreview(error);
          if (!next) throw error;
          await acquire();
          fresh = next;
          changed = true;
        }
      }
      return await new Promise<T>((resolve, reject) => {
        const show = (value: ScheduleChangePreview, stale: boolean) =>
          setPending({
            preview: value,
            changed: stale,
            emptyScheduleCreated: options.emptyScheduleCreated ?? false,
            submitting: false,
          });
        const finish = () => {
          confirming.current = false;
          setPending(null);
        };
        const confirm = async () => {
          if (confirming.current) return;
          confirming.current = true;
          setPending((current) => current && { ...current, submitting: true });
          try {
            const result = unwrapScheduleActionResult(await submit(submission(fresh)));
            finish();
            resolve(result);
          } catch (error) {
            const next = refreshedPreview(error);
            if (next) {
              fresh = next;
              confirming.current = false;
              show(next, true);
            } else {
              finish();
              reject(error);
            }
          }
        };
        confirmRef.current = confirm;
        cancelRef.current = () => {
          if (confirming.current) return;
          finish();
          reject(new ScheduleReviewCancelled());
        };
        show(fresh, changed);
      });
    } catch (error) {
      if (error instanceof SchedulePreviewRequestError) throw new Error(t("previewFailed"));
      throw error;
    } finally {
      release();
      runs.current -= 1;
      active.current = runs.current > 0;
    }
  }
  const runRef = useRef(runCurrent);
  runRef.current = runCurrent;
  const run = useCallback<typeof runCurrent>((...args) => runRef.current(...args), []);
  const isActive = useCallback(() => active.current, []);
  const dialog = pending ? (
    <ScheduleCostReviewDialog
      {...pending}
      onConfirm={() => void confirmRef.current()}
      onCancel={() => cancelRef.current()}
    />
  ) : null;
  return { run, dialog, isActive };
}
