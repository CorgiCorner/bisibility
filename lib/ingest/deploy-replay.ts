import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getRedisClient, redisConfigured } from "@/lib/redis/redis";

const REPLAY_WINDOW_SECONDS = 60 * 60;
const CLAIM_SECONDS = 30;

type StoredClaim = {
  expiresAt: number;
  token: string;
};

type AcquiredClaim = {
  key: string;
  status: "acquired";
  storage: "memory" | "redis";
  token: string;
};

export type DeployReplayClaim = AcquiredClaim | { status: "duplicate" } | { status: "untracked" };

const memoryClaims = new Map<string, StoredClaim>();

function replayKey(hookId: string, deploymentId: string) {
  const digest = createHash("sha256").update(`${hookId}\0${deploymentId}`).digest("base64url");
  return `bisibility:ingest:deploy-replay:${digest}`;
}

function memoryClaim(key: string, token: string): DeployReplayClaim {
  const now = Date.now();
  const current = memoryClaims.get(key);
  if (current && current.expiresAt > now) {
    return { status: "duplicate" };
  }
  memoryClaims.set(key, { expiresAt: now + CLAIM_SECONDS * 1000, token });
  return { key, status: "acquired", storage: "memory", token };
}

export async function claimDeployReplay(
  hookId: string,
  deploymentId: string | undefined,
): Promise<DeployReplayClaim> {
  if (!deploymentId) return { status: "untracked" };

  const key = replayKey(hookId, deploymentId);
  const token = randomUUID();
  if (redisConfigured()) {
    try {
      const redis = await getRedisClient();
      const result = await redis?.set(key, token, { EX: CLAIM_SECONDS, NX: true });
      if (result === "OK") {
        return { key, status: "acquired", storage: "redis", token };
      }
      if (result === null) return { status: "duplicate" };
    } catch {
      // The in-process claim preserves local safety while Redis recovers.
    }
  }

  return memoryClaim(key, token);
}

export async function completeDeployReplay(claim: DeployReplayClaim) {
  if (claim.status !== "acquired") return;

  if (claim.storage === "redis") {
    try {
      const redis = await getRedisClient();
      await redis?.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('set', KEYS[1], 'complete', 'EX', ARGV[2]) else return 0 end",
        {
          arguments: [claim.token, String(REPLAY_WINDOW_SECONDS)],
          keys: [claim.key],
        },
      );
      return;
    } catch {
      // Keep a local completion marker when the shared store becomes unavailable.
    }
  }

  memoryClaims.set(claim.key, {
    expiresAt: Date.now() + REPLAY_WINDOW_SECONDS * 1000,
    token: "complete",
  });
}

export async function releaseDeployReplay(claim: DeployReplayClaim) {
  if (claim.status !== "acquired") return;

  if (claim.storage === "redis") {
    try {
      const redis = await getRedisClient();
      await redis?.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        { arguments: [claim.token], keys: [claim.key] },
      );
      return;
    } catch {
      return;
    }
  }

  if (memoryClaims.get(claim.key)?.token === claim.token) {
    memoryClaims.delete(claim.key);
  }
}

export function resetDeployReplayStateForTests() {
  memoryClaims.clear();
}
