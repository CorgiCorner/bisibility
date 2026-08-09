import type { SignInCapacity, SignInCapacityMiss } from "@/lib/auth/signin-capacity-types";
import type { LegalConsentLinks } from "@/lib/deployment/legal";
import { render, screen } from "@testing-library/react";
import type { UseFormRegister } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { type EnabledOAuthProviders, LoginEmailStep, type OAuthProvider } from "./LoginEmailStep";
import type { LoginFormValues } from "./login-schema";

const enabledProviders = {
  github: true,
  google: true,
} satisfies EnabledOAuthProviders;

const disabledProviders = {
  github: false,
  google: false,
} satisfies EnabledOAuthProviders;

const cloudLegalConsentLinks = {
  privacyHref: "/privacy",
  termsHref: "/terms",
} satisfies LegalConsentLinks;

function renderStep(
  providers: EnabledOAuthProviders,
  legalConsentLinks: LegalConsentLinks | null = cloudLegalConsentLinks,
  capacity: SignInCapacity | null = null,
  capacityMiss: SignInCapacityMiss = null,
) {
  const register = (() => ({
    name: "email",
    onBlur: vi.fn(),
    onChange: vi.fn(),
    ref: vi.fn(),
  })) as UseFormRegister<LoginFormValues>;

  return render(
    <LoginEmailStep
      capacity={capacity}
      capacityMiss={capacityMiss}
      dataResidencyMessage="Your data is stored and processed in the EU."
      enabledProviders={providers}
      errors={{}}
      formError={null}
      isSubmitting={false}
      legalConsentLinks={legalConsentLinks}
      onProviderSignIn={vi.fn<(provider: OAuthProvider) => void>()}
      onSubmit={(event) => event.preventDefault()}
      register={register}
      socialProvider={null}
    />,
  );
}

