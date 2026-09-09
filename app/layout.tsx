import { AnalyticsRuntime } from "@/components/analytics/AnalyticsRuntime";
import { ConsentSlot } from "@/components/analytics/ConsentSlot";
import { WebMcpTools } from "@/components/integrations/WebMcpTools";
import { KeywordImportProvider } from "@/components/keywords/import/KeywordImportProvider";
import { InlineScript } from "@/components/ui/InlineScript";
import { ToastProvider } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { pendingConsent } from "@/lib/analytics/consent";
import { providerRequiresConsent, resolveAnalyticsProvider } from "@/lib/analytics/provider";
import { readConsentFromCookies } from "@/lib/analytics/server";
import { appExtensions } from "@/lib/app-extensions";
import { getSessionReference } from "@/lib/auth/session";
import { sessionHintInitScript } from "@/lib/auth/session-hint";
import { rootMetadata } from "@/lib/seo/jsonld";
import { themeInitScript } from "@/lib/theme/browser-theme";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = rootMetadata;

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: Readonly<RootLayoutProps>) {
  const provider = resolveAnalyticsProvider(process.env);
  // Reading cookies or the session in the root layout opts every route into dynamic
  // rendering. Skip both when no consent-gated provider is configured, so a build
  // without an analytics key keeps its statically rendered and prerendered routes.
  const [consent, session] = providerRequiresConsent(provider)
    ? await Promise.all([readConsentFromCookies(), getSessionReference()])
    : [pendingConsent(), null];

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <InlineScript id="theme-init" html={themeInitScript} />
        <InlineScript id="session-hint-init" html={sessionHintInitScript} />
        {appExtensions.renderHead()}
      </head>
      <body suppressHydrationWarning>
        <AnalyticsRuntime consent={consent} provider={provider} userId={session?.user.id} />
        <ConsentSlot />
        <Providers>
          <TooltipProvider>
            <WebMcpTools />
            <ToastProvider>
              <KeywordImportProvider>{children}</KeywordImportProvider>
            </ToastProvider>
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
