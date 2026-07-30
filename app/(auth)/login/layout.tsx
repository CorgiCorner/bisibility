import { redirectToSetupIfFirstRun } from "@/lib/auth/first-run";
import { loginMetadata } from "@/lib/seo/jsonld";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = loginMetadata;

type LoginLayoutProps = {
  children: ReactNode;
};

export default async function LoginLayout({ children }: LoginLayoutProps) {
  await redirectToSetupIfFirstRun();
  return children;
}
