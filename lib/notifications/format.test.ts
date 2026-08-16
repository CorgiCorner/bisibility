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
        { href: "/app/rank-tracker/kw_1" },
        project,
      ).href,
    ).toBe("/app/prj_example/rank-tracker/kw_1");
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

  it("normalizes a stored project-scoped keywords href to rank-tracker", () => {
    expect(
      notificationDisplay(
        NotificationType.check_complete,
        null,
        { href: "/app/prj_example/keywords/kw_x" },
        project,
      ).href,
    ).toBe("/app/prj_example/rank-tracker/kw_x");
  });

  it("normalizes a stored project-less keywords href before project scoping", () => {
    expect(
      notificationDisplay(
        NotificationType.check_complete,
        null,
        { href: "/app/keywords/kw_x" },
        project,
      ).href,
    ).toBe("/app/prj_example/rank-tracker/kw_x");
  });

  it("does not normalize the old keywords list route without a keyword", () => {
    expect(
      notificationDisplay(
        NotificationType.check_complete,
        null,
        { href: "/app/prj_example/keywords" },
        project,
      ).href,
    ).toBe("/app/prj_example/keywords");
  });

  it("does not normalize a nested keywords path like history", () => {
    expect(
      notificationDisplay(
        NotificationType.check_complete,
        null,
        { href: "/app/prj_example/keywords/kw_x/history" },
        project,
      ).href,
    ).toBe("/app/prj_example/keywords/kw_x/history");
  });

  it("preserves a query string suffix when normalizing", () => {
    expect(
      notificationDisplay(
        NotificationType.check_complete,
        null,
        { href: "/app/prj_example/keywords/kw_x?tab=checks" },
        project,
      ).href,
    ).toBe("/app/prj_example/rank-tracker/kw_x?tab=checks");
  });

  it("preserves a fragment suffix when normalizing", () => {
    expect(
      notificationDisplay(
        NotificationType.check_complete,
        null,
        { href: "/app/prj_example/keywords/kw_x#results" },
        project,
      ).href,
    ).toBe("/app/prj_example/rank-tracker/kw_x#results");
  });
});
