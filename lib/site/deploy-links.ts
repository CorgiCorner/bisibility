import { DOCS_URL, GITHUB_URL } from "@/lib/site/site";

export type DeployTarget = "docker" | "fly" | "railway" | "vercel";

export type DeployLink = {
  id: DeployTarget;
  label: string;
  href: string;
};

const repositoryUrl = encodeURIComponent(GITHUB_URL);

export const deployLinks = {
  docker: {
    id: "docker",
    label: "Deploy with Docker",
    href: `${DOCS_URL}/self-hosting#docker`,
  },
  fly: {
    id: "fly",
    label: "Deploy to Fly.io",
    href: `${DOCS_URL}/self-hosting#flyio`,
  },
  railway: {
    id: "railway",
    label: "Deploy to Railway",
    href: `https://railway.com/new/template?template=${repositoryUrl}`,
  },
  vercel: {
    id: "vercel",
    // Vercel cannot host the long-lived Temporal worker, so it serves the web
    // app, the REST API, and manual checks, but not scheduled checks. The label
    // says so, and the link points at the documented path rather than the bare
    // clone URL so the limitation is read before the deploy starts.
    label: "Deploy to Vercel (web only)",
    href: `${DOCS_URL}/self-hosting#vercel`,
  },
} as const satisfies Record<DeployTarget, DeployLink>;

// Every target here needs PostgreSQL and Redis/Valkey attached by the operator,
// as documented in docs/self-hosting.mdx. None of these buttons is a one-click
// production install, and that is a property of the stack, not of one platform.
export const openSourceDeployLinks = [
  deployLinks.docker,
  deployLinks.railway,
  deployLinks.fly,
  deployLinks.vercel,
] as const satisfies readonly DeployLink[];
