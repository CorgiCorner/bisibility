import { actionErrorMessage } from "@/components/onboarding/onboarding-form-utils";
import type {
  FirstCheckCandidate,
  FirstCheckPreviewFailureCode,
  ObservedPosition,
  RunFirstCheckPreviewResult,
} from "@/lib/actions/rank-check-preview";

type FirstCheckTarget = Pick<FirstCheckCandidate, "device" | "market">;

export type FirstCheckResultRow =
  | (FirstCheckTarget & {
      keywordId: string;
      publicId: string;
      status: "pending";
      text: string;
    })
  | (FirstCheckTarget & {
      keywordId: string;
      provider: string;
      publicId: string;
      position: number | null;
      rankingUrl: string | null;
      status: "completed";
      text: string;
    })
  | (FirstCheckTarget & {
      code: FirstCheckPreviewFailureCode | "client_error";
      keywordId: string;
      message: string;
      publicId: string;
      status: "failed";
      text: string;
    })
  | {
      clicks: number;
      impressions: number;
      keywordId: string;
      position: number;
      status: "observed";
      text: string;
    };

export type FirstCheckRunState = {
  message: string | null;
  mode: "observed" | "preview";
  rows: FirstCheckResultRow[];
  status: "completed" | "failed" | "idle" | "running";
};

export const initialFirstCheckRunState: FirstCheckRunState = {
  message: null,
  mode: "preview",
  rows: [],
  status: "idle",
};

export function pendingRow(candidate: FirstCheckCandidate): FirstCheckResultRow {
  return {
    device: candidate.device,
    keywordId: candidate.id,
    market: candidate.market,
    publicId: candidate.publicId,
    status: "pending",
    text: candidate.text,
  };
}

export function previewRow(
  candidate: FirstCheckCandidate,
  result: RunFirstCheckPreviewResult,
): FirstCheckResultRow {
  if (result.status === "completed") {
    return {
      device: candidate.device,
      keywordId: candidate.id,
      market: candidate.market,
      position: result.position,
      provider: result.provider,
      publicId: candidate.publicId,
      rankingUrl: result.rankingUrl,
      status: "completed",
      text: candidate.text,
    };
  }

  return {
    code: result.code,
    device: candidate.device,
    keywordId: candidate.id,
    market: candidate.market,
    message: result.message,
    publicId: candidate.publicId,
    status: "failed",
    text: candidate.text,
  };
}

export function clientErrorRow(
  candidate: FirstCheckCandidate,
  error: unknown,
): FirstCheckResultRow {
  return {
    code: "client_error",
    device: candidate.device,
    keywordId: candidate.id,
    market: candidate.market,
    message: actionErrorMessage(error),
    publicId: candidate.publicId,
    status: "failed",
    text: candidate.text,
  };
}

export function observedRow(position: ObservedPosition): FirstCheckResultRow {
  return {
    clicks: position.clicks,
    impressions: position.impressions,
    keywordId: position.keywordId,
    position: position.position,
    status: "observed",
    text: position.text,
  };
}

export function candidateFromFailedRow(
  row: Extract<FirstCheckResultRow, { status: "failed" }>,
): FirstCheckCandidate {
  return {
    device: row.device,
    id: row.keywordId,
    market: row.market,
    publicId: row.publicId,
    text: row.text,
  };
}
