import type { ChallengeReportBody } from "@/lib/challenge-report/schema";
import type { ShareExpiryChoice, ShareSettings } from "./settings";

export type ReportShareAudience = "link" | "members";

export type ReportSharePending = {
  reportId: string;
  stage: ChallengeReportBody["stage"];
  title: string;
};

/** Dialog state. The token is never included; copy re-issues it. */
export type ReportShareSummary = {
  access: ReportShareAudience;
  expires: ShareExpiryChoice;
  memberCount: number;
  ownerIsViewer: boolean;
  ownerName: string;
  pending: ReportSharePending | null;
  reportId: string;
  settings: ShareSettings;
  teamHref: string;
  views7d: number;
};

export type ReportShareActionResult =
  | { ok: true; summary: ReportShareSummary; token: string | null }
  | { code: "invalid" | "not_found" | "read_only"; ok: false };
