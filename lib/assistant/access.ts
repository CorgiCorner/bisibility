import "server-only";
import { recordAppAction } from "@/lib/activity/app-mutation";
import type { NativeSessionPrincipal } from "@/lib/api/native-session";
import { getOptionalAvailableSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ZodError, z } from "zod";
import { assistantDevFakeProvider } from "./provider-fake-env";
import { assistantReadOnly } from "./read-only";
import { ASSISTANT_ERROR_CODES, type AssistantErrorCode } from "./wire";

export class AssistantRequestError extends Error {
  constructor(
    readonly code: AssistantErrorCode,
    readonly status: number,
  ) {
    super(code);
  }
}
export async function assistantPrincipal(): Promise<NativeSessionPrincipal> {
  const session = await getOptionalAvailableSession();
  if (!session?.user.id || !session.session.id)
    throw new AssistantRequestError("permission_denied", 401);
  return { kind: "native_session", userId: session.user.id, sessionId: session.session.id };
}
/** Call only after an assistant mutation commits; the session lookup is cached per request. */
export async function recordAssistantAction(principal: NativeSessionPrincipal) {
  const session = await getOptionalAvailableSession();
  if (session?.user.id === principal.userId) recordAppAction(session);
}
export function assistantOpaqueId(value: string) {
  return z.string().min(1).max(64).parse(value);
}

export function assertAssistantOrigin(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    throw new AssistantRequestError("permission_denied", 403);
}
export function assistantEnabled() {
  return (
    process.env.ASSISTANT_ENABLED === "1" &&
    !(process.env.NODE_ENV === "production" && assistantDevFakeProvider().enabled)
  );
}
export async function assistantProject(publicId: string, userId: string) {
  if (!/^prj_[A-Za-z0-9]{1,40}$/.test(publicId))
    throw new AssistantRequestError("invalid_request", 400);
  const project = await prisma.project.findUnique({
    where: { publicId },
    select: { id: true, publicId: true, name: true, domain: true, ownerId: true, writeMode: true },
  });
  if (!project) throw new AssistantRequestError("permission_denied", 404);
  const member = await prisma.membership.findUnique({
    where: { userId_projectId: { userId, projectId: project.id } },
    select: { role: true },
  });
  if (!member) throw new AssistantRequestError("permission_denied", 404);
  return {
    ...project,
    role: member.role,
    readOnly: assistantReadOnly(project.writeMode, member.role),
  };
}
export function assistantErrorResponse(error: unknown) {
  if (error instanceof ZodError)
    return Response.json({ code: "invalid_request", message: "Invalid request." }, { status: 400 });
  if (error instanceof AssistantRequestError)
    return Response.json({ code: error.code, message: error.code }, { status: error.status });
  const parsed =
    error && typeof error === "object" && "code" in error
      ? z.enum(ASSISTANT_ERROR_CODES).safeParse(error.code)
      : null;
  if (parsed?.success) {
    const status = ["approval_conflict", "conversation_busy", "duplicate_request"].includes(
      parsed.data,
    )
      ? 409
      : parsed.data === "approval_expired"
        ? 410
        : parsed.data === "accounting_unavailable"
          ? 503
          : 403;
    return Response.json({ code: parsed.data, message: parsed.data }, { status });
  }
  return Response.json({ code: "internal", message: "Assistant request failed." }, { status: 500 });
}
