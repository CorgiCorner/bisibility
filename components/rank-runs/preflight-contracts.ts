import type {
  LaunchRankCheckRunActionInput,
  LaunchRankCheckRunActionResult,
} from "@/lib/actions/rank-check-run-launch-result";
import type {
  PreviewRankCheckRunActionInput,
  PreviewRankCheckRunActionResult,
} from "@/lib/actions/rank-check-run-preview-result";
import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";
import type { RunSelectionSpec } from "@/lib/rank-check/runs/selection";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/constants";
import { z } from "zod";
import type { CancelOverlappingRunAction } from "./PreflightOverlapNotice";
import type { PreflightProvider, PreflightScope } from "./preflight-presentation";

export const preflightFormSchema = z
  .object({
    depth: z.union(serpDepthValues.map((depth) => z.literal(depth))).optional(),
    providerId: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type PreflightFormInput = z.infer<typeof preflightFormSchema>;

type PreflightActions = {
  launchAction: (input: LaunchRankCheckRunActionInput) => Promise<LaunchRankCheckRunActionResult>;
  previewAction: (
    input: PreviewRankCheckRunActionInput,
  ) => Promise<PreviewRankCheckRunActionResult>;
};

export type PreflightDialogProps = PreflightActions & {
  budgetHref: string;
  cancelRunAction?: CancelOverlappingRunAction;
  duplicateDetail?: string;
  duplicateRunHref: string;
  initialDepth?: SerpDepth;
  initialPreview: RankCheckRunPreview;
  initialProviderId?: string;
  integrationsHref: string;
  leftAfterLabel?: string;
  onClose: () => void;
  onStarted?: (
    result: Exclude<
      LaunchRankCheckRunActionResult,
      { status: "not_started" } | { outcome: "nothing_to_run" }
    >,
  ) => void;
  open: boolean;
  projectId: PreviewRankCheckRunActionInput["projectId"];
  providers: readonly PreflightProvider[];
  providerFallbackNote?: string;
  scope: PreflightScope | ((preview: RankCheckRunPreview) => PreflightScope);
  spec: RunSelectionSpec;
};
