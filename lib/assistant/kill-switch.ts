import "server-only";
import { type AuditClient, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { AssistantRequestError } from "./access";
import type { FundingMode } from "./wire";

/**
 * Runtime kill switch for AI provider calls, stored as an instance setting so it changes without a
 * deploy and is read fresh (uncached) at the start of every turn and every step, before any
 * reservation or provider call:
 * - "on": normal operation;
 * - "hosted_off": calls on the platform's AI provider keys stop, users' own keys keep working;
 * - "all_off": the assistant refuses every turn.
 * An instance admin flips it (audited, with a reason); the spend breaker and the external usage
 * dashboard raise it to "hosted_off" on their own.
 *
 * The level names match the product plan. Rows written before the rename hold the
 * legacy names "off", "credits" and "all"; they are mapped on read (LEGACY_KILL_SWITCH_LEVELS) and
 * never rewritten, so a rolling deploy and old audit records keep their meaning. Every write
 * stores the current names.
 */
export const ASSISTANT_KILL_SWITCH_SETTING = "assistant.killSwitch";
export const ASSISTANT_KILL_SWITCH_LEVELS = ["on", "hosted_off", "all_off"] as const;
export type AssistantKillSwitch = (typeof ASSISTANT_KILL_SWITCH_LEVELS)[number];

/** Stored values from before the rename, read as the level they always meant. */
export const LEGACY_KILL_SWITCH_LEVELS: Readonly<Record<string, AssistantKillSwitch>> = {
  off: "on",
  credits: "hosted_off",
  all: "all_off",
};

/** Strictness order: a higher rank refuses more. Automatic raises only ever move up this order. */
export const KILL_SWITCH_RANK: Readonly<Record<AssistantKillSwitch, number>> = {
  on: 0,
  hosted_off: 1,
  all_off: 2,
};

/** Calls on platform keys stop, users' own keys keep working. */
export const HOSTED_OFF_LEVEL = "hosted_off" satisfies AssistantKillSwitch;

/**
 * Which paid calls the "hosted_off" level stops. Today: the assistant's calls on the platform's
 * LLM provider keys (funding "credits"). DataForSEO's LLM responses are deliberately not covered
 * (owner decision B5); adding another family later means adding it here and calling
 * killSwitchStops() from that family's dispatch gate.
 */
export type KillSwitchScope = "platform_llm";
const HOSTED_OFF_SCOPES: ReadonlySet<KillSwitchScope> = new Set(["platform_llm"]);

/** True when this switch level stops paid calls of the given scope. */
export function killSwitchStops(level: AssistantKillSwitch, scope: KillSwitchScope) {
  if (level === "all_off") return true;
  return level === "hosted_off" && HOSTED_OFF_SCOPES.has(scope);
}

/**
 * Shown to instance admins while the switch was last raised by an external spend monitor:
 * when (ISO time), why, and the spend against the cap it reported (USD decimal strings).
 */
export type KillSwitchTripNotice = {
  at: string;
  reason: "provider_cap_exceeded" | "manual_from_dashboard" | null;
  spendUsd: string | null;
  capUsd: string | null;
};

type SettingsClient = Pick<Prisma.TransactionClient, "instanceSetting">;

/**
 * A missing row means "on". A legacy name maps to its current level. Any other value that is not
 * a known level fails closed to "all_off": a corrupted or unknown setting must never let paid
 * calls through.
 */
export function parseKillSwitch(value: string | null | undefined): AssistantKillSwitch {
  if (value === null || value === undefined) return "on";
  if (ASSISTANT_KILL_SWITCH_LEVELS.includes(value as AssistantKillSwitch))
    return value as AssistantKillSwitch;
  return Object.hasOwn(LEGACY_KILL_SWITCH_LEVELS, value)
    ? (LEGACY_KILL_SWITCH_LEVELS[value] as AssistantKillSwitch)
    : "all_off";
}

export async function readAssistantKillSwitch(
  client: SettingsClient = prisma,
): Promise<AssistantKillSwitch> {
  const row = await client.instanceSetting.findUnique({
    select: { value: true },
    where: { key: ASSISTANT_KILL_SWITCH_SETTING },
  });
  return parseKillSwitch(row?.value);
}

export type KillSwitchRaise = {
  changed: boolean;
  previous: AssistantKillSwitch;
  state: AssistantKillSwitch;
};

/**
 * Who raises the switch and why, for the audit record written when the level changes. `after`
 * holds extra fields recorded next to the new level; `before` and the levels are filled in here.
 */
export type KillSwitchRaiseMeta = {
  action: string;
  actorId: string | null;
  after?: Record<string, unknown>;
};

/**
 * Moves the switch up to `target` and never down: a level already at or above the target (for
 * example "all_off" set by an admin) is left as it is and nothing is audited. Lowering stays an audited
 * admin action. Run it inside the caller's transaction so the read, the write and the audit record
 * commit together.
 */
export async function raiseKillSwitch(
  client: SettingsClient & AuditClient,
  target: AssistantKillSwitch,
  meta: KillSwitchRaiseMeta,
): Promise<KillSwitchRaise> {
  const previous = await readAssistantKillSwitch(client);
  if (KILL_SWITCH_RANK[previous] >= KILL_SWITCH_RANK[target])
    return { changed: false, previous, state: previous };
  const key = ASSISTANT_KILL_SWITCH_SETTING;
  await client.instanceSetting.upsert({
    create: { key, value: target },
    update: { value: target },
    where: { key },
  });
  await writeAudit(
    {
      action: meta.action,
      actorId: meta.actorId,
      before: { level: previous },
      after: { level: target, ...meta.after },
      targetId: key,
      targetType: "instance_ops",
    },
    client,
  );
  return { changed: true, previous, state: target };
}

/** The refusal a turn on this funding gets at this switch level, or null to proceed. */
export function killSwitchRefusal(level: AssistantKillSwitch, funding: FundingMode) {
  if (level === "all_off") return "assistant_paused" as const;
  // Funding "credits" is the only assistant path that runs on platform LLM keys.
  if (funding === "credits" && killSwitchStops(level, "platform_llm"))
    return "credits_paused" as const;
  return null;
}

/** Throws the user-facing refusal before anything is reserved or sent. */
export async function assertAssistantNotKilled(funding: FundingMode, client?: SettingsClient) {
  const code = killSwitchRefusal(await readAssistantKillSwitch(client), funding);
  if (code) throw new AssistantRequestError(code, 503);
}
