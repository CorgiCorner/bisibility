import type { MatchEvaluation } from "./dto";

/** The caller resolves an authorized explicit subject revision before this projection. */
export function subjectMatchResults(
  matches: readonly MatchEvaluation[],
  subject: { projectId: string; entityId: string; identityRevisionId: string },
) {
  const rows = matches.filter(
    (match) =>
      match.projectId === subject.projectId &&
      match.entityId === subject.entityId &&
      match.identityRevisionId === subject.identityRevisionId,
  );
  return Object.freeze({
    confirmed: Object.freeze(rows.filter((match) => match.status === "confirmed")),
    candidates: Object.freeze(rows.filter((match) => match.status === "candidate")),
    rejected: Object.freeze(rows.filter((match) => match.status === "rejected")),
    unresolved: Object.freeze(rows.filter((match) => match.status === "unresolved")),
  });
}
