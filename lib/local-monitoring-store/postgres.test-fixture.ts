import { randomUUID } from "node:crypto";
import {
  businessLocationDatabase,
  seedBusinessProject,
} from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id-resources";
import { Prisma } from "@/lib/generated/prisma/client";
import type { LocalQuote } from "@/lib/local-monitoring/quote";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { ensureProjectSpendingBudget } from "@/lib/metering/project-budget-bootstrap";
import { meteringNamespace } from "@/lib/metering/runtime";
import { nativeProviderCatalog } from "@/lib/provider-rates/catalog-source";
import { loadNativeProviderQuote } from "@/lib/provider-rates/native-quote";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { formatQuantity } from "@usagekit/core";
import type { ProviderRequest } from "@usagekit/providers";
import { createLocalMeasurementTarget } from "./create-target";
import { createFixtureNormalizer, createFixturePorts } from "./postgres.test-ports";

export const localMeasurementMigration = "20261012200400_local_measurement_ownership";
const runtimeTables = [
  "local_measurement_points",
  "local_measurement_targets",
  "local_measurement_runs",
  "local_measurement_run_items",
  "local_measurement_target_owners",
];
/** Real full-chain owned DB inherited from the prior fixture. No partial schema or paid I/O. */
export async function localMeasurementDatabase() {
  const f = await businessLocationDatabase();
  try {
    const tables = await f.client.query<{ name: string | null }>(
      "SELECT to_regclass(name)::text AS name FROM unnest($1::text[]) AS t(name)",
      [runtimeTables],
    );
    if (
      tables.rows.length !== runtimeTables.length ||
      tables.rows.some(({ name }) => name === null)
    )
      throw new Error("Full neutral execution migration chain is missing.");
    const seed = await seedBusinessProject(f);
    const location = await f.db.location.create({
      data: {
        canonicalKey: randomUUID(),
        displayName: "Synthetic point seed",
        kind: "city",
        countryCode: "PL",
        gl: "pl",
        hl: "en",
        languageCode: "en",
        languageLabel: "English",
        primaryGeoName: "Synthetic",
        secondaryGeoName: "Synthetic",
      },
    });
    const keyword = await f.db.keyword.create({
      data: {
        projectId: seed.project.id,
        publicId: makePublicId("kw"),
        text: "synthetic local business",
        location: "Synthetic",
        locationId: location.id,
        device: "desktop",
      },
    });
    const encrypted = "synthetic-non-secret-envelope";
    const connection = await f.db.providerConnection.create({
      data: {
        publicId: makePublicId("conn"),
        projectId: seed.project.id,
        provider: "dataforseo",
        kind: "serp",
        status: "connected",
        enabled: true,
        credentialSource: "own",
        credentialsEncrypted: encrypted,
      },
    });
    const credentialVersion = ownCredentialVersion(connection.provider, connection.id, encrypted);
    if (!credentialVersion) throw new Error("Synthetic canonical custody hash missing.");
    let now = new Date();
    const clock = () => new Date(now.getTime());
    const request: ProviderRequest = {
      method: "POST",
      url: "https://api.dataforseo.com/v3/serp/google/organic/task_post",
      headers: { "content-type": "application/json" },
      body: [
        {
          keyword: keyword.text,
          location_coordinate: "52.0000000,21.0000000,12",
          language_code: "en",
          device: "desktop",
          depth: 10,
          priority: 1,
        },
      ],
    };
    const match = nativeProviderCatalog.match("dataforseo", request);
    if (match.operation === "unknown" || !match.operation.billable)
      throw new Error("Real native request descriptor is unavailable.");
    const operationId = match.operation.id;
    const quote = await f.db.$transaction(async (tx) => {
      await ensureProjectSpendingBudget(tx, meteringNamespace(), seed.project.id);
      return loadNativeProviderQuote(
        tx,
        {
          namespace: meteringNamespace(),
          principal: seed.owner.id,
          projectId: seed.project.id,
          connectionId: connection.id,
          provider: connection.provider,
          providerCredentialVersion: credentialVersion,
          fundingSource: "byok",
        },
        "local_scan",
        operationId,
        match.options,
        clock(),
      );
    });
    if (!quote.priceVersion) throw new Error("Real price version is required by the fixture.");
    const providerPriceVersion = quote.priceVersion;
    const native = quote.quantities.find(({ unit }) => unit === "cents");
    if (!native) throw new Error("Real native exact quote is missing.");
    const nativeAmount = formatQuantity(native);
    const counters = { submissions: 0, collections: 0 };
    const capability = {
      version: "fixture-only-local-capability-v1",
      provider: connection.provider,
      adapterVersion: "fixture-observation-v1",
      expiresAt: new Date(now.getTime() + 600_000).toISOString(),
      nativeBillingUnit: "cents",
      implementations: [
        {
          evidenceVersion: "fixture-observation-v1",
          engine: "google" as const,
          surface: "web_serp" as const,
          resultKind: "local_pack" as const,
          rankScale: "pack_slot" as const,
          point: true as const,
          devices: ["desktop" as const],
          operatingSystems: [null],
          languages: ["en"],
          maxCutoff: 10,
          zoomRange: null,
          asyncSubmitCollect: true as const,
        },
      ],
    };
    const ports = createFixturePorts({
      clock,
      seed,
      connection,
      keyword,
      credentialVersion,
      capability,
      providerPriceVersion,
      nativeAmount,
      request,
      operationId,
      counters,
    });
    const normalizer = createFixtureNormalizer(clock);
    const targetCommand = {
      projectId: seed.project.publicId,
      keywordId: keyword.publicId,
      latitude: "52",
      longitude: "21",
      engine: "google",
      surface: "web_serp",
      resultKind: "local_pack",
      rankScale: "pack_slot",
      language: "en",
      device: "desktop",
      operatingSystem: null,
      cutoff: 10,
      zoom: null,
    };
    async function target(longitude = "21") {
      return createLocalMeasurementTarget(
        { ...targetCommand, longitude },
        seed.writerContext,
        ports.policy,
        f.db,
      );
    }
    function launch(
      targets: readonly Awaited<ReturnType<typeof target>>[],
      idempotencyKey = randomUUID(),
    ) {
      const local: LocalQuote = {
        version: 1,
        projectId: seed.project.id,
        expectedTargetKeys: targets.map(({ target }) => executionTargetKey(target)),
        effectiveOptions: { surface: "web_serp", cutoff: "10" },
        capabilityVersion: capability.version,
        provider: connection.provider,
        adapterVersion: capability.adapterVersion,
        providerPriceVersion,
        nativeEstimates: [
          {
            unit: "cents",
            amount: new Prisma.Decimal(nativeAmount).times(targets.length).toFixed(),
          },
        ],
        issuedAt: clock().toISOString(),
        expiresAt: new Date(clock().getTime() + 120_000).toISOString(),
      };
      return {
        projectId: seed.project.publicId,
        connectionId: connection.publicId,
        targetIds: targets.map(({ id }) => id),
        idempotencyKey,
        quote: local,
        source: "app",
        trigger: "manual",
      };
    }
    return {
      ...f,
      ...seed,
      keyword,
      connection,
      ports,
      target,
      targetCommand,
      launch,
      normalizer,
      counters,
      clock,
      advance: (ms: number) => {
        now = new Date(now.getTime() + ms);
      },
    };
  } catch (error) {
    await f.close();
    throw error;
  }
}
export type LocalPgFixture = Awaited<ReturnType<typeof localMeasurementDatabase>>;
