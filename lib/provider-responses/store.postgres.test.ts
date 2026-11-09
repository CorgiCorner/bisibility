import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { expect, it } from "vitest";
import { readProviderResponse, storeProviderResponse } from "./store";

const enabled = process.env.BISIBILITY_PROVIDER_RESPONSE_POSTGRES === "1";
it.skipIf(!enabled)(
  "round trips encrypted native payloads in the local review database and isolates projects",
  async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.port !== "5432" ||
      url.pathname !== "/bisibility"
    )
      throw new Error("Local review database required");
    const projectId = process.env.BISIBILITY_RESPONSE_TEST_PROJECT_ID;
    if (!projectId) throw new Error("Test project required");
    const operationId = `native-response-test-${randomUUID()}`;
    try {
      await storeProviderResponse(
        { projectId, provider: "fixture", feature: "research", operationId },
        { status: 200, body: { rows: [{ position: 19 }], api_key: "secret" } },
      );
      const row = await prisma.providerResponseCapture.findFirstOrThrow({
        where: { projectId, operationId },
      });
      expect(row.payloadEncrypted).not.toContain("secret");
      expect(await readProviderResponse(projectId, row.id)).toEqual({
        rows: [{ position: 19 }],
        api_key: "[redacted]",
      });
      expect(await readProviderResponse(`wrong-${projectId}`, row.id)).toBeNull();
      await prisma.providerResponseCapture.update({
        where: { id: row.id },
        data: { expiresAt: new Date(0) },
      });
      expect(await readProviderResponse(projectId, row.id)).toBeNull();
    } finally {
      await prisma.providerResponseCapture.deleteMany({ where: { projectId, operationId } });
      await prisma.$disconnect();
    }
  },
);