describe("LoginEmailStep", () => {
  it("renders only server-enabled social providers", () => {
    renderStep({ github: true, google: false });

    expect(screen.getByRole("button", { name: /continue with github/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue with google/i })).toBeNull();
    expect(screen.getByText("OR")).toBeInTheDocument();
  });

  it("hides social provider controls when none are enabled", () => {
    renderStep(disabledProviders);

    expect(screen.queryByRole("button", { name: /continue with github/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /continue with google/i })).toBeNull();
    expect(screen.queryByText("OR")).toBeNull();
  });

  it("keeps the email section off the residency note when no provider block precedes it", () => {
    const withProviders = renderStep(enabledProviders);
    expect(withProviders.getByTestId("login-email-section")).not.toHaveClass("mt-[26px]");
    withProviders.unmount();

    renderStep(disabledProviders);
    expect(screen.getByTestId("login-email-section")).toHaveClass("mt-[26px]");
  });

  it("hides the joined-today line when nobody joined yet", () => {
    renderStep(enabledProviders, cloudLegalConsentLinks, {
      emailCodes: { binding: "daily", cap: 200, left: 143 },
      googleSpots: { cap: 100, left: 14 },
      signupsToday: 0,
    });

    expect(screen.queryByText(/people joined today/)).toBeNull();
  });

  it("uses the singular joined-today line for a single signup", () => {
    renderStep(enabledProviders, cloudLegalConsentLinks, {
      emailCodes: { binding: "daily", cap: 200, left: 143 },
      googleSpots: { cap: 100, left: 14 },
      signupsToday: 1,
    });
  });

  it("renders both configured social providers", () => {
    renderStep(enabledProviders);

    expect(screen.getByRole("button", { name: /continue with github/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });

  it("renders the data residency note", () => {
    renderStep(disabledProviders);

    expect(screen.getByText("Your data is stored and processed in the EU.")).toBeInTheDocument();
  });

  it("keeps both consent links and their spacing unchanged in cloud mode", () => {
    const { container } = renderStep(disabledProviders);

    const terms = screen.getByRole("link", { name: "Terms" });
    const privacy = screen.getByRole("link", { name: "Privacy Policy" });
    const consent = container.querySelector("p.mt-\\[22px\\]");
    // No capacity means no hosted beta, so the beta-email clause is deliberately absent here.
    expect(consent).toHaveTextContent("By continuing you agree to the Terms and Privacy Policy.");
    expect(terms).toHaveAttribute("href", "/terms");
    expect(terms).not.toHaveAttribute("target");
    expect(privacy).toHaveAttribute("href", "/privacy");
  });

  it("omits the consent line when no operator links are configured", () => {
    renderStep(disabledProviders, null);

    expect(screen.queryByText(/By continuing you agree/)).toBeNull();
  });

  it("renders terms-only wording and external-link attributes", () => {
    renderStep(disabledProviders, {
      privacyHref: null,
      termsHref: "HTTPS://operator.example/terms",
    });

    const terms = screen.getByRole("link", { name: "Terms" });
    expect(screen.getByText(/By continuing you agree/)).toHaveTextContent(
      "By continuing you agree to the Terms.",
    );
    expect(terms).toHaveAttribute("href", "HTTPS://operator.example/terms");
    expect(terms).toHaveAttribute("target", "_blank");
    expect(terms).toHaveAttribute("rel", "noreferrer");
    expect(screen.queryByRole("link", { name: "Privacy Policy" })).toBeNull();
  });

  it("renders privacy-only wording with a relative link", () => {
    renderStep(disabledProviders, {
      privacyHref: "/operator-privacy",
      termsHref: null,
    });

    const privacy = screen.getByRole("link", { name: "Privacy Policy" });
    expect(screen.getByText(/By continuing you agree/)).toHaveTextContent(
      "By continuing you agree to the Privacy Policy.",
    );
    expect(privacy).toHaveAttribute("href", "/operator-privacy");
    expect(privacy).not.toHaveAttribute("target");
    expect(screen.queryByRole("link", { name: "Terms" })).toBeNull();
  });

  it("does not render a rejected terms URL", () => {
    renderStep(disabledProviders, {
      privacyHref: "/safe-privacy",
      termsHref: null,
    });

    expect(screen.queryByRole("link", { name: "Terms" })).toBeNull();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/safe-privacy",
    );
  });

  it("keeps login behavior free of capacity UI when capacity is unavailable", () => {
    renderStep(enabledProviders, null);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send login code" })).toBeInTheDocument();
    expect(screen.queryByText(/early-access spots left/)).toBeNull();
    expect(screen.queryByText(/login codes left today/)).toBeNull();
    expect(screen.queryByText(/people joined today/)).toBeNull();
  });

  it("renders both cloud meters and the joined-today line", () => {
    renderStep(enabledProviders, cloudLegalConsentLinks, {
      emailCodes: { binding: "daily", cap: 200, left: 143 },
      googleSpots: { cap: 100, left: 14 },
      signupsToday: 26,
    });

    expect(
      screen.getByRole("heading", { name: "Sign in or create an account" }),
    ).toBeInTheDocument();
    expect(screen.getByText("14 of 100 Google sign-up spots left")).toBeInTheDocument();
    expect(screen.getByText("143 of 200 login codes left today")).toBeInTheDocument();
  });

  it("omits the email meter and gate when capacity is unknown", () => {
    renderStep(enabledProviders, cloudLegalConsentLinks, {
      emailCodes: null,
      googleSpots: { cap: 100, left: 14 },
      signupsToday: 26,
    });

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByText(/login codes left today/)).toBeNull();
  });

  it("keeps Google enabled while new sign-ups are full", () => {
    renderStep(enabledProviders, cloudLegalConsentLinks, {
      emailCodes: { binding: "daily", cap: 200, left: 143 },
      googleSpots: { cap: 100, left: 0 },
      signupsToday: 26,
    });

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    expect(
      screen.getByText(
        "New Google sign-ups are full while Google reviews our verification request. Existing Google accounts still work - or use email below.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the approved full-card copy when both providers are full", () => {
    renderStep(enabledProviders, cloudLegalConsentLinks, {
      emailCodes: { binding: "daily", cap: 200, left: 0 },
      googleSpots: { cap: 100, left: 0 },
      signupsToday: 26,
    });

    expect(screen.getByRole("heading", { name: "We're at capacity today" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Self-host bisibility - it's open source" }),
    ).toHaveAttribute("href", "https://bisibility.com/docs/self-hosting");
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  });

  it("uses next-month copy when the monthly email limit binds", () => {
    renderStep(enabledProviders, cloudLegalConsentLinks, {
      emailCodes: { binding: "monthly", cap: 3_000, left: 0 },
      googleSpots: { cap: 100, left: 14 },
      signupsToday: 26,
    });

    expect(screen.getByText(/More free up at the start of next month \(UTC\)/)).toBeInTheDocument();
    expect(screen.queryByText(/More free up within 24 hours/)).toBeNull();
  });

  it("uses next-month copy in the full-card state", () => {
    renderStep(enabledProviders, cloudLegalConsentLinks, {
      emailCodes: { binding: "monthly", cap: 3_000, left: 0 },
      googleSpots: { cap: 100, left: 0 },
      signupsToday: 26,
    });

    expect(
      screen.getByRole("heading", { name: "We're at capacity this month" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/More codes free up at the start of next month \(UTC\)/),
    ).toBeInTheDocument();
  });

  it.each([
    [
      "google",
      "The last Google sign-up spots were taken a moment ago. Existing Google accounts still work - or use email below.",
    ],
    [
      "email",
      "The last login codes went out while you were on this page - nothing was sent to your address.",
    ],
  ] as const)("renders the %s just-missed state", (miss, copy) => {
    renderStep(
      enabledProviders,
      cloudLegalConsentLinks,
      {
        emailCodes: { binding: "daily", cap: 200, left: 143 },
        googleSpots: { cap: 100, left: 14 },
        signupsToday: 26,
      },
      miss,
    );

    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "P" && element.textContent === `Just missed it. ${copy}`,
      ),
    ).toBeInTheDocument();
  });
});
