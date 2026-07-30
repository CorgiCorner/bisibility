import { cleanupAcceptanceFixture, createAcceptanceFixture, prisma } from "./alerts-remediation-fixture";
import {
  queueCapture,
  runDigestScenario,
  runNotificationScenario,
  runRetryScenario,
  runStatefulScenario,
} from "./alerts-remediation-scenarios";

const prefixValue = process.env.ALERTS_REMEDIATION_FIXTURE_PREFIX;
if (!prefixValue?.startsWith("alerts-remediation-test-")) {
  throw new Error("fixture prefix must be acceptance-scoped");
}
const prefix = prefixValue;

const fixture = await createAcceptanceFixture(prefix);
try {
  await runDigestScenario(fixture, queueCapture());
  await runRetryScenario(fixture);
  await runStatefulScenario(fixture);
  await runNotificationScenario(fixture);
  console.log("alert remediation acceptance smoke ok");
} finally {
  await cleanupAcceptanceFixture(fixture);
  await prisma.$disconnect();
  console.log(`fixture cleanup ok: ${prefix}`);
}
