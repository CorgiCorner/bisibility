import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { definitionDatabaseFixture } from "@/lib/measurement-definitions/postgres.test-fixture";
import { projectDefaultsPatchSchema, projectDefaultsSchema } from "@/lib/schemas/project";
import { resolveKeywordLocationUsingStore } from "@/lib/serp/location-service";
import { createPrismaLocationStore } from "@/lib/serp/location-store";
import type { DefaultsPreview } from "@/lib/settings/reviewed-defaults-contract";
import type { DefaultsHostContext } from "./defaults-authority";

export async function reviewedDefaultsFixture() {
  const f = await definitionDatabaseFixture();
  try {
    await f.db.$transaction((tx) =>
      resolveKeywordLocationUsingStore(
        { projectId: f.project.project.id, selection: { kind: "country", countryCode: "US" } },
        createPrismaLocationStore(tx),
      ),
    );
    await f.db.projectDefaults.create({
      data: {
        projectId: f.project.project.id,
        country: "United States",
        locationKey: "US",
        device: "desktop",
        serpDepth: 20,
        serpStopOnMatch: false,
        frequency: "manual",
        timezone: "UTC",
        jitterMinutes: 0,
      },
    });
    const key = await f.db.apiKey.create({
      data: {
        publicId: makePublicId("key"),
        projectId: f.project.project.id,
        name: "Synthetic defaults writer",
        prefix: "fixture",
        hashedKey: randomUUID(),
        scopes: ["write"],
      },
    });
    const keyContext: DefaultsHostContext = {
      actor: { id: key.id },
      auditActorId: null,
      credential: { kind: "project_key", id: key.id },
    };
    return { ...f, key, keyContext };
  } catch (error) {
    await f.close();
    throw error;
  }
}
export const defaultsForm = (projectId: string) => ({
  kind: "form" as const,
  values: projectDefaultsSchema.parse({
    projectId,
    country: "United States",
    locationKey: "US",
    device: "desktop",
    frequency: "daily",
    timezone: "UTC",
    jitterMinutes: 0,
    serpDepth: 50,
    serpStopOnMatch: false,
  }),
});
export const defaultsPatch = (projectId: string, values: object) => ({
  kind: "patch" as const,
  values: projectDefaultsPatchSchema.parse({
    projectId,
    frequency: "manual",
    timezone: "UTC",
    jitterMinutes: 0,
    ...values,
  }),
});
export const confirmDefaults = (preview: DefaultsPreview) => ({
  expectedSourceHash: preview.expectedSourceHash,
  expectedRevision: preview.expectedRevision,
  previewToken: preview.previewToken,
  confirmed: true as const,
  idempotencyKey: randomUUID(),
});
