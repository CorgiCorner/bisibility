import ProjectContextRouteLayout from "@/app/(regional)/app/(workspace)/[project]/context/layout";
import ProjectContextPage from "@/app/(regional)/app/(workspace)/[project]/context/page";
import { AgentWorkspaceLoading } from "@/components/agent-reports/AgentWorkspaceLoading";
import { PageContent } from "@/components/shell/PageContent";
import { emptyProjectContext } from "@/lib/project-context/model";
import messages from "@/messages/core/en/agent-workspace.json";
import shared from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import AgentReportLoading from "./[reportId]/loading";
import AgentReportsRouteLayout from "./layout";
import AgentReportsPage from "./page";

const mocks = vi.hoisted(() => ({ reports: vi.fn(), context: vi.fn(), permissions: vi.fn() }));
const project = "prj_abcdefghijklmnopqrstuvwx";
const params = Promise.resolve({ project });
vi.mock("@/lib/queries/_auth", () => ({
  resolveProjectAccess: async () => ({ publicId: "prj_abcdefghijklmnopqrstuvwx" }),
}));
vi.mock("@/lib/queries/agent-workspace", () => ({
  getAgentWorkspacePermissions: mocks.permissions,
  getAgentReportsPage: mocks.reports,
  getProjectContextPage: mocks.context,
}));
vi.mock("@/lib/actions/agent-workspace", () => ({
  saveManualAgentReportAction: vi.fn(),
  saveProjectContextAction: vi.fn(),
}));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: async () => ({ locale: "en", timeZone: "UTC" }),
}));
vi.mock("@/i18n/catalog-loader.server", () => ({
  loadCoreMessages: async () => ({ ...shared, ...messages }),
}));

beforeEach(() => {
  mocks.permissions.mockResolvedValue({ canCreate: true, canEdit: true });
  mocks.reports.mockResolvedValue({ reports: [], canCreate: true });
  mocks.context.mockResolvedValue({ context: emptyProjectContext, canEdit: true });
});

it.each(["empty", "populated", "loading"])(
  "uses the older list-page container for %s reports",
  async (state) => {
    if (state === "populated")
      mocks.reports.mockResolvedValue({
        canCreate: true,
        reports: [
          {
            id: "agr_abcdefghijklmnopqrstuvwx",
            kind: "manual_analysis",
            title: "Content opportunities",
            createdAt: "2026-10-02T12:00:00.000Z",
          },
        ],
      });
    const reference = render(<PageContent />).container.firstElementChild?.className;
    if (!reference) throw new Error("List-page container is missing");
    const view = render(
      state === "loading" ? await AgentWorkspaceLoading({}) : await AgentReportsPage({ params }),
    );
    const root = view.container.firstElementChild;
    for (const className of reference.split(" ")) expect(root).toHaveClass(className);
    expect(root).toHaveClass("gap-5");
    expect(root).not.toHaveClass("p-4", "m-4", "max-w-[1040px]");
    if (state === "loading") expect(root).toHaveAttribute("aria-busy", "true");
  },
);

it("preserves the Reports read-only affordance", async () => {
  mocks.reports.mockResolvedValue({ reports: [], canCreate: false });
  render(await AgentReportsPage({ params }));
  expect(screen.getByRole("heading", { name: "No saved analyses yet" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save an analysis" })).not.toBeInTheDocument();
});

it("keeps the context loader in the same form container and field structure", async () => {
  const settled = render(await ProjectContextPage({ params }));
  const formClasses = settled.container.firstElementChild?.className;
  const labels = [...settled.container.querySelectorAll("label")].map((label) => label.textContent);
  const loading = render(await AgentWorkspaceLoading({ view: "context" }));
  expect(loading.container.firstElementChild?.className).toBe(formClasses);
  expect(
    [...loading.container.querySelectorAll("label")].map((label) => label.textContent),
  ).toEqual(labels);
  expect(loading.container.querySelectorAll("textarea:disabled")).toHaveLength(5);
  expect(loading.container.firstElementChild).toHaveAttribute("aria-busy", "true");
  expect(loading.container.querySelector('[data-slot="card"]')).toHaveClass("p-5");
});

it.each([
  ["reports", AgentReportsRouteLayout, "reports"],
  ["context", ProjectContextRouteLayout, "context"],
] as const)(
  "passes project permissions through the actual %s route layout",
  async (_name, Layout, view) => {
    mocks.permissions.mockResolvedValue({ canCreate: false, canEdit: false });
    const children = await AgentWorkspaceLoading({ view });
    const loading = render(await Layout({ children, params }));
    expect(mocks.permissions).toHaveBeenCalledWith(project);
    expect(loading.container.querySelectorAll("button")).toHaveLength(0);
    if (view === "context")
      expect(loading.container.querySelectorAll("textarea:disabled")).toHaveLength(5);
  },
);

it("preserves the original constrained detail fallback", () => {
  const detail = render(<AgentReportLoading />);
  expect(detail.container.firstElementChild).toHaveClass("max-w-[1040px]");
  expect(detail.container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
  expect(detail.container.querySelectorAll(".h-20")).toHaveLength(3);
  expect(detail.container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
});
