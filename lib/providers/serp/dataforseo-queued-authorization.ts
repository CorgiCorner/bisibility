import type { ProviderCredentials } from "@/lib/providers/types";
import { DataForSeoError } from "./dataforseo-errors";

export function dataForSeoAuthorization(credentials: ProviderCredentials) {
  if (!credentials.login || !credentials.password)
    throw new DataForSeoError("DataForSEO queued tasks require login and password.");
  return `Basic ${Buffer.from(`${credentials.login}:${credentials.password}`).toString("base64")}`;
}
