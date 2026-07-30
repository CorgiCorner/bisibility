import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import { appPath } from "@/lib/routing/app-path";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateAlertViews,
  revalidateProviderViews,
} from "./_shared";

const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_ACCESS_URL = "https://slack.com/api/oauth.v2.access";
const SLACK_STATE_TTL_MS = 10 * 60 * 1000;
const SLACK_SCOPES = [
  "chat:write",
  "chat:write.public",
  "channels:read",
  "groups:read",
  "incoming-webhook",
];

const projectIdSchema = z.string().trim().min(1).max(120);
const returnPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"));

const slackInstallSchema = z.object({
  projectId: projectIdSchema,
  returnPath: returnPathSchema.optional(),
});

const slackStateSchema = z.object({
  actorId: projectIdSchema,
  issuedAt: z.number().int(),
  projectId: projectIdSchema,
  redirectUri: z.url(),
  returnPath: returnPathSchema,
});

type SlackState = z.infer<typeof slackStateSchema>;

type SlackOAuthPayload = {
  access_token?: unknown;
  error?: unknown;
  incoming_webhook?: { channel?: unknown; channel_id?: unknown };
  ok?: unknown;
  scope?: unknown;
  team?: { id?: unknown; name?: unknown };
};

const slackConnectionSelect = {
  channelId: true,
  channelName: true,
  enabled: true,
  id: true,
  installedById: true,
  scope: true,
  teamId: true,
  teamName: true,
} as const;

function requiredEnv(name: "SLACK_CLIENT_ID" | "SLACK_CLIENT_SECRET") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to install Slack.`);
  }
  return value;
}

function baseOrigin(value: string | undefined) {
  if (!value || !URL.canParse(value)) {
    return null;
  }
  return new URL(value).origin;
}

async function currentOrigin() {
  const configured = baseOrigin(process.env.SITE_URL) ?? baseOrigin(process.env.BETTER_AUTH_URL);
  if (configured) {
    return configured;
  }

  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    `localhost:${process.env.PORT ?? "3000"}`;
  const proto =
    headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return `${proto}://${host}`;
}

