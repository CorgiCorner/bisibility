import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { prisma } from "@/lib/db/prisma";
import { deploymentMode } from "@/lib/deployment/deployment";
import { decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  INSTANCE_MAIL_CONFIG_ID,
  type InstanceMailRuntime,
  type InstanceMailSettingsView,
  isInstanceMailProvider,
  setInstanceMailRuntime,
} from "./instance-mail-runtime";
import type { EmailProviderId } from "./types";

const credentialBlobSchema = z.object({
  resendApiKey: z.string().nullable().optional(),
  sesAccessKeyId: z.string().nullable().optional(),
  sesRegion: z.string().nullable().optional(),
  sesSecretAccessKey: z.string().nullable().optional(),
  smtpHost: z.string().nullable().optional(),
  smtpPassword: z.string().nullable().optional(),
  smtpPort: z.number().int().nullable().optional(),
  smtpUsername: z.string().nullable().optional(),
});

export type InstanceMailCredentialInput = {
  resendApiKey?: string;
  sesAccessKeyId?: string;
  sesRegion?: string;
  sesSecretAccessKey?: string;
  smtpHost?: string;
  smtpPassword?: string;
  smtpPort?: number;
  smtpUsername?: string;
};

export type InstanceMailStatus = {
  credentialsConfigured: boolean;
  provider: EmailProviderId | null;
  sender: string;
};

export class InstanceMailSettingsError extends Error {
  constructor(readonly code: "invalid") {
    super(code);
    this.name = "InstanceMailSettingsError";
  }
}

function emptyRuntime(provider: EmailProviderId, sender: string): InstanceMailRuntime {
  return {
    provider,
    resendApiKey: null,
    sender,
    sesAccessKeyId: null,
    sesRegion: null,
    sesSecretAccessKey: null,
    smtpHost: null,
    smtpPassword: null,
    smtpPort: null,
    smtpUsername: null,
  };
}

function runtimeFromCipher(provider: EmailProviderId, sender: string, cipher: string) {
  const parsed = credentialBlobSchema.parse(JSON.parse(decryptSecret(cipher)));
  return {
    ...emptyRuntime(provider, sender),
    resendApiKey: parsed.resendApiKey ?? null,
    sesAccessKeyId: parsed.sesAccessKeyId ?? null,
    sesRegion: parsed.sesRegion ?? null,
    sesSecretAccessKey: parsed.sesSecretAccessKey ?? null,
    smtpHost: parsed.smtpHost ?? null,
    smtpPassword: parsed.smtpPassword ?? null,
    smtpPort: parsed.smtpPort ?? null,
    smtpUsername: parsed.smtpUsername ?? null,
  } satisfies InstanceMailRuntime;
}

export async function refreshInstanceMailRuntime() {
  if (deploymentMode() === "cloud") {
    setInstanceMailRuntime(null);
    return;
  }
  try {
    const row = await prisma.instanceMailConfig.findUnique({
      where: { id: INSTANCE_MAIL_CONFIG_ID },
    });
    if (!row || !isInstanceMailProvider(row.provider)) {
      setInstanceMailRuntime(null);
      return;
    }
    setInstanceMailRuntime(runtimeFromCipher(row.provider, row.sender, row.credentialsCipher));
  } catch {
    if (process.env.NODE_ENV !== "test") {
      console.error("[email] Stored mail settings could not be read.");
    }
    setInstanceMailRuntime(null);
  }
}

export async function readInstanceMailStatus(): Promise<InstanceMailStatus> {
  const row = await prisma.instanceMailConfig.findUnique({
    select: { credentialsCipher: true, provider: true, sender: true },
    where: { id: INSTANCE_MAIL_CONFIG_ID },
  });
  if (!row || !isInstanceMailProvider(row.provider)) {
    return { credentialsConfigured: false, provider: null, sender: "" };
  }
  return {
    credentialsConfigured: row.credentialsCipher.trim().length > 0,
    provider: row.provider,
    sender: row.sender,
  };
}

export async function loadInstanceMailSettingsView(): Promise<InstanceMailSettingsView> {
  const session = await getInstanceAdminSession();
  if (!session) notFound();
  const [user, accounts, status] = await Promise.all([
    prisma.user.findUnique({
      select: { twoFactorEnabled: true },
      where: { id: session.user.id },
    }),
    prisma.account.findMany({
      select: { password: true, providerId: true },
      where: { userId: session.user.id },
    }),
    readInstanceMailStatus(),
  ]);
  return {
    ...status,
    envOverridesSaved: Boolean(
      process.env.EMAIL_PROVIDER?.trim() || process.env.EMAIL_FROM?.trim(),
    ),
    hasPasswordCredential: accounts.some(
      (account) => account.providerId === "credential" && Boolean(account.password),
    ),
    twoFactorEnabled: user?.twoFactorEnabled === true,
  };
}

function auditMailChange(
  actorId: string,
  client: Parameters<typeof writeAudit>[1],
  after: { credentialsReplaced: boolean; provider: string; senderChanged: boolean },
) {
  return writeAudit(
    {
      action: "instance_admin.mail_settings.save",
      actorId,
      after,
      targetId: "instance-mail",
      targetType: "instance_ops",
    },
    client,
  );
}

export async function saveInstanceMailConfig(input: {
  actorId: string;
  credentials: InstanceMailCredentialInput | null;
  provider: EmailProviderId;
  sender: string;
}) {
  const existing = await prisma.instanceMailConfig.findUnique({
    where: { id: INSTANCE_MAIL_CONFIG_ID },
  });
  if (!input.credentials && (!existing || existing.provider !== input.provider)) {
    throw new InstanceMailSettingsError("invalid");
  }
  const senderChanged = (existing?.sender ?? "") !== input.sender;
  await prisma.$transaction(async (transaction) => {
    if (input.credentials) {
      await transaction.instanceMailConfig.upsert({
        create: {
          credentialsCipher: encryptSecret(JSON.stringify(input.credentials)),
          id: INSTANCE_MAIL_CONFIG_ID,
          provider: input.provider,
          sender: input.sender,
        },
        update: {
          credentialsCipher: encryptSecret(JSON.stringify(input.credentials)),
          provider: input.provider,
          sender: input.sender,
        },
        where: { id: INSTANCE_MAIL_CONFIG_ID },
      });
    } else if (senderChanged) {
      await transaction.instanceMailConfig.update({
        data: { sender: input.sender },
        where: { id: INSTANCE_MAIL_CONFIG_ID },
      });
    }
    await auditMailChange(input.actorId, transaction, {
      credentialsReplaced: input.credentials !== null,
      provider: input.provider,
      senderChanged,
    });
  });
  await refreshInstanceMailRuntime();
}

export async function clearInstanceMailConfig(actorId: string) {
  const existing = await prisma.instanceMailConfig.findUnique({
    select: { provider: true },
    where: { id: INSTANCE_MAIL_CONFIG_ID },
  });
  if (!existing) return;
  await prisma.$transaction(async (transaction) => {
    await transaction.instanceMailConfig.delete({ where: { id: INSTANCE_MAIL_CONFIG_ID } });
    await writeAudit(
      {
        action: "instance_admin.mail_settings.clear",
        actorId,
        after: { result: "cleared" },
        before: { provider: existing.provider },
        targetId: "instance-mail",
        targetType: "instance_ops",
      },
      transaction,
    );
  });
  setInstanceMailRuntime(null);
}
