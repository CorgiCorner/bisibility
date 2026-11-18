import { createHash } from "node:crypto";
import { z } from "zod";

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);
const objectSchema = z.record(z.string(), jsonValue);
const scopeKey =
  /^(?:project_?id|owner_?id|actor_?id|user_?id|wallet_?id|principal_?id|organization_?id|tenant_?id|credential_?id|access_?credential|__proto__|prototype|constructor)$/i;
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !scopeKey.test(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, clean(item)]),
    );
  return value;
}
/** The model never selects project, actor, principal or wallet. */
export function bindAssistantToolArgs(
  input: unknown,
  projectPublicId: string,
): Record<string, unknown> {
  if (!/^prj_[A-Za-z0-9]{1,40}$/.test(projectPublicId)) throw new Error("Invalid project binding");
  const parsed = objectSchema.parse(input);
  if (JSON.stringify(parsed).length > 20000) throw new Error("Tool arguments too large");
  const sanitized = clean(parsed);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized))
    throw new Error("Invalid tool arguments");
  return { ...sanitized, project_id: projectPublicId };
}
export function assistantArgsHash(args: Record<string, unknown>) {
  const stable = clean(args);
  return createHash("sha256")
    .update(JSON.stringify({ ...(stable as Record<string, unknown>), project_id: args.project_id }))
    .digest("hex");
}
