import auditMessages from "@/messages/core/en/project-audit.json";
import advancedMessages from "@/messages/core/en/project-settings-advanced.json";
import { describe, expect, it } from "vitest";
import { auditEventMessageKeyFor } from "./event-presentation";

const auditEvents: Record<string, string> = auditMessages.projectAudit.presentation.event;
const advancedEvents: Record<string, string> = advancedMessages.projectSettingsAdvanced.audit.event;

describe("auditEventMessageKeyFor", () => {
  // Sign-in is the most frequent entry in the log. Without a label the row fell through to the
  // generic fallback and showed the raw machine action id to the reader.
  it("labels the sign-in action instead of falling back to the raw action id", () => {
    const key = auditEventMessageKeyFor("auth.sign_in");

    expect(key).toBe("signedIn");
    expect(auditEvents[key ?? ""]).toBeTypeOf("string");
    expect(advancedEvents[key ?? ""]).toBeTypeOf("string");
  });

  it("keeps the fallback for an action the catalog does not name", () => {
    expect(auditEventMessageKeyFor("totally.unmapped")).toBeNull();
  });
});
