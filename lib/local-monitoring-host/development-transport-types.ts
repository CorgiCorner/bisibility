import type { ProviderRequest } from "@usagekit/providers";

export type DevelopmentMapsTransportInput = Readonly<{
  request: ProviderRequest;
  operationId: string;
  receivedAt: Date;
}>;
