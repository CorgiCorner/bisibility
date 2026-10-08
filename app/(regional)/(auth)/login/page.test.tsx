import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { authFeatureTestMessages } from "@/i18n/test-support/render-with-feature-messages";
import { redirect } from "@/tests/next-navigation";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dynamic } from "./page";

const mocks = vi.hoisted(() => ({
  exploreDemo: vi.fn(),
  getGitHubStars: vi.fn(),
  getSession: vi.fn(),
  isEmailConfigured: vi.fn(),
  isFirstRun: vi.fn(),
  getSignInCapacity: vi.fn(),
  loginForm: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
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
vi.mock("@/lib/auth/first-run", () => ({ isFirstRun: mocks.isFirstRun }));
vi.mock("@/lib/email/registry", () => ({ isEmailConfigured: mocks.isEmailConfigured }));
vi.mock("@/lib/auth/auth", () => {
  throw new Error("The login page must not initialize the full auth server");
});
vi.mock("@/components/auth/LoginForm", () => ({
  LoginForm: (props: Record<string, unknown>) => {
    mocks.loginForm(props);
    return null;
  },
}));
vi.mock("@/components/auth/ExploreDemo", () => ({
  ExploreDemo: (props: Record<string, unknown>) => {
    mocks.exploreDemo(props);
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
  emailSignInUnavailable: boolean;
  enabledProviders: { github: boolean; google: boolean };
  legalConsentLinks: {
    privacyHref: string | null;
    termsHref: string | null;
  } | null;
  returnTo: string;
};

type LoginSearchParams = Record<string, string | string[] | undefined> & {
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
  mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
  const pageModule = await import("./page");
  const html = renderToStaticMarkup(
    <FeatureMessagesProvider locale="en" messages={authFeatureTestMessages} timeZone="UTC">
      {await pageModule.default({ searchParams: Promise.resolve(searchParams) })}
    </FeatureMessagesProvider>,
  );

  return {
    dynamic: pageModule.dynamic,
    html,
    props: mocks.loginForm.mock.calls[0]?.[0] as LoginFormProps,
  };
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

describe("login page runtime rendering", () => {
  it.each([
    [
      "/app/prj_abcdefghijklmnopqrstuvwx/keyword-research?seed=raw%26value%3D1",
      "/app/prj_abcdefghijklmnopqrstuvwx/keyword-research?seed=raw%26value%3D1",
    ],
    [
      ["/app/prj_abcdefghijklmnopqrstuvwx/dashboard", "/app/prj_other/dashboard"],
      "/app/prj_abcdefghijklmnopqrstuvwx/dashboard",
    ],
    ["/app/prj_other/dashboard", null],
    ["/app/prj_abcdefghijklmnopqrstuvwx_suffix/dashboard", null],
    ["/app/prj_abcdefghijklmnopqrstuvwx/../prj_other/dashboard", null],
    ["//evil.example.com", null],
    [undefined, null],
  ])(
    "forwards only this editable demo project's validated next path for %j",
    async (next, expected) => {
      await renderLoginPage(
        {
          DEMO_MODE: "editable",
          READ_ONLY_DEMO: undefined,
          DEMO_FIXED_OTP: undefined,
          ALLOW_INSECURE_FIXED_OTP: undefined,
          DEMO_USER_ID: "usr_abcdefghijklmnopqrstuvwx",
          DEMO_OWNER_ID: "usr_zyxwvutsrqponmlkjihgfedc",
          DEMO_PROJECT_ID: "prj_abcdefghijklmnopqrstuvwx",
        },
        { next },
      );
      expect(mocks.exploreDemo).toHaveBeenCalledExactlyOnceWith({ nextPath: expected });
      expect(mocks.loginForm).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "/app/prj_example/keyword-research?seed=ai%20tools%20directory",
      "/app/prj_example/keyword-research?seed=ai%20tools%20directory",
    ],
    [["/app/prj_example/dashboard", "//evil.example.com"], "/app/prj_example/dashboard"],
    ["//evil.example.com", null],
    [undefined, null],
  ])("passes only a validated demo next path for %j", async (next, expected) => {
    await renderLoginPage(
      {
        DEMO_MODE: undefined,
        READ_ONLY_DEMO: "1",
        DEMO_FIXED_OTP: undefined,
        ALLOW_INSECURE_FIXED_OTP: undefined,
        DEMO_USER_ID: "usr_abcdefghijklmnopqrstuvwx",
        DEMO_PROJECT_ID: "prj_abcdefghijklmnopqrstuvwx",
      },
      { next },
    );
    expect(mocks.exploreDemo).toHaveBeenCalledWith({ nextPath: expected });
    expect(mocks.loginForm).not.toHaveBeenCalled();
  });

  // Static prerendering freezes runtime auth settings, hiding demo credentials set
  // by container deployments.
  it("opts out of static prerendering", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("preserves signed OAuth parameters when switching to the demo owner login", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "existing-demo" } });
    const { html } = await renderLoginPage(
      {
        DEMO_MODE: "editable",
        READ_ONLY_DEMO: "0",
        DEMO_USER_ID: "usr_abcdefghijklmnopqrstuvwx",
        DEMO_OWNER_ID: "usr_zyxwvutsrqponmlkjihgfedc",
        DEMO_PROJECT_ID: "prj_abcdefghijklmnopqrstuvwx",
      },
      {
        client_id: "mcp-client",
        sig: "signed-query",
        ba_param: ["client_id", "ba_param"],
        next: "/oauth/consent",
      },
    );
    expect(html).toContain("client_id=mcp-client");
    expect(html).toContain("sig=signed-query");
    expect(html).toContain("ba_param=client_id&amp;ba_param=ba_param");
    expect(html).toContain("owner=1&amp;switch=1");
  });

  it("preserves signed OAuth parameters when switching from Owner back to Viewer", async () => {
    const { html, props } = await renderLoginPage(
      {
        DEMO_MODE: "editable",
        READ_ONLY_DEMO: undefined,
        DEMO_USER_ID: "usr_abcdefghijklmnopqrstuvwx",
        DEMO_OWNER_ID: "usr_zyxwvutsrqponmlkjihgfedc",
        DEMO_PROJECT_ID: "prj_abcdefghijklmnopqrstuvwx",
      },
      {
        owner: "1",
        switch: "1",
        client_id: "mcp-client",
        sig: "signed-query",
        ba_param: ["client_id", "ba_param"],
        next: "/oauth/consent",
      },
    );
    expect(props.returnTo).toBe("/oauth/consent");
    expect(html).toContain("client_id=mcp-client");
    expect(html).toContain("sig=signed-query");
    expect(html).toContain("ba_param=client_id&amp;ba_param=ba_param");
    expect(html).not.toContain("owner=1");
    expect(html).toContain("switch=1");
  });

  it("removes the Compose demonstration from the left column", async () => {
    const { html } = await renderLoginPage({});

    expect(html).not.toContain("~/bisibility");
    expect(html).not.toContain("docker compose");
    expect(html).not.toContain("scheduled worker");
    expect(html).not.toContain("supporting services");
  });

  it("describes key ownership instead of claiming the app is self-hosted", async () => {
    const { html } = await renderLoginPage({});

    expect(html).toContain("Bring your own keys");
    expect(html).not.toContain("Self-hosted");
  });

  it("renders a safe remembered-website cue for an onboarding destination", async () => {
    const website = "https://www.Example.com/path?<script>alert(1)</script>";
    const next = `/onboarding?${new URLSearchParams({ website })}`;
    const { html } = await renderLoginPage({ NEXT_PUBLIC_DOMAIN_ICONS: undefined }, { next });

    expect(html).toContain("Setting up tracking for");
    expect(html).toContain("example.com");
    expect(html).toContain("remembered-website-favicon-probe");
    expect(html).toContain("domain=www.example.com&amp;sz=32");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(1)");
  });

  it.each([
    { name: "an absent destination", searchParams: {} },
    { name: "an onboarding destination without a website", searchParams: { next: "/onboarding" } },
    {
      name: "an onboarding destination with an empty website",
      searchParams: { next: "/onboarding?website=" },
    },
    {
      name: "another local destination",
      searchParams: { next: "/app?website=example.com" },
    },
    {
      name: "an off-origin destination",
      searchParams: { next: "https://evil.example/onboarding?website=example.com" },
    },
  ])("omits the remembered-website cue for $name", async ({ searchParams }) => {
    const { html } = await renderLoginPage({}, searchParams);

    expect(html).not.toContain("Setting up tracking for");
    expect(html).not.toContain("remembered-website-favicon-probe");
  });

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
      LEGAL_TERMS_URL: "https://operator.example.com/terms",
    });

    expect(selfHosted.props.legalConsentLinks).toEqual({
      privacyHref: "/operator-privacy",
      termsHref: "https://operator.example.com/terms",
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

  it("pre-checks unavailable email sign-in for an established production instance", async () => {
    mocks.isEmailConfigured.mockReturnValue(false);
    mocks.isFirstRun.mockResolvedValue(false);

    const { props } = await renderLoginPage({
      ALLOW_INSECURE_FIXED_OTP: undefined,
      DEMO_FIXED_OTP: undefined,
      NODE_ENV: "production",
    });

    expect(props.emailSignInUnavailable).toBe(true);
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
    expect(redirect).toHaveBeenCalledWith("/app");
    expect(mocks.loginForm).not.toHaveBeenCalled();
  });

  it("honors a validated next destination", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "usr_1" } });
    await renderLoginPage({}, { next: "/cloud/import" });
    expect(redirect).toHaveBeenCalledWith("/cloud/import");
  });

  it("rejects an off-origin next destination", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "usr_1" } });
    await renderLoginPage({}, { next: "https://evil.example.com/steal" });
    expect(redirect).toHaveBeenCalledWith("/app");
  });

  it("renders the form for an explicit account switch", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "usr_1" } });
    await renderLoginPage({}, { switch: "1" });
    expect(redirect).not.toHaveBeenCalled();
    expect(mocks.loginForm).toHaveBeenCalled();
  });

  it("renders the form with no session", async () => {
    mocks.getSession.mockResolvedValue(null);
    await renderLoginPage({}, {});
    expect(redirect).not.toHaveBeenCalled();
    expect(mocks.loginForm).toHaveBeenCalled();
  });
});
