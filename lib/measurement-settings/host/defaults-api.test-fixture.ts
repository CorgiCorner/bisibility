import type { ApiContext } from "@/lib/api/context";
/** A trusted router fixture: project keys have no User or audit actor. */
export function defaultsApiFixture(projectRef: string, body: unknown, preview = false): ApiContext {
  const url = new URL(`https://fixture.invalid/api/v1/projects/${projectRef}/defaults`);
  if (preview) url.searchParams.set("preview_only", "true");
  return {
    actor: { id: "owner", memberships: [{ projectId: "project", role: "admin" }] },
    actorId: null,
    auth: {
      apiKey: {
        id: "key",
        projectId: "project",
        name: "synthetic",
        prefix: "fixture",
        scopes: ["write"],
      },
      project: {
        id: "project",
        publicId: projectRef,
        ownerId: "owner",
        domain: "fixture.invalid",
        name: "Fixture",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    },
    headers: new Headers(),
    instance: url.href,
    method: "PATCH",
    path: ["projects", projectRef, "defaults"],
    origin: {
      credentialKind: "project_key",
      credentialId: "key",
      source: "api",
      surface: "programmatic",
    },
    url,
    req: new Request(url, { method: "PATCH", body: JSON.stringify(body) }),
  };
}
