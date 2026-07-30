import { dispatchAccountRoute } from "./account-routes";
import type { PersonalTokenAuth } from "./auth";
import type { PersonalApiContext } from "./context";
import { errorFromUnknown } from "./error-mapper";
import { withIdempotency } from "./idempotency";
import { errorResponse } from "./responses";

type AccountRequest = {
  allowed: boolean;
  auth: PersonalTokenAuth;
  headers: Headers;
  method: string;
  path: string[];
  req: Request;
  url: URL;
};

export async function handleAccountRequest(input: AccountRequest) {
  const { allowed, auth, headers, method, path, req, url } = input;
  const instance = `urn:bisibility:api:v1:${url.pathname}`;
  if (!allowed) {
    return errorResponse("forbidden", "Personal token scope does not allow this operation.", 403, {
      headers,
      instance,
    });
  }

  const ctx: PersonalApiContext = { auth, headers, instance, method, path, req, url };
  const execute = async () => {
    try {
      const response = await dispatchAccountRoute(ctx);
      return response ?? errorResponse("not_found", "Route not found.", 404, { headers, instance });
    } catch (error) {
      return errorFromUnknown(error, headers, url);
    }
  };

  return method === "GET"
    ? execute()
    : withIdempotency(
        { apiKeyId: auth.token.id, headers, method, pathname: url.pathname, req },
        execute,
      );
}
