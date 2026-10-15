import "server-only";
import { executeComparisonSide } from "../provider-comparison/execution";
import type { ComparisonProvider } from "../provider-comparison/types";
export async function executeProviderComparisonActivity(input: {
  projectId: string;
  runId: string;
  provider: ComparisonProvider;
}) {
  await executeComparisonSide(input);
}
