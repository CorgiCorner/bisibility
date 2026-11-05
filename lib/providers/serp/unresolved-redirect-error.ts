import { ProviderCallError } from "@/lib/providers/call-error";

export class UnresolvedRedirectError extends ProviderCallError {
  constructor(
    costCents: number | null,
    readonly raw?: unknown,
  ) {
    super("Provider redirects could not be resolved.", costCents);
  }
}
