import type { EvidenceProjection } from "@/lib/provider-evidence/projection/model";
export type RecoveryEvidenceView = {
  closedUnknown?: boolean;
  projection: EvidenceProjection | null;
  incident: { href: string; openedAt: string; ageMinutes: number } | null;
};
export type PartialEvidenceView = {
  id: string;
  kind: "partial" | "unresolved";
  project: string;
  checkHref: string;
  returnedDepth: number | null;
  createdAt: string;
};
export function incidentOpenTime(incident: {
  openedAt: Date;
  transitions: readonly { kind: string; version: number; createdAt: Date }[];
}) {
  const opening = incident.transitions
    .filter(
      (transition) =>
        transition.kind === "reopened" ||
        (transition.kind === "linked" && transition.version === 1),
    )
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  return opening?.createdAt ?? incident.openedAt;
}
export function incidentAgeMinutes(openedAt: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - openedAt.getTime()) / 60_000));
}
