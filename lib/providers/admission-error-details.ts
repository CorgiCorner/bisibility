import "server-only";

export type AdmissionErrorDetails = {
  balance_cents: number | null;
  top_up_url: string;
};

/** Self-hosted own-key requests have no hosted balance metadata. */
export async function loadAdmissionErrorDetails(
  _projectId: string,
  _projectPublicId: string | null,
  _principalId: string | null,
): Promise<AdmissionErrorDetails | null> {
  return null;
}
