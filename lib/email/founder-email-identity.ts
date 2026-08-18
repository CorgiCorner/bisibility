import "server-only";

import { requireEmailFrom } from "./from";

export type FounderEmailIdentity = {
  founderName: string | null;
  from: string;
  replyTo: string;
};

function configuredValue(value: string | undefined) {
  return value?.trim() || null;
}

export function resolveFounderEmailIdentity(): FounderEmailIdentity {
  const from = configuredValue(process.env.EMAIL_FOUNDER_FROM) ?? requireEmailFrom();
  const rawFounderName =
    configuredValue(process.env.EMAIL_FOUNDER_NAME)?.replace(/\s+/g, " ").trim() ?? null;

  return { founderName: rawFounderName, from, replyTo: from };
}
