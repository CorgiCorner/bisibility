import { randomUUID } from "node:crypto";
import { createBusinessLocationFor } from "@/lib/business-location-store/location-write";
import {
  businessLocationDatabase,
  identityCommand,
  seedBusinessProject,
} from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id-resources";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import { monitorDefinitionFixture } from "./fixture";
import type { MonitorScheduleConsent } from "./model";

export async function monitorDatabase() {
  const f = await businessLocationDatabase();
  try {
    const table = await f.client.query("SELECT to_regclass('public.local_monitors') AS name");
    if (!table.rows[0]?.name)
      throw new Error("Materialize the proposed monitor migration before running this fixture.");
    const seed = await seedBusinessProject(f);
    const identity = await createBusinessLocationFor(
      identityCommand(seed.project.publicId, "18446744073709551615"),
      seed.writerContext,
      f.db,
    );
    if (identity.receipt.kind !== "identity") throw new Error("Synthetic identity missing.");
    const location = await f.db.location.create({
      data: {
        canonicalKey: randomUUID(),
        displayName: "Synthetic",
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
        text: "Synthetic dentist",
        location: "Synthetic",
        locationId: location.id,
        device: "desktop",
      },
    });
    const schedule = await f.db.checkSchedule.create({
      data: {
        projectId: seed.project.id,
        publicId: makePublicId("sch"),
        name: "Synthetic calendar",
        frequency: "daily",
        timeOfDay: "10:00",
        timezone: "Europe/Warsaw",
        jitterMinutes: 0,
      },
    });
    const command = {
      projectId: seed.project.publicId,
      idempotencyKey: randomUUID(),
      definition: {
        ...monitorDefinitionFixture,
        locationId: identity.receipt.publicId,
        identityRevisionId: identity.receipt.revisionId,
        keywordIds: [keyword.publicId],
      },
    };
    let consents = 0;
    const consent: MonitorScheduleConsent = {
      verify: async (_tx, input) => {
        consents += 1;
        if (input.token !== "synthetic-explicit-confirmation")
          throw new Error("Synthetic confirmation denied.");
        return {
          approvalDigest: localDigest([
            input.actorId,
            input.projectId,
            input.monitorRevisionId,
            input.calendar,
          ]),
          capabilityVersion: "synthetic-not-live-v1",
        };
      },
    };
    return { ...f, ...seed, keyword, schedule, command, consent, consents: () => consents };
  } catch (error) {
    await f.close();
    throw error;
  }
}
