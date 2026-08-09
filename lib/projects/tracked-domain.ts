import { trackedProjectDomain } from "@/lib/schemas/project";

/**
 * A workspace is created without a domain, so every path that actually needs one
 * asks for it here. The message names the field the user has to fill in; a bare
 * schema error would only say the value is missing.
 */
export const PROJECT_DOMAIN_REQUIRED_MESSAGE =
  "This project has no domain yet. Open Settings > Project details, set the domain bisibility should track, and try again.";

export class ProjectDomainRequiredError extends Error {
  constructor(message: string = PROJECT_DOMAIN_REQUIRED_MESSAGE) {
    super(message);
    this.name = "ProjectDomainRequiredError";
  }
}

export function hasTrackedDomain(project: { domain: string | null }) {
  return trackedProjectDomain(project.domain) !== null;
}

/** Returns the tracked domain, or throws a message that points at the settings field. */
export function requireTrackedDomain(project: { domain: string | null }) {
  const domain = trackedProjectDomain(project.domain);
  if (!domain) {
    throw new ProjectDomainRequiredError();
  }
  return domain;
}
