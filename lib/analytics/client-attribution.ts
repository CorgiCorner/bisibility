import { z } from "zod";

export const analyticsClients = [
  "web",
  "ios",
  "sdk_ts",
  "sdk_python",
  "sdk_go",
  "cli",
  "mcp",
  "extension",
  "unknown",
] as const;

export const clientAttributionSchema = z
  .object({
    client: z.enum(analyticsClients),
    client_version: z
      .string()
      .regex(
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][\da-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][\da-zA-Z-]*))*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/,
      )
      .max(80)
      .optional(),
    auth_kind: z.enum(["session", "personal_token", "project_key", "oauth"]),
  })
  .strict();

export type ClientAttribution = z.infer<typeof clientAttributionSchema>;

const identifiers: Record<string, ClientAttribution["client"]> = {
  "bisibility-web": "web",
  "bisibility-ios": "ios",
  "bisibility-sdk-ts": "sdk_ts",
  "bisibility-sdk-swift": "unknown",
  "bisibility-sdk-python": "sdk_python",
  "bisibility-sdk-go": "sdk_go",
  "bisibility-cli": "cli",
  "bisibility-mcp": "mcp",
  "bisibility-extension": "extension",
};

export function parseClientAttribution(
  headers: Headers,
  auth_kind: ClientAttribution["auth_kind"],
): ClientAttribution {
  // A supplied but invalid client header must not acquire a fallback identity.
  const value = headers.get("x-bisibility-client") ?? headers.get("user-agent") ?? "";
  if (value.length > 200) return { client: "unknown", auth_kind };
  const match =
    /^(bisibility-[a-z-]+)\/([^\s/]+)(?: \(\d+\))?(?: bisibility-sdk-swift\/([^\s/]+))?$/.exec(
      value.trim(),
    );
  const client = match ? identifiers[match[1]] : undefined;
  if (!client || !match) return { client: "unknown", auth_kind };
  if (match[3] && !clientAttributionSchema.shape.client_version.safeParse(match[3]).success)
    return { client: "unknown", auth_kind };
  const source = headers.get("x-bisibility-source");
  if (client === "sdk_ts" && (source === "cli" || source === "mcp")) {
    // Existing SDK consumers declare their transport here, but not their own app version.
    return { client: source, auth_kind };
  }
  const version = clientAttributionSchema.shape.client_version.safeParse(match[2]);
  return { client, auth_kind, ...(version.success ? { client_version: version.data } : {}) };
}
