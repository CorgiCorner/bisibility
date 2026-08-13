import type { ProviderCredentials } from "@/lib/providers/types";
import {
  DataForSeoError,
  DataForSeoUnsupportedLocationError,
  messageWithSentParameters,
  noSearchResults,
  redactedMessage,
  unsupportedLabsRequest,
  validationFailure,
} from "./dataforseo-errors";
import { type DataForSeoResponse, dataForSeoResponseCostCents } from "./dataforseo-payload";

type RequestAuthenticatedEnvelope = (
  url: string,
  credentials: ProviderCredentials,
  init?: RequestInit,
) => Promise<DataForSeoResponse>;

type DataForSeoLabsClientOptions = {
  envelopeMessage: (data: DataForSeoResponse) => string;
  envelopeOk: (data: DataForSeoResponse) => boolean;
  requestAuthenticatedEnvelope: RequestAuthenticatedEnvelope;
  statusUrl: string;
};

export function createDataForSeoLabsClient(options: DataForSeoLabsClientOptions) {
  async function request(
    url: string,
    credentials: ProviderCredentials,
    payload: Record<string, unknown>,
  ) {
    let data: DataForSeoResponse;
    try {
      data = await options.requestAuthenticatedEnvelope(url, credentials, {
        body: JSON.stringify([payload]),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
    } catch (error) {
      if (error instanceof DataForSeoError) {
        const unsupported = unsupportedLabsRequest(error.message);
        if (unsupported || validationFailure(error.message)) {
          const message = messageWithSentParameters(error.message, payload, credentials);
          if (unsupported) {
            throw new DataForSeoUnsupportedLocationError(message, error.costCents);
          }
          throw new DataForSeoError(message, error.retryable, error.httpStatus, error.costCents);
        }
      }
      throw error;
    }

    if (options.envelopeOk(data)) return data;

    const rawMessage = options.envelopeMessage(data);
    const statusCode = data.tasks?.[0]?.status_code ?? data.status_code;
    if (noSearchResults(statusCode, rawMessage)) return data;
    const unsupported = unsupportedLabsRequest(rawMessage);
    const message =
      unsupported || validationFailure(rawMessage)
        ? messageWithSentParameters(rawMessage, payload, credentials)
        : redactedMessage(rawMessage, credentials);
    const costCents = dataForSeoResponseCostCents(data);
    if (unsupported) throw new DataForSeoUnsupportedLocationError(message, costCents);
    throw new DataForSeoError(message, false, undefined, costCents);
  }

  async function requestStatus(credentials: ProviderCredentials) {
    const data = await options.requestAuthenticatedEnvelope(options.statusUrl, credentials);
    if (!options.envelopeOk(data)) {
      throw new DataForSeoError(redactedMessage(options.envelopeMessage(data), credentials));
    }
    return data;
  }

  return { request, requestStatus };
}
