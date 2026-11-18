import "server-only";
import { createHash } from "node:crypto";
import { writeAudit } from "@/lib/auth/audit";
import { encryptSecret } from "@/lib/providers/crypto";
import { AssistantRequestError } from "./access";
import { assistantTransaction } from "./transaction";
import { byokCredentialRequestSchema } from "./wire";

export async function saveAssistantCredential(userId: string, input: unknown) {
  const value = byokCredentialRequestSchema.parse(input);
  const encryptedSecret = encryptSecret(value.apiKey);
  const versionHash = createHash("sha256").update(encryptedSecret).digest("hex");
  return assistantTransaction(async (tx) => {
    const credential = await tx.assistantCredential.upsert({
      where: { userId_provider: { userId, provider: value.provider } },
      create: {
        userId,
        provider: value.provider,
        encryptedSecret,
        versionHash,
        last4: value.apiKey.slice(-4),
      },
      update: { encryptedSecret, versionHash, last4: value.apiKey.slice(-4), status: "active" },
      select: { id: true, provider: true, last4: true, status: true },
    });
    await writeAudit(
      {
        action: "assistant.credential.saved",
        actorId: userId,
        targetType: "authentication",
        targetId: credential.id,
      },
      tx,
    );
    return credential;
  });
}
export async function removeAssistantCredential(userId: string, id: string) {
  return assistantTransaction(async (tx) => {
    const deleted = await tx.assistantCredential.deleteMany({ where: { id, userId } });
    if (deleted.count !== 1) throw new AssistantRequestError("byok_missing", 404);
    await writeAudit(
      {
        action: "assistant.credential.removed",
        actorId: userId,
        targetType: "authentication",
        targetId: id,
      },
      tx,
    );
    return { ok: true };
  });
}
