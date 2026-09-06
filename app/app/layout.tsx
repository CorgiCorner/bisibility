import { DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { DeploymentModeProvider } from "@/components/shell/DeploymentModeProvider";
import { ToastProvider } from "@/components/ui";
import { appExtensions } from "@/lib/app-extensions";
import { redirectToSetupIfFirstRun } from "@/lib/auth/first-run";
import { requireSession } from "@/lib/auth/session";
import { getResolvedDateFormat } from "@/lib/dates/request";
import { isCloud } from "@/lib/deployment/deployment";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createNoindexMetadata();

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: Readonly<AppLayoutProps>) {
  await redirectToSetupIfFirstRun();
  await requireSession();
  const [{ resolved }, decorated] = await Promise.all([
    getResolvedDateFormat(),
    appExtensions.renderOnboardingQuizSlot(children),
  ]);

  return (
    <DeploymentModeProvider deploymentMode={isCloud ? "cloud" : "self-host"}>
      <DateFormatProvider value={resolved}>
        <ToastProvider>{decorated}</ToastProvider>
      </DateFormatProvider>
    </DeploymentModeProvider>
  );
}
