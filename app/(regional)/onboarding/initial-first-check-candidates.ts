import { listFirstCheckCandidates } from "@/lib/actions/rank-check-preview";

export async function initialFirstCheckCandidates(
  currentStep: number,
  projectId: string | null,
  keywordText: string | null,
  limit: number,
) {
  if (currentStep !== 4 || !projectId || !keywordText) return undefined;
  return (
    await listFirstCheckCandidates({
      projectId,
      keywordText,
      includeExisting: true,
      limit,
    })
  ).candidates;
}
