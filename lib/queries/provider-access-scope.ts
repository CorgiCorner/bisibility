import "server-only";

import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { resolveDemoAccountView } from "@/lib/demo/account-view";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import type { ProviderAccessScope } from "@/lib/providers/access-scope";
import { requireReadableProject } from "./_auth";

export async function readProjectProviderAccessScope(projectRef: string) {
  const { actor, project } = await requireReadableProject(projectRef);
  // Demo visitors stay read-only; the configured demo owner manages providers and budgets.
  const readOnly =
    isProjectReadOnly(project.writeMode) || (await resolveDemoAccountView(actor.id)) === "locked";
  const scope: ProviderAccessScope = {
    canManageProviders:
      !readOnly &&
      canProjectAction(getProjectRole(actor, project.id), "manage", "provider_connection"),
    projectRef: project.publicId,
    readOnly,
  };
  return { actor, project, scope };
}
