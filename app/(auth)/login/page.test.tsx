import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dynamic } from "./page";

const mocks = vi.hoisted(() => ({
  getGitHubStars: vi.fn(),
  getSession: vi.fn(),
  getSignInCapacity: vi.fn(),
  loginForm: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/deployment/runtime-env.generated", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/auth/signin-capacity", () => ({
  enforceGoogleSignupCapacity: vi.fn(),
  getSignInCapacity: mocks.getSignInCapacity,
}));
vi.mock("@/lib/site/github-stars", () => ({ getGitHubStars: mocks.getGitHubStars }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/auth/auth", () => {
  throw new Error("The login page must not initialize the full auth server");
});
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: mocks.redirect,
}));
vi.mock("@/components/auth/LoginForm", () => ({
  LoginForm: (props: Record<string, unknown>) => {
    mocks.loginForm(props);
    return null;
  },
}));

type LoginFormProps = {
  capacity: {
    emailCodes: { binding: "daily" | "monthly"; cap: number; left: number } | null;
    googleSpots: { cap: number; left: number };
    signupsToday: number;
  } | null;
  capacityMiss: "google" | "email" | null;
  dataResidencyMessage: string;
  demoEmail: string | null;
  devOtpCode: string | null;
  enabledProviders: { github: boolean; google: boolean };
  legalConsentLinks: {
    privacyHref: string | null;
    termsHref: string | null;
  } | null;
  returnTo: string;
};

type LoginSearchParams = {
  error?: string | string[];
  next?: string | string[];
  switch?: string | string[];
};

