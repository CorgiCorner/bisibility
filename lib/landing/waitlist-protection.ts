import { createHash } from "node:crypto";
import { consume } from "@/lib/api/ratelimit";
import { getSession } from "@/lib/auth/session";
import { deploymentMode } from "@/lib/deployment/deployment";
import { resolveClientIp } from "@/lib/http/client-ip";
import { verifyHumanChallenge } from "@/lib/verification/human-verification";
import { headers } from "next/headers";
import { WaitlistProtectionError } from "./waitlist-result";
import type { WaitlistSource } from "./waitlist-schema";

export const WAITLIST_RATE_LIMITED = "Too many requests. Please try again later.";
export const WAITLIST_VERIFICATION_FAILED = "Verification failed. Please try again.";

const UNIDENTIFIED_SENTINEL = "unidentified";
const TEN_MINUTES = 600;
const ONE_HOUR = 3_600;
const ONE_DAY = 86_400;

const settingsSources: ReadonlySet<WaitlistSource> = new Set([
  "settings_feedback",
  "settings_notify",
]);

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export type ClientIdentity = {
  clientDigest: string;
  rawIp: string | null;
};

export async function resolveClientIdentity(): Promise<ClientIdentity> {
  const requestHeaders = await headers();
  const rawIp = resolveClientIp(requestHeaders);
  return {
    clientDigest: hashIdentifier(rawIp ?? UNIDENTIFIED_SENTINEL),
    rawIp,
  };
}

export async function enforceWaitlistRateLimits(
  clientDigest: string,
  emailDigest: string,
): Promise<void> {
  const buckets = [
    {
      bucketKey: clientDigest,
      limit: 5,
      prefix: "bisibility:waitlist:client:short",
      windowSeconds: TEN_MINUTES,
    },
    {
      bucketKey: clientDigest,
      limit: 20,
      prefix: "bisibility:waitlist:client:daily",
      windowSeconds: ONE_DAY,
    },
    {
      bucketKey: emailDigest,
      limit: 3,
      prefix: "bisibility:waitlist:email:hourly",
      windowSeconds: ONE_HOUR,
    },
  ];

  for (const input of buckets) {
    const result = await consume(input);
    if (!result.success) {
      throw new WaitlistProtectionError("rate_limited", WAITLIST_RATE_LIMITED);
    }
  }
}

export async function enforceDistinctNewEmailLimit(clientDigest: string): Promise<void> {
  const result = await consume({
    bucketKey: clientDigest,
    limit: 10,
    prefix: "bisibility:waitlist:client:new-emails",
    windowSeconds: ONE_DAY,
  });
  if (!result.success) {
    throw new WaitlistProtectionError("rate_limited", WAITLIST_RATE_LIMITED);
  }
}

export async function enforceHumanVerification(
  source: WaitlistSource,
  verificationToken: string | undefined,
  rawIp: string | null,
  clientDigest: string,
): Promise<void> {
  if (deploymentMode() !== "cloud") {
    return;
  }

  if (settingsSources.has(source)) {
    const session = await getSession();
    if (session) {
      return;
    }
  }

  const result = await verifyHumanChallenge(verificationToken, rawIp, clientDigest);
  if (!result.success) {
    throw new WaitlistProtectionError(
      result.code,
      result.code === "rate_limited" ? WAITLIST_RATE_LIMITED : WAITLIST_VERIFICATION_FAILED,
    );
  }
}
