import { useMarketContext } from "@/components/markets/MarketContextProvider";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listHeaderMarkets: vi.fn(), resolveProjectAccess: vi.fn() }));

vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolveProjectAccess }));
// Stubbed only so this can watch for a caller. The layout must not have one.
vi.mock("@/lib/queries/header-markets", () => ({ listHeaderMarkets: mocks.listHeaderMarkets }));

/**
 * Stands in for the real shell, which is far too much machinery for this question. What matters
 * is its SHAPE: everything it renders around `children` is chrome - the header, the rail, the
 * command palette - and that is where a market switcher goes.
 */
vi.mock("@/app/app/(workspace)/workspace-shell", () => ({
  WorkspaceShell: ({ children, context }: { children: ReactNode; context?: ReactNode }) => (
    <div data-testid="shell">
      <ContextProbe id="chrome" />
      {context}
      {children}
    </div>
  ),
}));

import ProjectLayout from "./layout";

const PROJECT_REF = `prj_${"a".repeat(24)}`;

function ContextProbe({ id }: Readonly<{ id: string }>) {
  const { market, projectRef } = useMarketContext();
  return (
    <span data-testid={id}>
      {projectRef || "no-project"}:{market?.ref ?? "none"}
    </span>
  );
}

async function renderLayout(context: ReactNode = <span data-testid="context-slot" />) {
  render(
    await ProjectLayout({
      children: <ContextProbe id="body" />,
      context,
      params: Promise.resolve({ project: PROJECT_REF }),
    }),
  );
}

describe("project layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProjectAccess.mockResolvedValue({
      isSample: false,
      mode: "member",
      projectId: "project_internal_1",
      publicId: PROJECT_REF,
    });
  });

  it("puts the shell chrome inside the market context, not beside it", async () => {
    await renderLayout();

    // Passed as `children`, the provider wrapped the page body alone and the chrome read the
    // empty default context - so the one place a market switcher belongs could not see the
    // market at all.
    expect(screen.getByTestId("chrome")).toHaveTextContent(`${PROJECT_REF}:none`);
  });

  it("still provides the project level to the page body", async () => {
    await renderLayout();

    expect(screen.getByTestId("body")).toHaveTextContent(`${PROJECT_REF}:none`);
    // A market route nests its own provider inside this one, so the project level must stay
    // market-less rather than guessing from a cookie.
    expect(screen.getByTestId("shell")).toContainElement(screen.getByTestId("body"));
  });

  it("hands the context slot to the shell chrome instead of resolving one itself", async () => {
    // The slot arrives as a parallel route, so the layout is not the thing that decides whether
    // there is a context.
    await renderLayout();

    expect(screen.getByTestId("shell")).toContainElement(screen.getByTestId("context-slot"));
  });

  it("never reads the market list, which most project routes cannot show", async () => {
    // A layout runs for the whole subtree, so a read here is a read on every project route -
    // the market list and its keyword aggregate included. It belongs to the slot's own route.
    await renderLayout();

    expect(mocks.listHeaderMarkets).not.toHaveBeenCalled();
  });

  it("mounts the shell even when the route matched no context slot", async () => {
    // `@context/default.tsx` answers with nothing on every project-scoped route; the chrome
    // still has to render around it.
    await renderLayout(null);

    expect(screen.getByTestId("shell")).toContainElement(screen.getByTestId("body"));
    expect(screen.queryByTestId("context-slot")).toBeNull();
  });
});
