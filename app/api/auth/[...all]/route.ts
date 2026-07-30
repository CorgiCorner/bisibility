import { auth } from "@/lib/auth/auth";
import { withAuthClientIp } from "@/lib/auth/client-ip";
import { isFirstRunAdministratorPending } from "@/lib/auth/first-run";
import { withFirstRunCreation } from "@/lib/auth/first-run-context";
import { isFirstRunSignInRequest } from "@/lib/auth/first-run-request";
import { auditRequestContextFromHeaders } from "@/lib/auth/request-context";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

export function GET(request: Request) {
  return handlers.GET(withAuthClientIp(request));
}

export async function POST(request: Request) {
  const authRequest = withAuthClientIp(request);

  if (!isFirstRunSignInRequest(request) || !(await isFirstRunAdministratorPending())) {
    return handlers.POST(authRequest);
  }

  const requestContext = auditRequestContextFromHeaders(request.headers);
  return withFirstRunCreation(requestContext, () => handlers.POST(authRequest));
}
