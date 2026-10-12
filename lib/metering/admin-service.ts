import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { z } from "zod";
import { openAdminCursor, sealAdminCursor } from "./admin-cursor";
import { readMeteringAdmin } from "./admin-data";
import type { MeteringAdminPage } from "./admin-types";

const inputSchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    project: z.union([z.literal(""), z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)]).optional(),
    usageCursor: z.string().max(32768).optional(),
    exceptionCursor: z.string().max(32768).optional(),
  })
  .strict();

export async function getMeteringAdminPage(input: unknown): Promise<MeteringAdminPage> {
  const session = await requireInstanceAdmin();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid metering filter");
  const query = parsed.data;
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7),
  );
  const month = query.month ?? months[0] ?? now.toISOString().slice(0, 7);
  const project = query.project || null;
  const scope = { actor: session.user.id, month, project };
  const usagePage = openAdminCursor(query.usageCursor, scope, "usage");
  const exceptionPage = openAdminCursor(query.exceptionCursor, scope, "exceptions");
  const exceptionTo = exceptionPage?.to ?? now.toISOString();
  await writeAudit({
    action: "instance_admin.metering_viewed",
    actorId: session.user.id,
    targetType: "instance_ops",
    targetId: "metering",
    after: { month, project: project ?? "all" },
  });
  try {
    const data = await readMeteringAdmin({
      month,
      project,
      usageCursor: usagePage?.cursor,
      exceptionCursor: exceptionPage?.cursor,
      exceptionTo,
    });
    return {
      month,
      project,
      months,
      data: {
        ...data,
        usage: {
          ...data.usage,
          nextCursor: sealAdminCursor(data.usage.nextCursor, scope, "usage", now.toISOString()),
        },
        exceptions: {
          ...data.exceptions,
          nextCursor: sealAdminCursor(data.exceptions.nextCursor, scope, "exceptions", exceptionTo),
        },
      },
    };
  } catch {
    console.error("[metering] admin data unavailable", {
      month,
      projectSelected: project !== null,
    });
    return { month, project, months, data: null };
  }
}