function slackRedirectUri(origin: string) {
  return new URL("/api/integrations/slack/callback", origin).toString();
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function channelName(value: unknown) {
  const name = stringValue(value);
  if (!name) {
    return null;
  }
  return name.startsWith("#") ? name : `#${name}`;
}

export function createSlackInstallState(input: Omit<SlackState, "issuedAt">, now = new Date()) {
  return encryptSecret(JSON.stringify({ ...input, issuedAt: now.getTime() }));
}

function readSlackInstallState(raw: string | null, now = new Date()) {
  if (!raw) {
    throw new Error("Slack OAuth state is missing.");
  }

  const state = slackStateSchema.parse(JSON.parse(decryptSecret(raw)));
  if (now.getTime() - state.issuedAt > SLACK_STATE_TTL_MS) {
    throw new Error("Slack OAuth state has expired.");
  }

  return state;
}

export function createSlackInstallUrl(input: {
  actorId: string;
  origin: string;
  projectId: string;
  returnPath: string;
}) {
  const redirectUri = slackRedirectUri(input.origin);
  const url = new URL(SLACK_AUTHORIZE_URL);
  url.searchParams.set("client_id", requiredEnv("SLACK_CLIENT_ID"));
  url.searchParams.set("scope", SLACK_SCOPES.join(","));
  url.searchParams.set(
    "state",
    createSlackInstallState({
      actorId: input.actorId,
      projectId: input.projectId,
      redirectUri,
      returnPath: input.returnPath,
    }),
  );
  url.searchParams.set("redirect_uri", redirectUri);

  return url.toString();
}

async function exchangeSlackOAuthCode(code: string, redirectUri: string) {
  const response = await fetch(SLACK_ACCESS_URL, {
    body: new URLSearchParams({
      client_id: requiredEnv("SLACK_CLIENT_ID"),
      client_secret: requiredEnv("SLACK_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

  const payload = (await response.json().catch(() => null)) as SlackOAuthPayload | null;
  if (!response.ok) {
    throw new Error(`Slack OAuth exchange failed with status ${response.status}.`);
  }
  if (payload?.ok !== true) {
    const reason = stringValue(payload?.error);
    throw new Error(
      reason ? `Slack OAuth exchange failed: ${reason}.` : "Slack OAuth exchange failed.",
    );
  }

  const accessToken = stringValue(payload.access_token);
  const teamId = stringValue(payload.team?.id);
  const channelId = stringValue(payload.incoming_webhook?.channel_id);
  if (!accessToken || !teamId || !channelId) {
    throw new Error("Slack OAuth response did not include a bot token, team, and channel.");
  }

  return {
    accessToken,
    channelId,
    channelName: channelName(payload.incoming_webhook?.channel),
    scope: stringValue(payload.scope),
    teamId,
    teamName: stringValue(payload.team?.name),
  };
}

export async function installSlack(input: unknown): Promise<never> {
  "use server";

  const data = parseActionInput(slackInstallSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "slack_connection",
  });
  const installUrl = createSlackInstallUrl({
    actorId: actor.id,
    origin: await currentOrigin(),
    projectId: project.publicId,
    returnPath: data.returnPath ?? appPath(project.publicId, "alerts"),
  });

  // Bind the OAuth state to this browser so the callback can prove it is
  // completing a flow we initiated (CSRF defense).
  const cookieStore = await cookies();
  cookieStore.set("slack_oauth_state", new URL(installUrl).searchParams.get("state") ?? "", {
    httpOnly: true,
    maxAge: Math.floor(SLACK_STATE_TTL_MS / 1000),
    path: "/api/integrations/slack",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  redirect(installUrl);
}

export async function completeSlackOAuthInstall(input: {
  code: string | null;
  now?: Date;
  state: string | null;
}) {
  const code = input.code?.trim();
  if (!code) {
    throw new Error("Slack OAuth code is missing.");
  }

  const state = readSlackInstallState(input.state, input.now);

  // CSRF: require the state cookie set at install time and matching this callback.
  const cookieStore = await cookies();
  const cookieState = cookieStore.get("slack_oauth_state")?.value;
  if (!cookieState || cookieState !== input.state) {
    throw new Error("Slack OAuth state did not match the initiating session.");
  }
  cookieStore.delete("slack_oauth_state");

  // Identity comes from the session, not solely the server-encrypted state.
  const actor = await getActionActor();
  if (actor.id !== state.actorId) {
    throw new Error("Slack OAuth installer does not match the current session.");
  }

  const project = await requireProjectScope(actor, "manage", state.projectId, {
    type: "slack_connection",
  });
  const before = await prisma.slackConnection.findUnique({
    select: slackConnectionSelect,
    where: { projectId: project.id },
  });
  const slack = await exchangeSlackOAuthCode(code, state.redirectUri);
  const connectionData = {
    accessTokenHash: encryptSecret(slack.accessToken),
    channelId: slack.channelId,
    channelName: slack.channelName,
    enabled: true,
    installedById: actor.id,
    scope: slack.scope,
    teamId: slack.teamId,
    teamName: slack.teamName,
  };
  const connection = await prisma.slackConnection.upsert({
    create: {
      ...connectionData,
      projectId: project.id,
    },
    select: slackConnectionSelect,
    update: connectionData,
    where: { projectId: project.id },
  });

  await writeAudit({
    action: before ? "slack_connection.update" : "slack_connection.create",
    actorId: actor.id,
    after: connection,
    before,
    projectId: project.id,
    targetId: connection.id,
    targetType: "slack_connection",
  });
  revalidateAlertViews();
  revalidateProviderViews();

  return {
    channelId: connection.channelId ?? slack.channelId,
    channelName: connection.channelName,
    connectionId: connection.id,
    projectId: project.publicId,
    returnPath: state.returnPath,
    teamId: connection.teamId,
    teamName: connection.teamName,
  };
}
