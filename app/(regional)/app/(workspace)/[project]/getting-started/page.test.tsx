import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import projectGettingStartedMessages from "@/messages/core/en/project-getting-started.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadSetupAcknowledgedAt: vi.fn(),
  loadSetupContext: vi.fn(),
  querySession: vi.fn(),
  getCheckHealth: vi.fn(),
  getKeywordRows: vi.fn(),
  headerProgressProps: vi.fn(),
  loadCoreMessages: vi.fn(),
  pageContentProps: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
  resolveSetupProgress: vi.fn(),
}));

vi.mock("@/components/getting-started/GettingStartedHeaderProgress", () => ({
  GettingStartedHeaderProgress: (props: { completionMode: string }) => {
    mocks.headerProgressProps(props);
    return <div data-header-mode={props.completionMode}>header</div>;
  },
}));
vi.mock("@/components/getting-started/GettingStartedFirstCheckController", () => ({
  GettingStartedFirstCheckController: () => <div data-testid="checklist">checklist</div>,
}));
vi.mock("@/components/getting-started/GettingStartedCompletion", () => ({
  GettingStartedCompletion: (props: { acknowledged: boolean }) => (
    <div data-acknowledged={props.acknowledged}>completion</div>
  ),
}));
vi.mock("@/components/getting-started/GoFurtherCards", () => ({
  GoFurtherCards: () => <div>go further</div>,
}));
vi.mock("@/components/shell/PageContent", () => ({
  PageContent: ({
    children,
    ...props
  }: {
    children: ReactNode;
    className?: string;
    variant?: string;
  }) => {
    mocks.pageContentProps(props);
    return <main>{children}</main>;
  },
}));
vi.mock("@/lib/getting-started/setup-acknowledgement", () => ({
  isSetupAcknowledgedAt: (value: Date | null | undefined) => value != null,
  loadSetupAcknowledgedAt: mocks.loadSetupAcknowledgedAt,
}));
vi.mock("@/lib/getting-started/setup-steps", () => ({
  resolveSetupProgress: mocks.resolveSetupProgress,
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/lib/queries/_auth", () => ({ getQuerySession: mocks.querySession }));
vi.mock("@/lib/queries/check-health", () => ({ getCheckHealth: mocks.getCheckHealth }));
vi.mock("@/lib/queries/keywords", () => ({ getKeywordRows: mocks.getKeywordRows }));
vi.mock("@/lib/queries/setup-context", () => ({ loadSetupContext: mocks.loadSetupContext }));

import GettingStartedPage from "./page";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";
const context = { project: { publicRef: projectRef } };

/** Every function reachable from a client island's props, which RSC cannot serialize. */
function functionPaths(value: unknown, path = "props"): string[] {
  if (typeof value === "function") return [path];
  if (Array.isArray(value))
    return value.flatMap((item, index) => functionPaths(item, `${path}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => functionPaths(item, `${path}.${key}`));
  }
  return [];
}

describe("getting started route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadSetupAcknowledgedAt.mockResolvedValue(null);
    mocks.loadCoreMessages.mockResolvedValue(
      mergeMessageCatalogs(sharedMessages, projectGettingStartedMessages),
    );
    mocks.querySession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    mocks.loadSetupContext.mockResolvedValue(context);
    mocks.getCheckHealth.mockResolvedValue({
      providerRate: { overrideCents: 1, providerId: null },
    });
    mocks.getKeywordRows.mockResolvedValue([]);
    mocks.resolveSetupProgress.mockReturnValue({
      completed: true,
      doneCount: 4,
      settledCount: 4,
      steps: [],
      totalCount: 4,
    });
  });

  // A resolved step carries its definition, and a definition carries `resolve(ctx)`. Handing the
  // whole progress object to the client island made RSC refuse the payload and the route render
  // the error boundary instead of the checklist.
  it("hands the client progress island only serializable values", async () => {
    mocks.resolveSetupProgress.mockReturnValue({
      completed: false,
      doneCount: 1,
      settledCount: 2,
      steps: [
        {
          definition: {
            id: "create_project",
            resolve: () => ({ family: "done" }),
            videoRef: "create-project",
          },
          state: { family: "done" },
        },
      ],
      totalCount: 5,
    });

    renderToStaticMarkup(
      await GettingStartedPage({ params: Promise.resolve({ project: projectRef }) }),
    );

    const [props] = mocks.headerProgressProps.mock.calls[0] as [Record<string, unknown>];
    expect(props.progress).toEqual({ completed: false, settledCount: 2, totalCount: 5 });
    expect(functionPaths(props)).toEqual([]);
  });

  it("loads and resolves the authoritative setup context once", async () => {
    const result = await GettingStartedPage({ params: Promise.resolve({ project: projectRef }) });
    const markup = renderToStaticMarkup(result);
    expect(mocks.loadSetupContext).toHaveBeenCalledOnce();
    expect(mocks.loadSetupContext).toHaveBeenCalledWith(projectRef);
    expect(mocks.resolveSetupProgress).toHaveBeenCalledOnce();
    expect(mocks.resolveSetupProgress).toHaveBeenCalledWith(context);
    expect(mocks.loadSetupAcknowledgedAt).toHaveBeenCalledWith("user-1", projectRef);
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", [
      "shared",
      "projectMarkets",
      "projectGettingStarted",
      "projectRankTracker",
      "projectRuns",
    ]);
    expect(mocks.loadCoreMessages).toHaveBeenCalledOnce();
    expect(markup).toContain("go further");
  });

  it("uses the constrained content width", async () => {
    const result = await GettingStartedPage({ params: Promise.resolve({ project: projectRef }) });
    renderToStaticMarkup(result);
    expect(mocks.pageContentProps).toHaveBeenCalledWith({
      className: "grid gap-5",
      variant: "constrained",
    });
  });

  it("keeps completed state A across a second render without acknowledgement", async () => {
    const first = await GettingStartedPage({ params: Promise.resolve({ project: projectRef }) });
    const second = await GettingStartedPage({ params: Promise.resolve({ project: projectRef }) });
    expect(renderToStaticMarkup(first)).toContain('data-acknowledged="false"');
    expect(renderToStaticMarkup(second)).toContain('data-acknowledged="false"');
  });

  it("renders state B after acknowledgement is stored on the membership row", async () => {
    mocks.loadSetupAcknowledgedAt.mockResolvedValue(new Date("2026-09-01T00:00:00.000Z"));
    const result = await GettingStartedPage({ params: Promise.resolve({ project: projectRef }) });
    const markup = renderToStaticMarkup(result);
    expect(markup).toContain('data-acknowledged="true"');
    expect(markup).toContain('data-header-mode="state-b"');
  });

  it("renders the checklist before completion and hides go further cards", async () => {
    mocks.resolveSetupProgress.mockReturnValue({
      completed: false,
      doneCount: 3,
      settledCount: 3,
      steps: [],
      totalCount: 4,
    });
    const result = await GettingStartedPage({ params: Promise.resolve({ project: projectRef }) });
    const markup = renderToStaticMarkup(result);
    expect(markup).toContain("checklist");
    expect(markup).not.toContain("completion");
    expect(markup).not.toContain("go further");
  });
});
