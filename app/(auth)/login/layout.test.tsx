import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  firstRunGate: vi.fn(),
}));

vi.mock("@/lib/auth/first-run", () => ({
  redirectToSetupIfFirstRun: mocks.firstRunGate,
}));
vi.mock("@/lib/seo/jsonld", () => ({ loginMetadata: {} }));

import LoginLayout from "./layout";

describe("login first-run gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.firstRunGate.mockResolvedValue(undefined);
  });

  it("redirects login to setup while the installation is empty", async () => {
    mocks.firstRunGate.mockRejectedValue(new Error("NEXT_REDIRECT:/setup"));

    await expect(LoginLayout({ children: <div>Login</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/setup",
    );
  });

  it("renders normal login after setup", async () => {
    await expect(LoginLayout({ children: <div>Login</div> })).resolves.toEqual(<div>Login</div>);
  });
});
