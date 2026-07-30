import { consume, resetRateLimitStateForTests } from "@/lib/api/ratelimit";

const CREATE_LIMIT = 8;
const CREATE_WINDOW_SECONDS = 15 * 60;
const RESEND_LIMIT = 1;
const RESEND_WINDOW_SECONDS = 60;

function retryLabel(resetAt: number) {
  const seconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  if (seconds >= 120) {
    return `${Math.ceil(seconds / 60)} minutes`;
  }
  return `${seconds} seconds`;
}

async function consumeInviteLimit(input: {
  bucketKey: string;
  limit: number;
  prefix: string;
  windowSeconds: number;
}) {
  try {
    return await consume(input);
  } catch {
    throw new Error("Invitations are temporarily unavailable. Try again shortly.");
  }
}

export async function assertInviteCreateAllowed(actorId: string, projectId: string) {
  const result = await consumeInviteLimit({
    bucketKey: `${actorId}:${projectId}`,
    limit: CREATE_LIMIT,
    prefix: "bisibility:team-invite:create",
    windowSeconds: CREATE_WINDOW_SECONDS,
  });
  if (!result.success) {
    throw new Error(
      `Too many invitations have been sent. Try again in ${retryLabel(result.resetAt)}.`,
    );
  }
}

export async function assertInviteResendAllowed(inviteId: string) {
  const result = await consumeInviteLimit({
    bucketKey: inviteId,
    limit: RESEND_LIMIT,
    prefix: "bisibility:team-invite:resend",
    windowSeconds: RESEND_WINDOW_SECONDS,
  });
  if (!result.success) {
    throw new Error(
      `This invitation was sent recently. Try again in ${retryLabel(result.resetAt)}.`,
    );
  }
}

export function resetInviteRateLimitStateForTests() {
  resetRateLimitStateForTests();
}
