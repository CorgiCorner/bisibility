import "server-only";
import {
  AssistantRequestError,
  assertAssistantOrigin,
  assistantEnabled,
  assistantErrorResponse,
  assistantOpaqueId,
  assistantPrincipal,
  recordAssistantAction,
} from "./access";
import { assistantConfig } from "./config";
import { getAssistantConversation, listAssistantConversations } from "./conversations";
import { removeAssistantCredential, saveAssistantCredential } from "./credentials";
import { saveAssistantFundingPreference } from "./funding-preference";
import { stopAssistantRun } from "./run-control";

export async function assistantJson(req: Request) {
  const body = await req.text();
  if (body.length > 20000) throw new AssistantRequestError("invalid_request", 400);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new AssistantRequestError("invalid_request", 400);
  }
}
function requireEnabled() {
  if (!assistantEnabled()) throw new AssistantRequestError("not_configured", 503);
}
export async function getAssistantConfig(req: Request) {
  try {
    const principal = await assistantPrincipal();
    const project = new URL(req.url).searchParams.get("project");
    if (!project) throw new AssistantRequestError("invalid_request", 400);
    return Response.json(await assistantConfig(project, principal.userId));
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
export async function getAssistantConversations(req: Request) {
  try {
    requireEnabled();
    const principal = await assistantPrincipal();
    const project = new URL(req.url).searchParams.get("project");
    if (!project) throw new AssistantRequestError("invalid_request", 400);
    return Response.json(await listAssistantConversations(project, principal.userId));
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
export async function getAssistantConversationResponse(_req: Request, id: string) {
  try {
    requireEnabled();
    const principal = await assistantPrincipal();
    return Response.json(await getAssistantConversation(assistantOpaqueId(id), principal.userId));
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
export async function postAssistantCredential(req: Request) {
  try {
    assertAssistantOrigin(req);
    requireEnabled();
    const principal = await assistantPrincipal();
    const saved = await saveAssistantCredential(principal.userId, await assistantJson(req));
    await recordAssistantAction(principal);
    return Response.json(saved);
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
export async function postAssistantFunding(req: Request) {
  try {
    assertAssistantOrigin(req);
    requireEnabled();
    const principal = await assistantPrincipal();
    const saved = await saveAssistantFundingPreference(principal.userId, await assistantJson(req));
    await recordAssistantAction(principal);
    return Response.json(saved);
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
export async function deleteAssistantCredential(req: Request, id: string) {
  try {
    assertAssistantOrigin(req);
    requireEnabled();
    const principal = await assistantPrincipal();
    const removed = await removeAssistantCredential(principal.userId, assistantOpaqueId(id));
    await recordAssistantAction(principal);
    return Response.json(removed);
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
export async function postAssistantStop(req: Request, id: string) {
  try {
    assertAssistantOrigin(req);
    requireEnabled();
    const principal = await assistantPrincipal();
    const stopped = await stopAssistantRun(assistantOpaqueId(id), principal.userId);
    await recordAssistantAction(principal);
    return Response.json(stopped);
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
