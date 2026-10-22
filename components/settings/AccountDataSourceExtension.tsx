import "server-only";
import type {
  UsageBudgetExtension,
  UsageBudgetExtensionInput,
} from "@/components/settings/usage-budget-extension-types";
import { ProviderAccessScopeProvider } from "@/components/ui/ProviderAccessScopeProvider";
import { readProjectProviderAccessScope } from "@/lib/queries/provider-access-scope";
import type { ReactNode } from "react";

export async function renderProjectDataSourceExtension(
  children: ReactNode,
  projectRef: string,
): Promise<ReactNode> {
  const { scope } = await readProjectProviderAccessScope(projectRef);
  return <ProviderAccessScopeProvider scope={scope}>{children}</ProviderAccessScopeProvider>;
}

export async function renderAccountDataSourceExtension(children: ReactNode): Promise<ReactNode> {
  return children;
}

export async function renderAccountUsageBudgetExtension(
  _input: Readonly<UsageBudgetExtensionInput>,
): Promise<UsageBudgetExtension | null> {
  return null;
}
