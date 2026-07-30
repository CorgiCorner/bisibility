import { describe, expect, it } from "vitest";
import {
  alertRuleAuditResource,
  apiKeyAuditResource,
  personalTokenAuditResource,
  projectAuditResource,
  providerConnectionAuditResource,
} from "./audit-resources";

const date = new Date("2026-07-27T12:00:00.000Z");

function expectNoInternalIdentifiers(value: unknown) {
  const json = JSON.stringify(value);
  expect(json).not.toContain("raw_db_");
  expect(value).not.toHaveProperty("projectId");
  expect(value).not.toHaveProperty("createdById");
  expect(value).not.toHaveProperty("credentialsEncrypted");
}

describe("public audit diff resources", () => {
  it("serializes API keys and personal tokens with public IDs", () => {
    const key = apiKeyAuditResource({
      expiresAt: date,
      name: "Deploy",
      prefix: "bsb_key_live_example",
      publicId: "key_a00000000000000000000000",
      revokedAt: null,
      scopes: ["read", "write"],
    });
    const token = personalTokenAuditResource({
      expiresAt: null,
      name: "CLI",
      prefix: "bsb_pat_live_example",
      publicId: "pat_a00000000000000000000000",
      revokedAt: date,
      scopes: ["read"],
    });

    expect(key.id).toBe("key_a00000000000000000000000");
    expect(token.id).toBe("pat_a00000000000000000000000");
    expectNoInternalIdentifiers(key);
    expectNoInternalIdentifiers(token);
  });

  it("serializes project, alert rule, and provider diffs without raw FKs", () => {
    const project = projectAuditResource({
      domain: "workspace.example.com",
      name: "Workspace",
      publicId: "prj_a00000000000000000000000",
      trackingScope: "domain",
    });
    const rule = alertRuleAuditResource({
      channels: ["webhook"],
      conditionType: "threshold",
      enabled: true,
      name: "Top 10",
      publicId: "alr_a00000000000000000000000",
      severity: "urgent",
      targetType: "all",
      thresholdPosition: 10,
    });
    const provider = providerConnectionAuditResource({
      costPerCheckCents: 1,
      credentialsEncrypted: "raw_db_encrypted_secret",
      enabled: true,
      kind: "serp",
      priority: 0,
      provider: "serpapi",
      publicId: "conn_a00000000000000000000000",
      status: "connected",
    });

    expect(project.id).toBe("prj_a00000000000000000000000");
    expect(rule.id).toBe("alr_a00000000000000000000000");
    expect(provider).toMatchObject({
      hasCredentials: true,
      id: "conn_a00000000000000000000000",
      provider: "serpapi",
    });
    expectNoInternalIdentifiers(project);
    expectNoInternalIdentifiers(rule);
    expectNoInternalIdentifiers(provider);
  });

  it("fails closed when a public audit ID has the wrong prefix", () => {
    expect(() =>
      projectAuditResource({
        domain: "workspace.example.com",
        name: "Workspace",
        publicId: "raw_db_project_1",
      }),
    ).toThrow("Expected a v3 public project ID");
  });
});
