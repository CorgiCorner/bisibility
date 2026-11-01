export type AccountRecoveryState = "payment_required" | "verified" | "unknown";
export type AttentionState = "billing" | "checking" | "review" | "ready" | "internal";
export type ConnectionRecoveryView = {
  state: "billing" | "review" | "ready";
  accountVerified: boolean;
  checkedAt: string | null;
  affectedChecks: number;
  unconfirmedRequests: number;
  revision: string;
  paused: boolean;
  reason?: import("./selector").RecoveryReason | null;
  scope?: import("@/lib/providers/account-health/types").CapabilityScope | null;
  checking?: boolean;
  canCheck?: boolean;
  capacityUnit?: "usd" | "searches" | null;
  nextCheckAt?: string | null;
  checksNotSent?: number;
  currentIncidentChecksNotSent?: number;
  fallbackCompleted?: number;
  fallbackProviders?: string[];
  anotherActive?: boolean;
  rangeEnd?: string;
};
export type RunAccountBlock = {
  connectionId: string;
  provider: string;
  reason: import("./selector").RecoveryReason;
};
export type AffectedCheck = {
  id: string;
  keyword: string;
  checkedAt: string;
  outcome: string;
  accounting: "unknown" | "measured" | "not_sent";
};
export type AffectedCheckPage = {
  rows: AffectedCheck[];
  total: number;
  nextCursor: string | null;
};
