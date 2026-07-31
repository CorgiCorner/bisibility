import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";
import { operationPolicy, operationPolicyForRequest, type ProjectAccess } from "./operation-policy";
import type { ApiScope } from "./scope-policy";

type DocumentedOperation = {
  method: string;
  operationId: string;
  path: string;
  projectAccess: ProjectAccess;
  requiredScope: ApiScope;
};

function usesApiCredential(operation: { security?: object[] }) {
  return operation.security?.some(
    (requirement) => "PersonalAccessToken" in requirement || "ProjectApiKey" in requirement,
  );
}

function pathSegments(path: string) {
  return path.split("/").filter(Boolean);
}

function legacyRequiredScope(method: string, path: string[]): ApiScope {
  if (method === "POST" && path[0] === "projects" && path[2] === "keyword-matches") {
    return "read";
  }
  if (method === "POST" && path[0] === "projects" && path[2] === "keyword-metrics") {
    return "write";
  }
  if (path[0] === "api-keys" || (path[0] === "projects" && path[2] === "api-keys")) {
    return "admin";
  }
  if (path[0] === "me" && path[1] === "tokens") {
    if (method === "DELETE" && path[2] === "current" && path.length === 3) return "read";
    return "admin";
  }
  if (method === "DELETE" && path[0] === "projects" && path.length === 2) return "admin";
  if (method === "DELETE" && path[0] === "projects" && path[2] === "webhooks") return "admin";
  if (path[0] === "projects" && path[2] === "team" && method !== "GET") return "admin";
  if (
    method === "GET" &&
    path[0] === "projects" &&
    ["backlinks", "keyword-research", "ranked-keyword-suggestions"].includes(path[2])
  ) {
    return "write";
  }
  return method === "GET" ? "read" : "write";
}

function legacyProjectAccess(method: string, path: string[]): ProjectAccess {
  return method === "GET" ||
    (method === "POST" &&
      path[0] === "projects" &&
      ["keyword-matches", "keyword-metrics"].includes(path[2]))
    ? "read"
    : "write";
}

function documentedOperations(): DocumentedOperation[] {
  const rows: DocumentedOperation[] = [];
  for (const [path, methods] of Object.entries(getOpenApiDocument().paths)) {
    for (const [method, candidate] of Object.entries(methods)) {
      const operation = candidate as { operationId?: string; security?: object[] };
      if (!operation.operationId || !usesApiCredential(operation)) continue;
      const upperMethod = method.toUpperCase();
      const segments = pathSegments(path);
      rows.push({
        method: upperMethod,
        operationId: operation.operationId,
        path,
        projectAccess: legacyProjectAccess(upperMethod, segments),
        requiredScope: legacyRequiredScope(upperMethod, segments),
      });
    }
  }
  return rows.sort((left, right) => left.operationId.localeCompare(right.operationId));
}

describe("operation policy", () => {
  it("declares every authenticated OpenAPI operation exactly once", () => {
    const before = documentedOperations();
    const after = Object.entries(operationPolicy)
      .filter(([operationId]) => operationId !== "revokeCurrentPersonalAccessToken")
      .map(([operationId, declared]) => ({ operationId, ...declared }))
      .sort((left, right) => left.operationId.localeCompare(right.operationId));

    expect(after).toEqual(before);
    expect(before).toHaveLength(80);
    for (const operation of before) {
      const runtimePath = pathSegments(operation.path).map((segment) =>
        segment.startsWith("{") ? "value" : segment,
      );
      expect(operationPolicyForRequest(operation.method, runtimePath)?.operationId).toBe(
        operation.operationId,
      );
    }
  });

  it("preserves the complete required-scope distribution", () => {
    const counts = documentedOperations().reduce<Record<ApiScope, number>>(
      (result, operation) => {
        result[operation.requiredScope] += 1;
        return result;
      },
      { admin: 0, read: 0, write: 0 },
    );

    expect(counts).toEqual({ admin: 15, read: 26, write: 39 });
  });

  it("declares self-revocation and prefers it over the token-id route", () => {
    expect(operationPolicyForRequest("DELETE", ["me", "tokens", "current"])).toMatchObject({
      operationId: "revokeCurrentPersonalAccessToken",
      requiredScope: "read",
    });
    expect(
      operationPolicyForRequest("DELETE", ["me", "tokens", "pat_a00000000000000000000000"]),
    ).toMatchObject({
      operationId: "revokePersonalAccessToken",
      requiredScope: "admin",
    });
  });
});
