import "server-only";
import type {
  UsageBudgetExtension,
  UsageBudgetExtensionInput,
} from "@/components/settings/usage-budget-extension-types";
import type { ReactNode } from "react";

export async function renderAccountDataSourceExtension(children: ReactNode): Promise<ReactNode> {
  return children;
}

export async function renderAccountUsageBudgetExtension(
  _input: Readonly<UsageBudgetExtensionInput>,
): Promise<UsageBudgetExtension | null> {
  return null;
}
