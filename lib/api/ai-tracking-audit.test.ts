import { registerAiTrackingAuditDeclarations } from "@/lib/auth/audit-field-declarations-ai-tracking";
import { beforeEach, describe, expect, it, vi } from "vitest";

const writeAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/audit", () => ({ writeAudit }));

import {
  auditTrackingAcceptance,
  auditTrackingCatalog,
  auditTrackingEngine,
  auditTrackingGeneration,
  auditTrackingRun,
} from "./ai-tracking-audit";

const actor = { id: "user" };
const project = { id: "internal", publicId: "prj_public" };
beforeEach(() => writeAudit.mockClear());
describe("tracking append-only audit", () => {
  it("covers every declared lifecycle through the audit port", async () => {
    const declared = new Set<string>();
    registerAiTrackingAuditDeclarations((actions) => {
      for (const action of actions) declared.add(action);
    });
    for (const resource of ["topics", "prompts", "schedules"] as const) {
      for (const method of ["POST", "PATCH", "DELETE"]) {
        await auditTrackingCatalog(actor, project, resource, method, {}, { publicId: "public" });
      }
      if (resource !== "schedules") {
        for (const paused of [true, false])
          await auditTrackingCatalog(
            actor,
            project,
            resource,
            "PATCH",
            { paused },
            {
              publicId: "public",
            },
          );
      }
    }
    for (const enabled of [true, false])
      await auditTrackingCatalog(
        actor,
        project,
        "schedules",
        "PATCH",
        {
          enabled,
          consent: true,
        },
        { publicId: "public" },
      );
    for (const operation of ["launch", "cancel", "retry"] as const)
      await auditTrackingRun(actor, project, operation, { publicId: "public" });
    await auditTrackingAcceptance(actor, project, 2);
    await auditTrackingGeneration(actor, project, "asg_public");
    for (const enabled of [true, false]) {
      await auditTrackingEngine(
        actor,
        project,
        { enabled, engine: "gemini", source: "consumer_scrape" },
        enabled ? null : { enabled: true, engine: "gemini", source: "consumer_scrape" },
      );
    }
    expect(new Set(writeAudit.mock.calls.map(([entry]) => entry.action))).toEqual(declared);
    expect(declared.size).toBe(25);
  });
  it("records an engine choice by engine and source, never a database id", async () => {
    await auditTrackingEngine(
      actor,
      project,
      { enabled: false, engine: "chat_gpt", source: "model_api" },
      { enabled: true, engine: "chat_gpt", source: "model_api" },
    );
    expect(writeAudit).toHaveBeenLastCalledWith({
      action: "ai_tracking.engine.disable",
      actorId: "user",
      after: { enabled: false, engine: "chat_gpt", source: "model_api" },
      before: { enabled: true, engine: "chat_gpt", source: "model_api" },
      projectId: "internal",
      targetId: "chat_gpt:model_api",
      targetType: "ai_project_engine",
    });
  });
  it("records scoped lifecycle without prompttext or raw credentials", async () => {
    await auditTrackingCatalog(
      actor,
      project,
      "prompts",
      "PATCH",
      { paused: true, text: "secret text", credentials: "secret" },
      { publicId: "aip_public" },
    );
    expect(writeAudit).toHaveBeenLastCalledWith({
      action: "ai_tracking.prompt.pause",
      actorId: "user",
      projectId: "internal",
      targetType: "project",
      targetId: "prj_public",
      after: { resourceId: "aip_public" },
    });
  });
  it("records explicit schedule and run approvals", async () => {
    await auditTrackingCatalog(
      actor,
      project,
      "schedules",
      "PATCH",
      { enabled: true, consent: true },
      { publicId: "ais_public" },
    );
    expect(writeAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "ai_tracking.schedule.consent",
        after: { resourceId: "ais_public", consent: true },
      }),
    );
    await auditTrackingRun(actor, project, "retry", { publicId: "air_public" });
    expect(writeAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "ai_tracking.run.consent",
        after: { resourceId: "air_public", consent: true },
      }),
    );
  });
  it("records acceptance counts without submitted draft contents", async () => {
    await auditTrackingAcceptance(actor, project, 3);
    expect(writeAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "ai_tracking.suggestions.accept", after: { count: 3 } }),
    );
  });
  it("awaits the durable audit port and surfaces a write failure", async () => {
    writeAudit.mockRejectedValueOnce(new Error("Audit persistence failed"));
    await expect(
      auditTrackingRun(actor, project, "cancel", { publicId: "air_public" }),
    ).rejects.toThrow("Audit persistence failed");
  });
});
