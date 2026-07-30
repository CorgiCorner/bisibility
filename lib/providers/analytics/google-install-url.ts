import type { GoogleProviderId } from "./google-client";

export function googleInstallUrl(input: {
  projectId: string;
  property?: string;
  provider: GoogleProviderId;
  returnPath: string;
}) {
  const params = new URLSearchParams({
    projectId: input.projectId,
    provider: input.provider,
    returnPath: input.returnPath,
  });
  if (input.property?.trim()) {
    params.set("property", input.property.trim());
  }
  return `/api/integrations/google/install?${params.toString()}`;
}
