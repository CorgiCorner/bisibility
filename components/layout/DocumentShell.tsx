import { Providers } from "@/app/providers";
import { AnalyticsRuntime } from "@/components/analytics/AnalyticsRuntime";
import { ConsentSlot } from "@/components/analytics/ConsentSlot";
import { WebMcpTools } from "@/components/integrations/WebMcpTools";
import { InlineScript } from "@/components/ui/InlineScript";
import { ToastProvider } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { type AppLocale, htmlLanguage } from "@/i18n/config";
import type { IntlTranslationContext } from "@/i18n/formats";
import { pendingConsent } from "@/lib/analytics/consent";
import { providerRequiresConsent, resolveAnalyticsProvider } from "@/lib/analytics/provider";
import { readConsentFromCookies } from "@/lib/analytics/server";
import { appExtensions } from "@/lib/app-extensions";
import { getSessionReference } from "@/lib/auth/session";
import { sessionHintInitScript } from "@/lib/auth/session-hint";
import { themeInitScript } from "@/lib/theme/browser-theme";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { AbstractIntlMessages } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

type DocumentShellProps = {
  children: ReactNode;
  locale: AppLocale;
  messages: AbstractIntlMessages;
  timeZone: IntlTranslationContext["timeZone"];
};

/**
 * Each route root supplies its resolved locale before rendering children. Keeping
 * this outside a shared app root lets excluded static routes remain request-free.
 */
export async function DocumentShell({
  children,
  locale,
  messages,
  timeZone,
}: Readonly<DocumentShellProps>) {
  setRequestLocale(locale);
  const provider = resolveAnalyticsProvider(process.env);
  const [consent, session] = providerRequiresConsent(provider)
    ? await Promise.all([readConsentFromCookies(), getSessionReference()])
    : [pendingConsent(), null];

  return (
    <html
      lang={htmlLanguage(locale)}
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      {/* biome-ignore lint/style/noHeadElement: document roots retain ordered pre-hydration initializers. */}
      <head>
        <InlineScript id="theme-init" html={themeInitScript} />
        <InlineScript id="session-hint-init" html={sessionHintInitScript} />
        {appExtensions.renderHead()}
      </head>
      <body suppressHydrationWarning>
        <AnalyticsRuntime consent={consent} provider={provider} userId={session?.user.id} />
        <Providers locale={locale} messages={messages} timeZone={timeZone}>
          <ConsentSlot />
          <TooltipProvider>
            <WebMcpTools />
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
