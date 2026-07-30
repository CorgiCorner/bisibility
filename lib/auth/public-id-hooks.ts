import { makePublicId, type PublicIdPrefix } from "@/lib/db/public-id";

type AuthCreateInput = Record<string, unknown>;
type AuthCreateResult = { data: AuthCreateInput };

/** Better Auth hooks own these IDs so adapter writes never depend on client input. */
export function addAuthPublicId(
  input: AuthCreateInput,
  prefix: PublicIdPrefix,
  result?: { data?: AuthCreateInput } | undefined,
): AuthCreateResult {
  return {
    data: {
      ...input,
      ...result?.data,
      publicId: makePublicId(prefix),
    },
  };
}
