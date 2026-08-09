import { DOCS_URL } from "@/lib/site/site";

export type DeployTarget = "docker" | "other" | "railway";

export type DeployLink = {
  id: DeployTarget;
  label: string;
  description: string;
  href: string;
  muted?: boolean;
};

export const deployLinks = {
  docker: {
    id: "docker",
    label: "Deploy with Docker",
    description: "Full stack on your server. One command, manual or scheduled checks.",
    href: `${DOCS_URL}/self-hosting#docker`,
  },
  other: {
    id: "other",
    label: "Other platforms",
    description:
      "Anywhere that runs Docker images with Postgres and Valkey. See the self-hosting guide.",
    href: `${DOCS_URL}/self-hosting#production-topology`,
    muted: true,
  },
  railway: {
    id: "railway",
    label: "Deploy to Railway",
    description: "Everything runs inside your Railway project. No Temporal Cloud needed.",
    href: "https://bisibility.com/deploy/railway",
  },
} as const satisfies Record<DeployTarget, DeployLink>;

export const openSourceDeployLinks = [
  deployLinks.docker,
  deployLinks.railway,
  deployLinks.other,
] as const satisfies readonly DeployLink[];
