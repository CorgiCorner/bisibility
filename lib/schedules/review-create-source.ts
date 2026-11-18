import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { inlineCron } from "@/lib/markets/create-schedule";
import { termsForMarketCreate } from "@/lib/markets/create-source";
import { loadMarketDeviceTargets } from "@/lib/markets/device-targets-load";
import type { KeywordCreateChange } from "@/lib/schemas/keyword-create-review";
import { ScheduleReviewStaleError } from "./errors";

export async function resolveCreateSource(
  client: Pick<
    Prisma.TransactionClient,
    "keyword" | "projectMarket" | "checkSchedule" | "projectDefaults"
  >,
  projectId: string,
  input: KeywordCreateChange,
): Promise<{ input: KeywordCreateChange; snapshot: unknown }> {
  const source = input.source;
  if (!source) return { input, snapshot: null };
  if (source.kind === "market-create") {
    const data = source.input;
    const terms = await termsForMarketCreate(client, projectId, data.method);
    const schedule = data.schedule;
    const defaults = await client.projectDefaults.findUnique({
      where: { projectId },
      select: { timezone: true },
    });
    return {
      input: {
        ...input,
        scheduleId: schedule?.kind === "existing" ? schedule.scheduleId : null,
        cadence:
          schedule?.kind === "inline"
            ? {
                frequency: schedule.frequency,
                cronExpression: inlineCron(schedule),
                jitterMinutes: 60,
                timezone: defaults?.timezone ?? "UTC",
                serpDepth: null,
              }
            : null,
        keywords: terms.flatMap((term) =>
          data.devices.map((device) => ({
            keyword: term.text,
            device,
            locationKey: data.canonicalKey,
          })),
        ),
      },
      snapshot: [...terms].sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)),
    };
  }
  const current = await loadMarketDeviceTargets(client, projectId, source.input);
  if (current.outcome !== "loaded") throw new ScheduleReviewStaleError("preview_mismatch");
  return {
    input: {
      ...input,
      scheduleId: source.input.scheduleId,
      cadence: null,
      keywords: current.plan.missing.map((row) => ({
        keyword: row.text,
        device: source.input.device,
        locationKey: current.market.location.canonicalKey,
      })),
    },
    snapshot: current.plan.fingerprint,
  };
}
