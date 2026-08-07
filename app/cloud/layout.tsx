import { isCloud } from "@/lib/deployment/deployment";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const metadata: Metadata = createNoindexMetadata({
  title: "Cloud | bisibility",
  description: "bisibility Cloud: focused setup and import tasks for your workspace.",
});

type CloudLayoutProps = {
  children: ReactNode;
};

/**
 * Focused Cloud task pages omit the app sidebar; each page renders its
 * context-aware top bar.
 */
export default function CloudLayout({ children }: Readonly<CloudLayoutProps>) {
  if (!isCloud) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="mx-auto w-full max-w-[760px] px-5 pt-7 pb-24 sm:px-7">{children}</div>
    </div>
  );
}
