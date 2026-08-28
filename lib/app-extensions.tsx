import "@/lib/deployment/runtime-env.generated";
import type { ReactNode } from "react";

export type SupportWidgetUser = Readonly<{
  email: string;
  id: string;
  name: string;
}>;

function plausibleScriptSource(baseUrl: string) {
  try {
    const url = new URL(baseUrl.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    url.hash = "";
    url.search = "";
    return `${url.toString().replace(/\/+$/, "")}/js/script.js`;
  } catch {
    return null;
  }
}

export function plausibleScriptConfig(env: NodeJS.ProcessEnv = process.env) {
  const domain = env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim();
  const baseUrl = env.NEXT_PUBLIC_PLAUSIBLE_URL?.trim();
  if (!domain || !baseUrl) return null;

  const src = plausibleScriptSource(baseUrl);
  return src ? { domain, src } : null;
}

function renderHead(): ReactNode {
  const config = plausibleScriptConfig();
  if (!config) return null;

  return <script async data-domain={config.domain} src={config.src} />;
}

function renderSupportWidget(_user: SupportWidgetUser): Promise<ReactNode> {
  return Promise.resolve(null);
}

async function renderOnboardingQuizSlot(children: ReactNode): Promise<ReactNode> {
  return children;
}

export const appExtensions = {
  renderHead,
  renderSupportWidget,
  renderOnboardingQuizSlot,
};
