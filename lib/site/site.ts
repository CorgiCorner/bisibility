export const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL?.trim().replace(/\/$/, "") || "https://bisibility.com/docs";
// Self-hosted builds have no marketing pages, so vendor routes use this absolute
// origin instead of broken instance-relative links.
export const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL?.trim().replace(/\/$/, "") || "https://bisibility.com";
export const GITHUB_URL = "https://github.com/CorgiCorner/bisibility";
export const LINKEDIN_URL = "https://www.linkedin.com/company/bisibility";
export const CLOUD_BETA_SIGNUP_HREF = "/login";
export const CLOUD_BETA_EMAIL_NOTICE =
  "By joining the Cloud beta, you agree to receive emails about beta updates, incidents, pricing, and general availability.";
export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues/new`;
export const DISCORD_URL = "https://discord.gg/bisibility";
export const FEEDBACK_URL = "mailto:feedback@bisibility.com?subject=bisibility%20feedback";
export const LICENSE = "AGPL-3.0";

export function isDocsHref(href: string): boolean {
  const docsBase = DOCS_URL.replace(/\/$/, "");
  const normalizedHref = href.split(/[?#]/, 1)[0]?.replace(/\/$/, "") ?? "";

  return (
    normalizedHref === docsBase ||
    normalizedHref.startsWith(`${docsBase}/`) ||
    normalizedHref === "/docs" ||
    normalizedHref.startsWith("/docs/")
  );
}

export function docsLinkProps(href: string) {
  if (!isDocsHref(href)) {
    return {};
  }
  const externalHref = href.startsWith("/docs") ? `${DOCS_URL}${href.slice(5)}` : href;

  return { href: externalHref, rel: "noreferrer noopener", target: "_blank" };
}
