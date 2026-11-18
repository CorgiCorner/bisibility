import { runStoreConformance } from "@usagekit/store/conformance";
import { afterAll, beforeAll, vi } from "vitest";
import {
  assertOfflineCoverage,
  classifyOfflineCases,
  conformanceCases,
} from "./conformance-coverage.test-fixture";
import {
  closeOfflineConformancePool,
  createOfflineConformanceFixture,
} from "./conformance-offline.test-fixture";

// The durable case dumps and reloads the in-process database to model a restart; on shared CI
// runners that alone took about 90 seconds, so this file uses the metering suites' timeout.
vi.setConfig({ testTimeout: 180_000 });

// Register every installed case. Only reviewed independent-connection cases are excluded offline.
runStoreConformance(createOfflineConformanceFixture, {
  durable: true,
  rollingWindows: false,
  maxMoneyUnits: 2n ** 63n - 1n,
  maxQuantityScale: 18,
});

// biome-ignore lint/correctness/noEmptyPattern: Vitest requires destructured context before the suite argument.
beforeAll(({}, suite) => classifyOfflineCases(conformanceCases(suite)));
// biome-ignore lint/correctness/noEmptyPattern: Vitest requires destructured context before the suite argument.
afterAll(async ({}, suite) => {
  try {
    assertOfflineCoverage(conformanceCases(suite));
  } finally {
    await closeOfflineConformancePool();
  }
});
