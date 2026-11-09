import { startSiteAuditIntentProcessor } from "./site-audit-intent-dispatch";

export async function withSiteAuditIntentProcessor(run: () => Promise<void>) {
  const processor = startSiteAuditIntentProcessor();
  try {
    await run();
  } finally {
    await processor.close();
  }
}
