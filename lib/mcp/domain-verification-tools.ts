import { operationPath } from "./operation-path";
import { mcpPublicIdSchema } from "./public-id-schema";
import type { RestCall } from "./rest-call";
import type { JsonObject, McpToolDefinition } from "./types";

export const domainVerificationTools: McpToolDefinition[] = [
  ["get_domain_verification", "Read the project domain verification."],
  [
    "issue_domain_verification",
    "Start verification for the project domain, replacing the previous challenge.",
  ],
  ["check_domain_verification", "Check the DNS TXT or connected Search Console proof now."],
].map(([name, description]) => ({
  name,
  description,
  title: description,
  annotations: {
    readOnlyHint: name === "get_domain_verification",
    destructiveHint: false,
    openWorldHint: name === "check_domain_verification",
  },
  execution: { taskSupport: "forbidden" as const },
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: name === "issue_domain_verification" ? ["project_id", "method"] : ["project_id"],
    properties: {
      project_id: mcpPublicIdSchema("prj"),
      ...(name === "issue_domain_verification"
        ? { method: { type: "string", enum: ["dns_txt", "search_console"] } }
        : {}),
    },
  },
}));
export function dispatchDomainVerification(name: string, input: JsonObject): RestCall | null {
  if (
    !["getDomainVerification", "issueDomainVerification", "checkDomainVerification"].includes(name)
  )
    return null;
  const operation = name as
    | "getDomainVerification"
    | "issueDomainVerification"
    | "checkDomainVerification";
  return {
    path: operationPath(operation, input),
    method: name === "getDomainVerification" ? "GET" : "POST",
    projectId: input.project_id as string,
    ...(name === "issueDomainVerification" ? { body: { method: input.method } } : {}),
  };
}
