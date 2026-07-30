import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  firstRunGate: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@/components/ui", () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => <div data-toast-root>{children}</div>,
}));
vi.mock("@/lib/auth/first-run", () => ({
  redirectToSetupIfFirstRun: mocks.firstRunGate,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/seo/noindex", () => ({ createNoindexMetadata: () => ({}) }));

import AppLayout from "./layout";

describe("shared app layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.firstRunGate.mockResolvedValue(undefined);
    mocks.requireSession.mockResolvedValue({ user: { id: "admin_1" } });
  });

  it("enforces authentication after checking first-run setup", async () => {
    mocks.requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(AppLayout({ children: <div>Hidden</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
    expect(mocks.firstRunGate).toHaveBeenCalledOnce();
  });

  it("sends every app visitor to setup while the installation is empty", async () => {
    mocks.firstRunGate.mockRejectedValue(new Error("NEXT_REDIRECT:/setup"));

    await expect(AppLayout({ children: <div>Hidden</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/setup",
    );

    expect(mocks.requireSession).not.toHaveBeenCalled();
  });

  it("keeps one stable wrapper for both admin and workspace route groups", async () => {
    const result = await AppLayout({ children: <div>Nested route layout</div> });
    const markup = renderToStaticMarkup(result);

    expect(markup).toContain("data-toast-root");
    expect(markup).toContain("Nested route layout");
    expect(markup).not.toContain("data-shell-root");
  });
});
