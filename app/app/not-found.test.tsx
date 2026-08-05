import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));

async function render() {
  const { default: AppNotFound } = await import("./not-found");
  return renderToStaticMarkup(await AppNotFound());
}

beforeEach(() => {
  vi.resetModules();
  mocks.getSession.mockResolvedValue({ user: { email: "member@example.com", id: "usr_1" } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("app not found", () => {
  it("uses a neutral title for every app 404", async () => {
    expect(await render()).toContain("This page is not available");

    mocks.getSession.mockResolvedValue(null);

    expect(await render()).toContain("This page is not available");
  });

  it("names the signed-in account", async () => {
    expect(await render()).toContain("member@example.com");
  });

  it("offers a way back to the workspace", async () => {
    expect(await render()).toContain('href="/app"');
  });

  it("offers an explicit account switch", async () => {
    expect(await render()).toContain("/login?switch=1");
  });

  it("does not claim an identity it cannot read", async () => {
    mocks.getSession.mockResolvedValue(null);
    const html = await render();
    expect(html).not.toContain("Signed in as");
    expect(html).toContain('href="/app"');
  });
});
