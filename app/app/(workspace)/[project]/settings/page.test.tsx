import { settingsFixtures } from "@/components/settings/settings-fixtures";
import { canProjectAction, canReadProjectAudit } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./page";

const mocks = vi.hoisted(() => ({
  getIngestHooks: vi.fn(),
  getNotificationPreferences: vi.fn(),
  getPreferences: vi.fn(),
  getProjectRole: vi.fn(),
  getQueryActor: vi.fn(),
  getSettings: vi.fn(),
  getTeamAccess: vi.fn(),
  requireSession: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("./actions", () => ({
  deleteWorkspace: vi.fn(),
  submitBillingInterest: vi.fn(),
  updateProject: vi.fn(),
}));
vi.mock("@/lib/agent-ready/origin", () => ({
  absoluteUrl: () => "https://app.example.com/api/ingest/deploy",
  getOriginFromHeaders: () => "https://app.example.com",
}));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: mocks.getProjectRole }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/migration/target-origin", () => ({ configuredMigrationTargetOrigin: () => "" }));
vi.mock("@/lib/queries/_auth", () => ({
  getQueryActor: mocks.getQueryActor,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/lib/queries/account", () => ({ getPreferences: mocks.getPreferences }));
vi.mock("@/lib/queries/ingest-hooks", () => ({ getIngestHooks: mocks.getIngestHooks }));
vi.mock("@/lib/queries/notification-prefs", () => ({
  getNotificationPreferences: mocks.getNotificationPreferences,
}));
vi.mock("@/lib/queries/settings", () => ({ getSettings: mocks.getSettings }));
vi.mock("@/lib/queries/team", () => ({ getTeamAccess: mocks.getTeamAccess }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const publicId = "prj_abcdefghijklmnopqrstuvwx";
const roles = ["viewer", "auditor", "member", "admin", "owner"] satisfies Role[];

const members = [
  {
    color: "accent" as const,
    email: "owner@example.com",
    id: "owner_1",
    initials: "OU",
    name: "Owner User",
    role: "Owner" as const,
    roleValue: "owner" as const,
  },
  {
    color: "blue" as const,
    email: "member@example.com",
    id: "member_1",
    initials: "MU",
    name: "Member User",
    role: "Editor" as const,
    roleValue: "member" as const,
  },
];

function settingsView(overrides: Record<string, unknown> = {}) {
  return {
    apiKeys: [
      {
        createdLabel: "created today",
        expiresLabel: "expires Oct 24, 2026",
        id: "key_1",
        isExpired: false,
        lastUsedLabel: "never used",
        maskedValue: "bsb_key_live_abc123******",
        name: "Production",
      },
    ],
    defaults: { ...settingsFixtures.defaults },
    notifications: { ...settingsFixtures.notifications },
    project: {
      domain: "example.com",
      name: "Example",
      projectId: publicId,
      trackingScope: "country",
      writeMode: "active",
    },
    providers: [...settingsFixtures.providers],
    tags: [...settingsFixtures.tags],
    team: [...settingsFixtures.team],
    usage: { ...settingsFixtures.usage },
    ...overrides,
  };
}

/** Same predicate the page uses: no keywords and no connected provider. */
function emptyWorkspaceView(projectOverrides: Record<string, unknown> = {}) {
  return settingsView({
    defaults: { ...settingsFixtures.defaults, keywordCount: 0 },
    providers: [],
    project: { ...settingsView().project, ...projectOverrides },
  });
}

async function renderSettings(role: Role, view = settingsView()) {
  mocks.getProjectRole.mockReturnValue(role);
  mocks.getSettings.mockResolvedValue(view);
  return render(await SettingsPage({ params: Promise.resolve({ project: publicId }) }));
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProjectAccess.mockResolvedValue({
      mode: "member",
      projectId: "project_1",
      publicId,
    });
    mocks.getPreferences.mockResolvedValue({});
    mocks.getQueryActor.mockResolvedValue({ id: "user_1" });
    mocks.requireSession.mockResolvedValue({ user: { email: "owner@example.com" } });
    mocks.getIngestHooks.mockResolvedValue([]);
    mocks.getNotificationPreferences.mockResolvedValue({
      alertEmail: true,
      alertInApp: true,
      alertSlack: false,
      alertWebhook: false,
      checkEmail: false,
      checkInApp: true,
      email: "owner@example.com",
      emailVerification: "verified",
      importEmail: false,
      importInApp: true,
      inviteEmail: true,
      inviteInApp: true,
      projectId: publicId,
      reportEmail: false,
      slackAvailable: false,
      webhookAvailable: false,
    });
    mocks.getTeamAccess.mockResolvedValue({
      canManageTeam: true,
      canTransferOwnership: true,
      members,
      pendingInvites: [],
    });
  });

  it("renders one settings screen with a single domain field for an empty project", async () => {
    await renderSettings("owner", emptyWorkspaceView({ domain: "" }));

    expect(screen.getByText("This project is empty")).toBeVisible();
    expect(screen.getAllByLabelText("Domain")).toHaveLength(1);
    expect(screen.getByText("Project details")).toBeVisible();
    expect(screen.getByText("API keys")).toBeVisible();
    expect(screen.getByRole("link", { name: "Add keywords" })).toBeVisible();
  });

  it("renders one settings screen with a single domain field for a populated project", async () => {
    await renderSettings("owner");

    expect(screen.queryByText("This project is empty")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Domain")).toHaveLength(1);
    expect(screen.getByLabelText("Domain")).toHaveValue("example.com");
  });

  it("does not present a generated instance host as an entered domain", async () => {
    await renderSettings(
      "owner",
      emptyWorkspaceView({ domain: "workspace-8abefb1f.bisibility.cloud" }),
    );

    expect(screen.getByLabelText("Domain")).toHaveValue("");
    expect(screen.queryByText(/workspace-8abefb1f\.bisibility\.cloud/)).toBeNull();
    expect(screen.getByText(/Set the domain below/)).toBeVisible();
  });

  it.each(roles)("gates audit navigation for the %s role", async (role) => {
    await renderSettings(role);

    expect(Boolean(screen.queryByRole("link", { name: /audit log/i }))).toBe(
      canReadProjectAudit(role),
    );
  });

  it.each(roles)("gates API key actions for the %s role", async (role) => {
    const canManage = canProjectAction(role, "manage", "project");
    expect(canManage).toBe(canProjectAction(role, "delete", "api_key"));

    await renderSettings(role);

    expect(Boolean(screen.queryByRole("button", { name: "Create key" }))).toBe(canManage);
    expect(Boolean(screen.queryByRole("button", { name: "Roll Production key" }))).toBe(canManage);
    expect(Boolean(screen.queryByRole("button", { name: "Revoke Production key" }))).toBe(
      canManage,
    );
  });

  it.each(roles)("gates owner-only sections for the %s role", async (role) => {
    await renderSettings(role);

    expect(Boolean(screen.queryByText("Usage & billing"))).toBe(
      canProjectAction(role, "manage", "billing"),
    );
    expect(
      Boolean(screen.queryByRole("button", { name: "Transfer ownership to Member User" })),
    ).toBe(canProjectAction(role, "manage", "ownership"));
    expect(Boolean(screen.queryByText("Danger zone"))).toBe(
      canProjectAction(role, "delete", "project"),
    );
  });

  it.each(roles)("gates project detail editing for the %s role", async (role) => {
    await renderSettings(role);

    expect(screen.getByLabelText("Project name")).toHaveProperty(
      "disabled",
      !canProjectAction(role, "update", "project"),
    );
    expect(screen.getByLabelText("Domain")).toHaveProperty(
      "disabled",
      !canProjectAction(role, "update", "project"),
    );
  });

  it("hides admin and owner controls from a read-only role on an empty project", async () => {
    await renderSettings("viewer", emptyWorkspaceView());

    expect(screen.getByText("API keys")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create key" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite member" })).not.toBeInTheDocument();
    expect(screen.queryByText("Danger zone")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /audit log/i })).not.toBeInTheDocument();
  });

  it("keeps the project delete flow for an owner on an empty project", async () => {
    await renderSettings("owner", emptyWorkspaceView());

    expect(
      screen.getByText("Delete this project and all tracked keywords. This cannot be undone."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete project" })).toBeVisible();
  });

  it("keeps the migration entry point available on an empty project", async () => {
    await renderSettings("owner", emptyWorkspaceView());

    expect(screen.getByRole("button", { name: /Transfer project/i })).toBeVisible();
  });
});
