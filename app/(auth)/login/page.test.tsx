import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSignInCapacity: vi.fn(),
  loginForm: vi.fn(),
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
vi.mock("@/lib/auth/auth", () => {
  throw new Error("The login page must not initialize the full auth server");
});
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

// Re-import the page (and the env-derived module constants behind it) with a fresh
// module registry so each case observes the environment as a running container would.
async function renderLoginPage(env: Record<string, string | undefined>) {
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
  const pageModule = await import("./page");
  const html = renderToStaticMarkup(await pageModule.default());

  return {
    dynamic: pageModule.dynamic,
    html,
    props: mocks.loginForm.mock.calls[0]?.[0] as LoginFormProps,
  };
}

describe("login page runtime rendering", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Static prerendering freezes runtime auth settings, hiding demo credentials set
  // by container deployments.
  it("opts out of static prerendering", async () => {
    const { dynamic } = await renderLoginPage({});

    expect(dynamic).toBe("force-dynamic");
  });

  it("summarizes Compose progress around the app and scheduled worker", async () => {
    const { html } = await renderLoginPage({});

    expect(html).toContain("docker compose --profile scheduled up -d");
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
