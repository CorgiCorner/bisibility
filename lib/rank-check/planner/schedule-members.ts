import { createHash } from "node:crypto";

type ScheduleMember = { id: string };

export function scheduledRunMembers(members: readonly ScheduleMember[]) {
  const keywordIds = members.map(({ id }) => id);
  const selectionHash = createHash("sha256")
    .update([...keywordIds].sort().join("\n"))
    .digest("hex");
  return { keywordIds, selectionHash };
}
