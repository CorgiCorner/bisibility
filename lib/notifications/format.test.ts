import { NotificationType } from "@/lib/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { notificationDisplay } from "./format";

const project = {
  domain: "example.com",
  id: "project_1",
  name: "Example",
  publicId: "prj_example",
};

describe("notificationDisplay", () => {
  it("prefixes a stored project-less href with the notification project public id", () => {
    expect(
      notificationDisplay(
        NotificationType.check_complete,
        null,
        { href: "/app/keywords/kw_1" },
        project,
      ).href,
    ).toBe("/app/prj_example/keywords/kw_1");
  });

  it("keeps newly stored project-scoped hrefs unchanged", () => {
    expect(
      notificationDisplay(
        NotificationType.alert_fired,
        null,
        { href: "/app/prj_example/alerts" },
        project,
      ).href,
    ).toBe("/app/prj_example/alerts");
  });

  it("scopes the default href when the payload has no safe href", () => {
    expect(notificationDisplay(NotificationType.import_failed, null, null, project).href).toBe(
      "/app/prj_example/integrations",
    );
  });
});
