"use client";
import { type ProjectDefaultsInput, projectDefaultsSchema } from "@/lib/schemas/project";
import type { DefaultsPreview, DefaultsReview } from "@/lib/settings/reviewed-defaults-contract";
import { useCallback, useRef, useState } from "react";
export class DefaultsSaveRejected extends Error {
  constructor(readonly code: string) {
    super("Review the current settings again before saving.");
  }
}
export type PreviewDefaults = (values: ProjectDefaultsInput) => Promise<DefaultsPreview>;
export type SaveDefaults = (
  values: ProjectDefaultsInput,
  review?: DefaultsReview,
) => Promise<unknown>;
function sameDraft(a: unknown, b: unknown) {
  const left = projectDefaultsSchema.safeParse(a),
    right = projectDefaultsSchema.safeParse(b);
  return left.success && right.success && JSON.stringify(left.data) === JSON.stringify(right.data);
}
/** A lost response locks the exact command. Recovery never generates a fresh key or silently reprices. */
export function useReviewedDefaults(
  preview: PreviewDefaults | undefined,
  save: SaveDefaults | undefined,
) {
  const [quote, setQuote] = useState<DefaultsPreview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false),
    [locked, setLocked] = useState(false);
  const [savedValue, setSavedValue] = useState<unknown>(null);
  const current = useRef({ preview, save });
  current.current = { preview, save };
  const generation = useRef(0),
    busy = useRef(false);
  const unresolved = useRef<{ values: ProjectDefaultsInput; review: DefaultsReview } | null>(null);
  const invalidate = useCallback(() => {
    if (unresolved.current) return;
    generation.current++;
    setQuote(null);
    setAcknowledged(false);
  }, []);
  async function submit(values: ProjectDefaultsInput): Promise<"review" | "saved"> {
    if (busy.current) return "review";
    const ports = current.current;
    if (!ports.save) throw new DefaultsSaveRejected("save_unavailable");
    if (!ports.preview) throw new Error("A current settings preview is required.");
    busy.current = true;
    setPending(true);
    try {
      if (!unresolved.current && (!quote || !sameDraft(values, quote.request.values))) {
        const id = ++generation.current;
        setQuote(null);
        setAcknowledged(false);
        const result = await ports.preview(structuredClone(values));
        if (
          generation.current !== id ||
          result.request.kind !== "form" ||
          !sameDraft(values, result.request.values)
        )
          return "review";
        setQuote(result);
        return "review";
      }
      if (!unresolved.current) {
        if (!quote || !acknowledged) return "review";
        unresolved.current = {
          values: structuredClone(values),
          review: {
            confirmed: true,
            idempotencyKey: crypto.randomUUID(),
            expectedRevision: quote.expectedRevision,
            expectedSourceHash: quote.expectedSourceHash,
            previewToken: quote.previewToken,
          },
        };
        setLocked(true);
      }
      const command = unresolved.current;
      const outcome = await ports.save(command.values, command.review);
      if (!outcome || typeof outcome !== "object" || !("kind" in outcome))
        throw new Error("The settings save response is unconfirmed. Recover the same command.");
      if (outcome.kind === "not_saved") {
        unresolved.current = null;
        setLocked(false);
        invalidate();
        const code =
          "code" in outcome && typeof outcome.code === "string" ? outcome.code : "invalid_settings";
        throw new DefaultsSaveRejected(code);
      }
      if (outcome.kind !== "saved") throw new Error("The settings save response is unconfirmed.");
      setSavedValue(outcome);
      unresolved.current = null;
      setLocked(false);
      invalidate();
      return "saved";
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return { quote, acknowledged, setAcknowledged, pending, locked, savedValue, invalidate, submit };
}
