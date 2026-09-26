import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { renderAccountDataSourceExtension } from "@/components/settings/AccountDataSourceExtension";
import { DeploymentModeProvider } from "@/components/shell/DeploymentModeProvider";
import { appExtensions } from "@/lib/app-extensions";
import { redirectToSetupIfFirstRun } from "@/lib/auth/first-run";
import { requireSession } from "@/lib/auth/session";
import { getResolvedDateFormat } from "@/lib/dates/request";
import { readDemoConfig } from "@/lib/demo/config";
import { isCloud } from "@/lib/deployment/deployment";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import { FLAG_SPRITE_URL } from "@/lib/ui/flag-sprite";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { preload } from "react-dom";

export const metadata: Metadata = createNoindexMetadata();

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: Readonly<AppLayoutProps>) {
  // Every app page carries a market control, so the flag sprite is fetched with the document
  // instead of after the first flag renders.
  preload(FLAG_SPRITE_URL, { as: "image", type: "image/svg+xml" });
  await redirectToSetupIfFirstRun();
  const session = await requireSession();
  const demo = readDemoConfig();
  const isDemo = demo.kind !== "disabled";
  const quizDecorated = isDemo
    ? Promise.resolve(children)
    : appExtensions.renderOnboardingQuizSlot(children);
  const [{ resolved }, supportWidget, decorated] = await Promise.all([
    getResolvedDateFormat(),
    isCloud && !isDemo
      ? appExtensions.renderSupportWidget({
          expiresAt: session.session.expiresAt,
          userId: session.user.id,
        })
      : Promise.resolve(null),
    quizDecorated.then((base) => (isDemo ? base : renderAccountDataSourceExtension(base))),
  ]);
  return (
    <DeploymentModeProvider deploymentMode={isCloud ? "cloud" : "self-host"}>
      <DateFormatProvider value={resolved}>
        <DateDisplayProvider>
          {supportWidget}
          {decorated}
        </DateDisplayProvider>
      </DateFormatProvider>
    </DeploymentModeProvider>
  );
}
