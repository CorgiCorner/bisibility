import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { expect, it } from "vitest";
import { queuedSubmissionDiagnostic } from "./queued-submit-diagnostics";

it("retains a closed-set admission cause without logging database URLs or provider secrets", () => {
  const error = new ProviderUsagePersistenceError({
    phase: "admission",
    cause: Object.assign(new Error("postgresql://secret@example.com/db"), {
      name: "PrismaClientKnownRequestError",
      code: "P2028",
    }),
  });
  const diagnostic = queuedSubmissionDiagnostic("batch", "connection", "not_sent", error);
  expect(diagnostic).toMatchObject({
    phase: "not_sent",
    usageFailure: {
      phase: "admission",
      causes: expect.arrayContaining([
        expect.objectContaining({ code: "P2028", name: "PrismaClientKnownRequestError" }),
      ]),
    },
  });
  expect(JSON.stringify(diagnostic)).not.toMatch(/postgresql|secret@example/);
});
