import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import { z } from "zod";

const envelope = z.object({
  type: z.literal("metering-admin"),
  actor: z.string(),
  month: z.string(),
  project: z.string().nullable(),
  kind: z.enum(["usage", "exceptions"]),
  cursor: z.string().min(1),
  to: z.iso.datetime(),
});
export type AdminCursorScope = { actor: string; month: string; project: string | null };
export function openAdminCursor(
  value: string | undefined,
  scope: AdminCursorScope,
  kind: "usage" | "exceptions",
) {
  if (!value) return undefined;
  try {
    if (value.length > 32768) throw new Error();
    const parsed = envelope.parse(JSON.parse(decryptSecret(value)));
    if (
      parsed.actor !== scope.actor ||
      parsed.month !== scope.month ||
      parsed.project !== scope.project ||
      parsed.kind !== kind
    )
      throw new Error();
    return parsed;
  } catch {
    throw new Error("Invalid metering cursor");
  }
}
export function sealAdminCursor(
  cursor: string | null,
  scope: AdminCursorScope,
  kind: "usage" | "exceptions",
  to: string,
) {
  return cursor
    ? encryptSecret(JSON.stringify({ type: "metering-admin", ...scope, kind, cursor, to }))
    : null;
}
