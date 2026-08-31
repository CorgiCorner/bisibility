import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  loadSetupContext: vi.fn(),
  querySession: vi.fn(),
  getCheckHealth: vi.fn(),
  getKeywordRows: vi.fn(),
  resolveSetupProgress: vi.fn(),
}));

vi.mock("@/components/getting-started/GettingStartedHeaderProgress", () => ({
  GettingStartedHeaderProgress: (props: { completionMode: string }) => (
    <div data-header-mode={props.completionMode}>header</div>
  ),
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
  PageContent: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/getting-started/setup-steps", () => ({
  resolveSetupProgress: mocks.resolveSetupProgress,
}));
vi.mock("@/lib/queries/_auth", () => ({ getQuerySession: mocks.querySession }));
vi.mock("@/lib/queries/check-health", () => ({ getCheckHealth: mocks.getCheckHealth }));
vi.mock("@/lib/queries/keywords", () => ({ getKeywordRows: mocks.getKeywordRows }));
vi.mock("@/lib/queries/setup-context", () => ({ loadSetupContext: mocks.loadSetupContext }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => mocks.cookieValue && { value: mocks.cookieValue } }),
}));

import GettingStartedPage from "./page";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";
const context = { project: { publicRef: projectRef } };

describe("getting started route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValue = undefined;
    mocks.querySession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.loadSetupContext.mockResolvedValue(context);
    mocks.getCheckHealth.mockResolvedValue({
      providerRate: { overrideCents: 1, providerId: null },
    });
    mocks.getKeywordRows.mockResolvedValue([]);
    mocks.resolveSetupProgress.mockReturnValue({ doneCount: 4, steps: [], totalCount: 4 });
  });

  it("loads and resolves the authoritative setup context once", async () => {
    const result = await GettingStartedPage({ params: Promise.resolve({ project: projectRef }) });
    const markup = renderToStaticMarkup(result);
    expect(mocks.loadSetupContext).toHaveBeenCalledOnce();
    expect(mocks.loadSetupContext).toHaveBeenCalledWith(projectRef);
    expect(mocks.resolveSetupProgress).toHaveBeenCalledOnce();
    expect(mocks.resolveSetupProgress).toHaveBeenCalledWith(context);
    expect(markup).toContain("go further");
  });

  it("keeps completed state A across a second render without acknowledgement", async () => {
    const first = await GettingStartedPage({ params: Promise.resolve({ project: projectRef }) });
    const second = await GettingStartedPage({ params: Promise.resolve({ project: projectRef }) });
    expect(renderToStaticMarkup(first)).toContain('data-acknowledged="false"');
    expect(renderToStaticMarkup(second)).toContain('data-acknowledged="false"');
  });

  it("renders state B after the acknowledgement cookie is present", async () => {
    const { addSetupAcknowledgement, serializeSetupAcknowledgements } = await import(
      "@/lib/getting-started/setup-acknowledgement"
    );
    mocks.cookieValue = serializeSetupAcknowledgements(
      addSetupAcknowledgement([], "user-1", projectRef),
    );
    const result = await GettingStartedPage({ params: Promise.resolve({ project: projectRef }) });
    const markup = renderToStaticMarkup(result);
    expect(markup).toContain('data-acknowledged="true"');
    expect(markup).toContain('data-header-mode="state-b"');
  });

  it("renders the checklist before completion", async () => {
    mocks.resolveSetupProgress.mockReturnValue({ doneCount: 3, steps: [], totalCount: 4 });
    const result = await GettingStartedPage({ params: Promise.resolve({ project: projectRef }) });
    const markup = renderToStaticMarkup(result);
    expect(markup).toContain("checklist");
    expect(markup).not.toContain("completion");
  });
});