// Re-import the page (and the env-derived module constants behind it) with a fresh
// module registry so each case observes the environment as a running container would.
async function renderLoginPage(
  env: Record<string, string | undefined>,
  searchParams: LoginSearchParams = {},
  githubStars: string | null = "2",
) {
  vi.resetModules();
  mocks.loginForm.mockClear();

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      vi.stubEnv(key, undefined as unknown as string);
    } else {
      vi.stubEnv(key, value);
    }
  }

  mocks.getSignInCapacity.mockResolvedValue({
    emailCodes: { binding: "daily", cap: 200, left: 143 },
    googleSpots: { cap: 100, left: 14 },
    signupsToday: 26,
  });
  mocks.getGitHubStars.mockResolvedValue(githubStars);
  const pageModule = await import("./page");
  const html = renderToStaticMarkup(
    await pageModule.default({ searchParams: Promise.resolve(searchParams) }),
  );

  return {
    dynamic: pageModule.dynamic,
    html,
    props: mocks.loginForm.mock.calls[0]?.[0] as LoginFormProps,
  };
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue(null);
  mocks.redirect.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("login page runtime rendering", () => {
  // Static prerendering freezes runtime auth settings, hiding demo credentials set
  // by container deployments.
  it("opts out of static prerendering", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("summarizes Compose progress around the app and scheduled worker", async () => {
    const { html } = await renderLoginPage({});

    expect(html).toContain("Open-source SEO platform");
    expect(html).toContain("docker compose -f compose.yaml -f");
    expect(html).toContain("compose.worker.yaml -f compose.temporal.yaml up -d");
    expect(html).toContain("app <span");
    expect(html).toContain("scheduled worker <span");
    expect(html).toContain("+ 6 supporting services");
    for (const service of [
      "postgres",
      "redis",
      "db-migrations",
      "temporal-postgres",
      "temporal",
      "temporal-ui",
      "worker",
    ]) {
      expect(html).not.toContain(`bisibility-${service} <`);
    }
    expect(html).not.toContain("dashboard ready");
    expect(html).not.toContain("bisibility-private");
    expect(html).not.toContain("db-migrations-1");
  }, 15_000);

  it("leaves the sign-in surface without a theme control", async () => {
    const { html } = await renderLoginPage({});

    expect(html).not.toContain("Switch to dark theme");
    expect(html).not.toContain("Switch to light theme");
  });

  it("renders the current GitHub star count", async () => {
    const { html } = await renderLoginPage({}, {}, "42");

    expect(html).toContain("42 stars");
    expect(html).not.toContain("0 stars");
  });

  it("omits the star statistic when GitHub is unavailable", async () => {
    const { html } = await renderLoginPage({}, {}, null);

    expect(html).not.toContain("stars");
  });

  it("surfaces the demo credentials when the demo flag is set at run time", async () => {
    const { props } = await renderLoginPage({ DEMO_FIXED_OTP: "1" });

    expect(props.demoEmail).toBe("demo@acme.dev");
    expect(props.devOtpCode).toBe("000000");
  });

  it("hides the demo credentials when the demo flag is absent", async () => {
    const { props } = await renderLoginPage({
      ALLOW_INSECURE_FIXED_OTP: undefined,
      DEMO_FIXED_OTP: undefined,
    });

    expect(props.demoEmail).toBeNull();
    expect(props.devOtpCode).toBeNull();
  });

  it("reflects the data region configured at run time", async () => {
    const withRegion = await renderLoginPage({ DATA_REGION: "us-east-1" });
    expect(withRegion.props.dataResidencyMessage).toBe(
      "Your data is stored and processed in the US.",
    );

    const withoutRegion = await renderLoginPage({ DATA_REGION: undefined });
    expect(withoutRegion.props.dataResidencyMessage).toBe("");
  });

  it("reflects the deployment mode configured at run time", async () => {
    const selfHosted = await renderLoginPage({ DEPLOYMENT_MODE: undefined });
    expect(selfHosted.props.legalConsentLinks).toBeNull();
    expect(selfHosted.props.capacity).toBeNull();
    expect(mocks.getSignInCapacity).not.toHaveBeenCalled();

    const hosted = await renderLoginPage({ DEPLOYMENT_MODE: "cloud" });
    expect(hosted.props.legalConsentLinks).toEqual({
      privacyHref: "/privacy",
      termsHref: "/terms",
    });
    expect(hosted.props.capacity).toMatchObject({
      googleSpots: { cap: 100, left: 14 },
    });
    expect(mocks.getSignInCapacity).toHaveBeenCalledOnce();
  });

  it("passes configured operator legal links at run time", async () => {
    const selfHosted = await renderLoginPage({
      DEPLOYMENT_MODE: "self-host",
      LEGAL_PRIVACY_URL: "/operator-privacy",
      LEGAL_TERMS_URL: "https://operator.example/terms",
    });

    expect(selfHosted.props.legalConsentLinks).toEqual({
      privacyHref: "/operator-privacy",
      termsHref: "https://operator.example/terms",
    });
  });

  it("maps the typed Google callback error to the just-missed state", async () => {
    vi.resetModules();
    mocks.loginForm.mockClear();
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    mocks.getSignInCapacity.mockResolvedValue({
      emailCodes: { binding: "daily", cap: 200, left: 143 },
      googleSpots: { cap: 100, left: 14 },
      signupsToday: 26,
    });
    const pageModule = await import("./page");

    renderToStaticMarkup(
      await pageModule.default({
        searchParams: Promise.resolve({ error: "google_signup_capacity_exhausted" }),
      }),
    );

    const props = mocks.loginForm.mock.calls[0]?.[0] as LoginFormProps;
    expect(props.capacityMiss).toBe("google");
  });

  it("passes a validated return-to destination to the login form", async () => {
    vi.resetModules();
    mocks.loginForm.mockClear();
    const pageModule = await import("./page");

    renderToStaticMarkup(
      await pageModule.default({
        searchParams: Promise.resolve({ next: "/app/settings?tab=access" }),
      }),
    );

    const props = mocks.loginForm.mock.calls[0]?.[0] as LoginFormProps;
    expect(props.returnTo).toBe("/app/settings?tab=access");
  });

  it("reflects the social providers configured at run time", async () => {
    const configured = await renderLoginPage({
      GITHUB_CLIENT_ID: "github-client",
      GITHUB_CLIENT_SECRET: "github-secret",
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
    });

    expect(configured.props.enabledProviders).toEqual({ github: true, google: false });

    const unconfigured = await renderLoginPage({
      GITHUB_CLIENT_ID: undefined,
      GITHUB_CLIENT_SECRET: undefined,
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
    });

    expect(unconfigured.props.enabledProviders).toEqual({ github: false, google: false });
  });
});

describe("session-aware sign in", () => {
  it("redirects a signed-in visitor to the default home", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "usr_1" } });
    await renderLoginPage({}, {});
    expect(mocks.redirect).toHaveBeenCalledWith("/app");
    expect(mocks.loginForm).not.toHaveBeenCalled();
  });

  it("honors a validated next destination", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "usr_1" } });
    await renderLoginPage({}, { next: "/cloud/import" });
    expect(mocks.redirect).toHaveBeenCalledWith("/cloud/import");
  });

  it("rejects an off-origin next destination", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "usr_1" } });
    await renderLoginPage({}, { next: "https://evil.example.com/steal" });
    expect(mocks.redirect).toHaveBeenCalledWith("/app");
  });

  it("renders the form for an explicit account switch", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "usr_1" } });
    await renderLoginPage({}, { switch: "1" });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.loginForm).toHaveBeenCalled();
  });

  it("renders the form with no session", async () => {
    mocks.getSession.mockResolvedValue(null);
    await renderLoginPage({}, {});
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.loginForm).toHaveBeenCalled();
  });
});
