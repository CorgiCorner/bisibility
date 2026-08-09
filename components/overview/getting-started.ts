import type { ProjectRef } from "@/lib/routing/app-path";

// State model for the empty-workspace onboarding. JSX-free so Server Components and
// tests can import it without pulling the client card in.

export type GettingStartedProgress = {
  gscOAuthConfigured: boolean;
  hasAnalyticsSource: boolean;
  hasCheck: boolean;
  hasKeywords: boolean;
  projectId: string;
  projectRef?: ProjectRef;
  providerConnected: boolean;
};

export type GettingStartedCapabilities = {
  canCreateKeywords: boolean;
  canInstallSampleData: boolean;
  canManageImports: boolean;
  canManageProviders: boolean;
};

export function hasGettingStartedDataSource(progress: GettingStartedProgress) {
  return progress.providerConnected || progress.hasAnalyticsSource;
}

/** 1-based index of the step the user should take next; 0 once everything is done. */
export function gettingStartedActiveIndex(progress: GettingStartedProgress) {
  if (!hasGettingStartedDataSource(progress)) return 1;
  if (!progress.hasKeywords) return 2;
  if (!progress.hasCheck) return 3;
  return 0;
}
