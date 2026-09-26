"use client";

import type { IntegrationProviderData } from "@/lib/integrations/types";
import type { ReactNode } from "react";

export function OnboardingDataSourceSlot({ children }: Readonly<{ children?: ReactNode }>) {
  return children ?? null;
}
export function ProviderDataSourceSlot(
  _props: Readonly<{
    onSelectOwn?: () => void;
    projectId?: string;
    provider: Pick<
      IntegrationProviderData,
      "connectionId" | "connectionUpdatedAt" | "credentialSource" | "hasStoredCredentials" | "id"
    >;
  }>,
) {
  return null;
}
