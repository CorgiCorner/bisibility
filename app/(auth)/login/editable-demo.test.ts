import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGitHubStars: vi.fn(),
  getSession: vi.fn(),
  isEmailConfigured: vi.fn(),
  isFirstRun: vi.fn(),
  loginForm: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/deployment/runtime-env.generated", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/auth/first-run", () => ({ isFirstRun: mocks.isFirstRun }));
vi.mock("@/lib/email/registry", () => ({ isEmailConfigured: mocks.isEmailConfigured }));
vi.mock("@/lib/site/github-stars", () => ({ getGitHubStars: mocks.getGitHubStars }));
vi.mock("@/components/auth/LoginForm", () => ({
  LoginForm: (props: Record<string, unknown>) => {
    mocks.loginForm(props);
    return null;
  },
}));

const editableDemo = {
  DEMO_MODE: "editable",
  DEMO_OWNER_ID: "usr_zyxwvutsrqponmlkjihgfedc",
  DEMO_PROJECT_ID: "prj_abcdefghijklmnopqrstuvwx",
  DEMO_USER_ID: "usr_abcdefghijklmnopqrstuvwx",
};

const legacyDemo = {
  DEMO_PROJECT_ID: "prj_abcdefghijklmnopqrstuvwx",
  DEMO_USER_ID: "usr_abcdefghijklmnopqrstuvwx",
  READ_ONLY_DEMO: "1",
};

async function renderLogin(
  env: Record<string, string | undefined>,
  searchParams: Record<string, string> = {},
) {
  vi.resetModules();
  mocks.loginForm.mockClear();
  for (const key of [
    "DEMO_MODE",
    "DEMO_OWNER_ID",
    "DEMO_PROJECT_ID",
    "DEMO_USER_ID",
    "READ_ONLY_DEMO",
  ]) {
    vi.stubEnv(key, env[key] as string);
  }
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value as string);
  }
  mocks.getGitHubStars.mockResolvedValue(null);
  const { default: LoginPage } = await import("./page");
  const html = renderToStaticMarkup(
    await LoginPage({ searchParams: Promise.resolve(searchParams) }),
  );
  return { html, props: mocks.loginForm.mock.calls[0]?.[0] as Record<string, unknown> };
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue(null);
  mocks.isEmailConfigured.mockReturnValue(true);
  mocks.isFirstRun.mockResolvedValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("editable demo login", () => {
  it("defaults to Viewer exploration and exposes a separate Owner sign-in link", async () => {
    const { html } = await renderLogin(editableDemo);

    expect(html).toContain("Explore bisibility");
    expect(html).toContain('href="/login?owner=1&amp;switch=1"');
    expect(mocks.loginForm).not.toHaveBeenCalled();
  });

  it("uses the ordinary email form for the Owner without OAuth or demo credentials", async () => {
    const { html, props } = await renderLogin(editableDemo, { owner: "1", switch: "1" });

    expect(props).toMatchObject({
      demoEmail: null,
      devOtpCode: null,
      emailSignInUnavailable: false,
      enabledProviders: undefined,
    });
    expect(html).not.toContain("Explore bisibility");
    expect(html).toContain('href="/login?switch=1"');
    expect(html).toContain("Explore demo");
  });

  it("keeps legacy demo sign-in read-only even when the Owner query is present", async () => {
    const { html } = await renderLogin(legacyDemo, { owner: "1", switch: "1" });

    expect(html).toContain("Explore bisibility");
    expect(html).not.toContain("Owner sign-in");
    expect(mocks.loginForm).not.toHaveBeenCalled();
  });

  it("keeps ordinary deployments on the normal login form", async () => {
    const { html, props } = await renderLogin({ DEMO_FIXED_OTP: "1" }, { owner: "1" });

    expect(mocks.loginForm).toHaveBeenCalledOnce();
    expect(props).toMatchObject({ demoEmail: "demo@acme.dev", devOtpCode: "000000" });
    expect(html).not.toContain("Explore bisibility");
  });
});
