import { WebMcpTools } from "@/components/integrations/WebMcpTools";
import { KeywordImportProvider } from "@/components/keywords/import/KeywordImportProvider";
import { ToastProvider, TooltipProvider } from "@/components/ui";
import { appExtensions } from "@/lib/app-extensions";
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

export default function RootLayout({ children }: Readonly<RootLayoutProps>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>{appExtensions.renderHead()}</head>
      <body suppressHydrationWarning>
        <script>{themeInitScript}</script>
        <script>{sessionHintInitScript}</script>
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
