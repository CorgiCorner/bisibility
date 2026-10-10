import { AgentReportDetail } from "@/components/agent-reports/AgentReportDetail";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { trackingEvidenceAudit } from "@/lib/ai-tracking/projections/audit-report";
import { agentReportRoute, agentReportsRoute } from "@/lib/api/agent-workspace";
import type { ApiContext } from "@/lib/api/context";
import { dispatchResearchWorkspaceTool } from "@/lib/mcp/research-workspace-tools";
import messages from "@/messages/core/en/agent-workspace.json";
import shared from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { trackingSampleFixtures } from "./fixtures";

const db = vi.hoisted(() => ({ reports: new Map<string, Record<string, unknown>>() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findUniqueOrThrow: async () => ({ id: "project", writeMode: "active" }) },
    agentReport: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: "internal_report", createdAt: new Date("2026-10-08T10:00:00Z") };
        db.reports.set(String(data.publicId), row);
        return row;
      },
      findFirst: async ({ where }: { where: { projectId: string; publicId: string } }) => {
        const row = db.reports.get(where.publicId);
        return row?.projectId === where.projectId ? row : null;
      },
      findMany: async ({ where }: { where: { projectId: string; kind?: string } }) =>
        [...db.reports.values()].filter(
          (row) => row.projectId === where.projectId && (!where.kind || row.kind === where.kind),
        ),
    },
  },
}));
vi.mock("@/lib/provider-lookups/paid-call", () => {
  throw new Error("Evidence reports must not call a provider");
});
vi.mock("@/components/ui/Tooltip", () => import("@/tests/tooltip-stub"));

const projectId = "prj_abcdefghijklmnopqrstuvwx";
function context(method: string, path: string, body?: unknown): ApiContext {
  const url = new URL(`https://example.test/api/v1${path}`);
  return {
    method,
    url,
    req: new Request(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
    path: path.split("/").filter(Boolean),
    headers: new Headers(),
    instance: "fixture",
    actor: { id: "member", memberships: [{ projectId: "project", role: "admin" }] },
    actorId: "member",
    origin: {
      source: "mcp",
      surface: "programmatic",
      credentialId: "key",
      credentialKind: "project_key",
    },
    auth: {
      apiKey: {
        id: "key",
        name: "fixture",
        prefix: "bsb_key_fixture",
        projectId: "project",
        scopes: ["read", "write"],
      },
      project: {
        id: "project",
        publicId: projectId,
        name: "Fixture",
        domain: "acme.dev",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
  };
}
describe("retained evidence saved audit workflow", () => {
  it("dispatches creation, persists, lists, retrieves and renders the real protected report", async () => {
    db.reports.clear();
    const payload = trackingEvidenceAudit({
      runId: "air_oct08",
      samples: trackingSampleFixtures,
      expected: 5,
      hasMore: true,
    });
    const call = dispatchResearchWorkspaceTool("createAgentReport", {
      project_id: projectId,
      ...payload,
    });
    if (!call) throw new Error("Canonical report dispatcher must resolve creation");
    const createdResponse = await agentReportsRoute(
      context(call.method, call.path, call.body),
      projectId,
    );
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    const listed = await (
      await agentReportsRoute(
        context("GET", `/projects/${projectId}/agent-reports?kind=ai_visibility_audit`),
        projectId,
      )
    ).json();
    expect(listed.data).toEqual([
      expect.objectContaining({ id: created.id, kind: "ai_visibility_audit" }),
    ]);
    const response = await agentReportRoute(
      context("GET", `/projects/${projectId}/agent-reports/${created.id}`),
      projectId,
      created.id,
    );
    const saved = await response.json();
    expect(saved.body.limits).toMatchObject({
      complete: false,
      expectedSamples: 5,
      loadedSamples: 3,
    });
    expect(saved.body.proposedNextSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          priority: 1,
          evidenceIds: ["asm_unknown"],
          uncertainty: expect.stringContaining("zero cost"),
        }),
        expect.objectContaining({ priority: 2, evidenceIds: ["asm_answer"] }),
      ]),
    );
    expect(saved.body.proposedExperiment).toMatchObject({
      status: "proposed_unexecuted",
      evidenceIds: ["asm_answer", "asm_absent", "asm_unknown"],
    });
    expect(saved.body.proposedExperiment.metricConditions).toContain(
      "At least 90% complete coverage in both periods",
    );
    expect(saved.provenance.evidenceIds).toEqual(["asm_answer", "asm_absent", "asm_unknown"]);
    expect([...db.reports.values()][0]).toMatchObject({
      projectId: "project",
      createdById: "member",
    });
    render(
      <FeatureMessagesProvider locale="en" messages={{ ...shared, ...messages }} timeZone="UTC">
        <AgentReportDetail
          report={{ ...saved, createdAt: saved.created_at }}
          projectRef={projectId}
          provenanceLabel="Provenance"
        />
      </FeatureMessagesProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(payload.title);
    expect(screen.getAllByText("asm_answer").length).toBeGreaterThan(0);
    expect(
      screen.getByText("This audit contains only a bounded part of the selected run."),
    ).toBeVisible();
    expect(screen.getByText(messages.agentWorkspace.membersOnly)).toBeVisible();
  });
});
