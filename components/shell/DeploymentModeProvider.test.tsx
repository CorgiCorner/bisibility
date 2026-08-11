import AppErrorBoundary from "@/app/app/error";
import { FEEDBACK_URL } from "@/lib/site/site";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DeploymentModeProvider } from "./DeploymentModeProvider";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  withScope: vi.fn((callback: (scope: { setContext: () => void; setTag: () => void }) => void) =>
    callback({ setContext: vi.fn(), setTag: vi.fn() }),
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/prj_abc/keywords?cursor=x",
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const error = Object.assign(new Error("client failure"), { digest: "err_boundary_1" });

function renderBoundary(deploymentMode: "cloud" | "self-host") {
  return render(
    <DeploymentModeProvider deploymentMode={deploymentMode}>
      <AppErrorBoundary error={error} reset={vi.fn()} />
    </DeploymentModeProvider>,
  );
}

function paragraphWith(copy: string) {
  return screen.getByText(
    (_, element) => element?.tagName === "P" && Boolean(element.textContent?.includes(copy)),
  );
}

describe("DeploymentModeProvider around the app error boundary", () => {
  it("fails closed to the hosted support path when the provider is absent", () => {
    render(<AppErrorBoundary error={error} reset={vi.fn()} />);

    expect(paragraphWith("share the error reference with support")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /support/i })).toHaveAttribute("href", FEEDBACK_URL);
    expect(screen.queryByRole("link", { name: /open an issue/i })).not.toBeInTheDocument();
  });

  it("survives the boundary and gives hosted users the private support path", () => {
    renderBoundary("cloud");

    expect(paragraphWith("share the error reference with support")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /support/i })).toHaveAttribute("href", FEEDBACK_URL);
    expect(screen.queryByRole("link", { name: /open an issue/i })).not.toBeInTheDocument();
  });

  it("survives the boundary and keeps the public issue path for self-hosted users", () => {
    renderBoundary("self-host");

    expect(paragraphWith("copy the details and open an issue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open an issue/i })).toHaveAttribute(
      "href",
      "https://github.com/CorgiCorner/bisibility/issues/new",
    );
    expect(screen.queryByRole("link", { name: /^support$/i })).not.toBeInTheDocument();
  });
});
