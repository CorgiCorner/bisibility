import { ToastProvider } from "@/components/ui";
import { redirectToSetupIfFirstRun } from "@/lib/auth/first-run";
import { requireSession } from "@/lib/auth/session";
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

  return <ToastProvider>{children}</ToastProvider>;
}
