import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { presentRecentAuditEntry } from "@/components/settings/advanced/recent-audit-presentation";
import type { AuditEntry } from "@/lib/queries/audit";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { presentAuditEntry } from "./audit-presentation";

const entry: AuditEntry = {
  action: "provider.credential_source_changed",
  providerSourceChange: { provider: "DataForSEO", source: "hosted" },
  actor: { id: "system", initials: "U", name: null, email: "" },
  id: "audit_example",
  timestamp: "2026-10-20T12:00:00Z",
  eventType: "system",
  diff: [],
  operation: "UPDATE",
  status: "success",
  resource: { id: null, type: "provider", name: null },
  source: { channel: "api", ip: null },
  metadata: {
    event_id: "audit_example",
    app_version: null,
    correlation_id: null,
    user_agent: null,
  },
};

describe("localized audit event presentation", () => {
  it.each([
    ["en", "Provider source changed: DataForSEO → credits"],
    ["pl", "Zmieniono źródło dostawcy: DataForSEO → kredyty"],
    ["es-ES", "Origen del proveedor cambiado: DataForSEO → créditos"],
    ["ja", "プロバイダーのソースを変更しました: DataForSEO → クレジット"],
  ] as const)("renders source changes in both %s views", (locale, expected) => {
    const directory = resolve(import.meta.dirname, "../../messages/core", locale);
    const audit = JSON.parse(readFileSync(resolve(directory, "project-audit.json"), "utf8"));
    const advanced = JSON.parse(
      readFileSync(resolve(directory, "project-settings-advanced.json"), "utf8"),
    );
    const dateDisplay = { dateFormat: "day_first" as const, locale, timeZone: "UTC" };
    const t = createTranslator({ locale, messages: audit, namespace: "projectAudit.presentation" });
    const recentT = createTranslator({
      locale,
      messages: advanced,
      namespace: "projectSettingsAdvanced.audit",
    });
    expect(presentAuditEntry(entry, dateDisplay, t).eventName).toBe(expected);
    expect(presentRecentAuditEntry(entry, dateDisplay, recentT).eventName).toBe(expected);
    const own = {
      ...entry,
      providerSourceChange: { provider: "DataForSEO", source: "own" as const },
    };
    expect(presentAuditEntry(own, dateDisplay, t).eventName).not.toBe(expected);
    expect(presentAuditEntry(own, dateDisplay, t).eventName).toBe(
      presentRecentAuditEntry(own, dateDisplay, recentT).eventName,
    );
  });

  it("keeps unknown action codes out of the headline and localizes a system actor", () => {
    const messages = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, "../../messages/core/en/project-audit.json"),
        "utf8",
      ),
    );
    const t = createTranslator({ locale: "en", messages, namespace: "projectAudit.presentation" });
    const presented = presentAuditEntry(
      { ...entry, action: "future.action", providerSourceChange: undefined },
      { dateFormat: "day_first", locale: "en", timeZone: "UTC" },
      t,
    );
    expect(presented.eventName).toBe("Other activity");
    expect(presented.action).toBe("future.action");
    expect(presented.actor.name).toBe("System");
  });
});
