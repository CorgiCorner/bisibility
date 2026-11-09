import "server-only";
import { prisma } from "@/lib/db/prisma";
import { collectTrafficHeartbeat } from "./heartbeat-traffic-data";
import type { OperationalHeartbeat } from "./heartbeat-types";

export async function collectOperationalHeartbeat(now: Date): Promise<OperationalHeartbeat> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [traffic, bootstrapEvents, undeliveredEvents] = await Promise.all([
    collectTrafficHeartbeat(now, since),
    prisma.opsEvent.findMany({
      orderBy: { createdAt: "desc" },
      select: { fields: true },
      take: 10,
      where: { createdAt: { gte: since }, kind: "schedule_bootstrap", severity: "error" },
    }),
    prisma.opsEvent.count({ where: { deliveredAt: null } }),
  ]);
  return {
    bootstrapErrors: bootstrapEvents.map((event) => {
      const fields =
        event.fields && typeof event.fields === "object" && !Array.isArray(event.fields)
          ? (event.fields as Record<string, unknown>)
          : {};
      const scheduleId = fields["Schedule ID"];
      return typeof scheduleId === "string" ? `${scheduleId}: failed` : "Schedule bootstrap failed";
    }),
    traffic,
    undeliveredEvents,
  };
}
