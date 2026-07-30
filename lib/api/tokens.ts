import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { ZodError, z } from "zod";
import { notFound, type PersonalApiContext } from "./context";
import { issuePersonalToken, listPersonalTokens, revokePersonalToken } from "./pat-service";
import { requireApiPublicId } from "./public-id";
import { personalTokenResource } from "./resources";
import { errorResponse, listResponse, resourceResponse } from "./responses";
import { personalTokenCreateSchema } from "./schemas";
import { objectBody, parseApiInput, readJsonBody } from "./surface";

export async function listTokens(ctx: PersonalApiContext) {
  const tokens = await listPersonalTokens(ctx.auth.user.id);
  return listResponse(tokens.map(personalTokenResource), null, { headers: ctx.headers });
}

function issuedTokenResponse(
  issued: Awaited<ReturnType<typeof issuePersonalToken>>,
  headers: Headers,
) {
  return resourceResponse(
    { ...personalTokenResource(issued), masked_value: issued.maskedValue, token: issued.raw },
    { headers, status: 201 },
  );
}

export async function createToken(ctx: PersonalApiContext) {
  const body = await readJsonBody(ctx);
  const data = parseApiInput(personalTokenCreateSchema, objectBody(body));
  const issued = await issuePersonalToken(ctx.auth.user.id, {
    expiresInDays: data.expiresInDays,
    name: data.name,
    scope: data.scope,
  });

  return issuedTokenResponse(issued, ctx.headers);
}

export async function revokeToken(ctx: PersonalApiContext, tokenId: string) {
  const targetId =
    tokenId === "current" ? requireApiPublicId(ctx.auth.token.publicId ?? "", "pat") : tokenId;
  const revoked = await revokePersonalToken(ctx.auth.user.id, targetId);
  if (!revoked) {
    return notFound(ctx, "Personal access token not found.");
  }

  return resourceResponse(personalTokenResource(revoked), { headers: ctx.headers });
}

// --- OAuth → personal token exchange (bootstrap for `bisibility auth login`) ---

// Match the OAuth provider's SHA-256 base64url storage so opaque tokens verify
// directly without client credentials; JWT access tokens are rejected.
function hashOauthToken(raw: string) {
  return createHash("sha256").update(raw).digest("base64url");
}

const EXCHANGE_SCOPE = "tokens:write";

export async function exchangeOauthToken(
  req: Request,
  _url: URL,
  init: { headers: Headers; instance: string },
) {
  const header = req.headers.get("authorization")?.trim() ?? "";
  const raw = header.replace(/^bearer\s+/i, "").trim();

  const accessToken = await prisma.oauthAccessToken.findUnique({
    select: { clientId: true, expiresAt: true, scopes: true, userId: true },
    where: { token: hashOauthToken(raw) },
  });
  if (!accessToken || accessToken.expiresAt <= new Date() || !accessToken.userId) {
    return errorResponse("unauthorized", "Invalid or expired OAuth access token.", 401, {
      headers: init.headers,
      instance: init.instance,
    });
  }
  if (!accessToken.scopes.includes(EXCHANGE_SCOPE)) {
    return errorResponse(
      "forbidden",
      `The OAuth access token is missing the "${EXCHANGE_SCOPE}" scope.`,
      403,
      { headers: init.headers, instance: init.instance },
    );
  }

  let data: ReturnType<typeof personalTokenCreateSchema.parse>;
  try {
    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    data = parseApiInput(personalTokenCreateSchema, objectBody(body));
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse("validation_failed", "Request input failed validation.", 400, {
        details: z.flattenError(error),
        headers: init.headers,
        instance: init.instance,
      });
    }
    return errorResponse("bad_request", "Request body must be valid JSON.", 400, {
      headers: init.headers,
      instance: init.instance,
    });
  }

  const issued = await issuePersonalToken(
    accessToken.userId,
    { expiresInDays: data.expiresInDays, name: data.name, scope: data.scope },
    { action: "pat.exchange_login", viaClientId: accessToken.clientId },
  );

  return issuedTokenResponse(issued, init.headers);
}
