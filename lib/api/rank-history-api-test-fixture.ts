import { reportProject } from "@/lib/rank-reports/report-test-fixture";
import type { ApiContext } from "./context";

export function exportTestContext(query = ""): ApiContext {
  const url = new URL(
    `https://example.com/api/v1/projects/${reportProject.publicId}/exports/rank-history${query}`,
  );
  return {
    actor: {
      id: "internal_actor_never_output",
      memberships: [{ projectId: reportProject.id, role: "admin" }],
    },
    actorId: null,
    auth: {
      apiKey: {
        id: "internal_key_never_output",
        name: "Fixture",
        prefix: "synthetic",
        projectId: reportProject.id,
        scopes: ["read"],
      },
      project: {
        id: reportProject.id,
        publicId: reportProject.publicId,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        domain: "example.com",
        name: "Fixture",
      },
    },
    headers: new Headers({ "X-Test": "preserved" }),
    instance: url.href,
    method: "GET",
    origin: {
      credentialKind: "project_key",
      credentialId: "internal_key_never_output",
      source: "api",
      surface: "programmatic",
    },
    path: [],
    req: new Request(url),
    url,
  };
}
