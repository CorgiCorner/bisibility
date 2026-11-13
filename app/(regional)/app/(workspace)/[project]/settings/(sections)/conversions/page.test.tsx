import {
  setPrimaryConversionSource,
  syncConversionSource,
  updateConversionGoal,
} from "@/lib/actions/conversions";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serverActions = [setPrimaryConversionSource, syncConversionSource, updateConversionGoal];

function isServerActionReference(fn: unknown): boolean {
  if (typeof fn !== "function") return false;
  if (serverActions.some((action) => action === fn)) return true;
  const boundName = fn.name.startsWith("bound ") ? fn.name.slice("bound ".length) : "";
  return serverActions.some((action) => action.name === boundName);
}

const mocks = vi.hoisted(() => ({
  canProjectAction: vi.fn(),
  getConversionsSettings: vi.fn(),
  getProjectRole: vi.fn(),
  loadCoreMessages: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
  sectionProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@/components/settings/shell/SettingsShell", () => ({
  SettingsShell: ({ children, projectRef }: { children: ReactNode; projectRef: string }) => (
    <main data-project-ref={projectRef}>{children}</main>
  ),
}));
vi.mock("@/components/settings/conversions/ConversionsSettings", () => ({
  ConversionsSettings: (props: { canEdit: boolean }) => {
    mocks.sectionProps = props;
    return <div data-can-edit={props.canEdit} />;
  },
}));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: mocks.getProjectRole }));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: mocks.canProjectAction }));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("@/lib/conversions/queries", () => ({
  getConversionsSettings: mocks.getConversionsSettings,
}));

import ConversionsSettingsPage from "@/app/(regional)/app/(workspace)/[project]/settings/(sections)/conversions/page";

function projectAccess(role: string, writeMode = "active") {
  return {
    actor: { memberships: [{ projectId: "project_1", role }] },
    project: { id: "project_1", publicId: "prj_resolved", writeMode },
  };
}

describe("ConversionsSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canProjectAction.mockImplementation(
      (role: string | null, action: string) =>
        role === "admin" || (role === "member" && action === "update"),
    );
    mocks.getProjectRole.mockImplementation(
      (actor: { memberships: { projectId: string; role: string }[] }, projectId: string) =>
        actor.memberships.find((membership) => membership.projectId === projectId)?.role ?? null,
    );
    mocks.getConversionsSettings.mockResolvedValue({ goals: [], sources: [] });
    mocks.requireReadableProject.mockResolvedValue(projectAccess("member"));
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    mocks.loadCoreMessages.mockResolvedValue({});
  });

  it("loads the conversions catalog for a member who can update defaults", async () => {
    render(
      await ConversionsSettingsPage({ params: Promise.resolve({ project: "prj_untrusted" }) }),
    );
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_untrusted");
    expect(mocks.getConversionsSettings).toHaveBeenCalledWith("project_1");
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", [
      "shared",
      "projectSettingsShell",
      "projectSettingsConversions",
    ]);
    expect(document.querySelector("[data-can-edit]")).toHaveAttribute("data-can-edit", "true");
  });

  it("keeps a viewer from changing conversions", async () => {
    mocks.requireReadableProject.mockResolvedValue(projectAccess("viewer"));
    render(await ConversionsSettingsPage({ params: Promise.resolve({ project: "prj_resolved" }) }));
    expect(document.querySelector("[data-can-edit]")).toHaveAttribute("data-can-edit", "false");
  });

  it.each(["migration_hold", "migrated"])(
    "keeps conversions read-only while the project is %s",
    async (writeMode) => {
      mocks.requireReadableProject.mockResolvedValue(projectAccess("admin", writeMode));
      render(
        await ConversionsSettingsPage({ params: Promise.resolve({ project: "prj_resolved" }) }),
      );
      expect(document.querySelector("[data-can-edit]")).toHaveAttribute("data-can-edit", "false");
    },
  );

  it("passes server action references to the client screen", async () => {
    render(await ConversionsSettingsPage({ params: Promise.resolve({ project: "prj_resolved" }) }));
    const props: Record<string, unknown> = mocks.sectionProps ?? {};
    const functions = Object.entries(props).flatMap(([key, value]) => {
      if (typeof value === "function") return [[key, value] as const];
      if (!value || typeof value !== "object") return [];
      return Object.entries(value).flatMap(([child, nested]) =>
        typeof nested === "function" ? ([[`${key}.${child}`, nested]] as const) : [],
      );
    });
    expect(functions.map(([path]) => path).sort()).toEqual([
      "actions.setPrimary",
      "actions.syncSource",
      "actions.updateGoal",
    ]);
    expect(
      functions.filter(([, fn]) => !isServerActionReference(fn)).map(([path]) => path),
    ).toEqual([]);
  });
});
