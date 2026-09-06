export type ClaimCandidate = {
  archivedAt: Date | null;
  claimAttempts: number;
  claimExpiresAt: Date | null;
  device: string;
  domain: string;
  dueAt: Date;
  id: string;
  keywordId: string;
  keywordPublicId: string;
  locationId: string;
  marketActive: boolean;
  projectId: string;
  requestedCount: number;
  runId: string;
  runPublicId: string;
  status: string;
};

/** The run shape the finalizer needs, read from a claimed candidate. */
export function claimCandidateRun(candidate: ClaimCandidate) {
  return {
    id: candidate.runId,
    projectId: candidate.projectId,
    requestedCount: candidate.requestedCount,
    status: "running",
  };
}
