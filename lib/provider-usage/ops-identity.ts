import { createHash } from "node:crypto";

export function providerUsageOpsKey(kind: string, namespace: string) {
  const instance = createHash("sha256")
    .update(process.env.SITE_URL ?? "self-host")
    .update("\0")
    .update(namespace)
    .digest("hex")
    .slice(0, 16);
  return `${kind}:${instance}`;
}
