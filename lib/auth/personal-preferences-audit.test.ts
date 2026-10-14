import { describe, expect, it } from "vitest";
import { auditPayloadPolicy, hasDeclaredAuditAction } from "./audit-field-declarations";
import { sanitizeDeclaredAuditPayload } from "./audit-payload-policy";

describe("personal presentation audit metadata", () => {
  it.each(["project_surface_preference.set_default", "project_surface_preference.presentation"])(
    "retains revision metadata and omits private view references for %s",
    (action) => {
      expect(hasDeclaredAuditAction(action)).toBe(true);
      expect(
        sanitizeDeclaredAuditPayload(
          {
            surface: "keywords",
            revision: 2,
            operation: "set_default",
            defaultSavedViewPublicId: "viw_private",
            name: "Private customer",
            presentation: { columns: ["position"] },
            config: { search: "Customer query" },
          },
          auditPayloadPolicy(action)?.after,
        ),
      ).toEqual({
        surface: "keywords",
        revision: 2,
        operation: "set_default",
      });
    },
  );

  it("retains view CAS metadata without retaining its filters", () => {
    expect(hasDeclaredAuditAction("saved_view.update")).toBe(true);
    expect(
      sanitizeDeclaredAuditPayload(
        {
          savedViewId: "viw_private",
          surface: "keywords",
          visibility: "private",
          revision: 3,
          config: { search: "Customer query" },
          ownerId: "user_private",
        },
        auditPayloadPolicy("saved_view.update")?.after,
      ),
    ).toEqual({
      savedViewId: "viw_private",
      surface: "keywords",
      visibility: "private",
      revision: 3,
    });
  });
});
