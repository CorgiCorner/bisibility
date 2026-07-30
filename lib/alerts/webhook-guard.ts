import { lookup } from "node:dns/promises";
import {
  isAllowedWebhookProtocol,
  isBlockedWebhookAddress,
  normalizedWebhookHostname,
  PRIVATE_NETWORK_WEBHOOK_ERROR,
  privateNetworkAllowed,
  type WebhookGuardOptions as WebhookTargetOptions,
} from "./webhook-target";

export type WebhookResolvedAddress = {
  address: string;
  family?: number;
};

export type WebhookGuardOptions = WebhookTargetOptions & {
  resolveHost?: (hostname: string) => Promise<WebhookResolvedAddress[]>;
};

async function defaultResolveHost(hostname: string) {
  return lookup(hostname, { all: true, verbatim: true });
}

export async function resolveAllowedWebhookAddresses(
  value: string,
  options: WebhookGuardOptions = {},
): Promise<WebhookResolvedAddress[]> {
  if (!URL.canParse(value)) {
    throw new Error("Webhook URL must be a valid URL.");
  }

  const url = new URL(value);
  if (!isAllowedWebhookProtocol(url.protocol)) {
    throw new Error("Webhook URL must use HTTP or HTTPS.");
  }
  if (privateNetworkAllowed(options)) {
    return [];
  }

  const hostname = normalizedWebhookHostname(url.hostname);
  if (isBlockedWebhookAddress(hostname)) {
    throw new Error(PRIVATE_NETWORK_WEBHOOK_ERROR);
  }
  if (hostname === url.hostname && /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return [{ address: hostname, family: 4 }];
  }

  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const addresses = await resolveHost(hostname);
  if (addresses.some(({ address }) => isBlockedWebhookAddress(address))) {
    throw new Error(PRIVATE_NETWORK_WEBHOOK_ERROR);
  }
  return addresses;
}

export async function assertWebhookUrlAllowed(value: string, options: WebhookGuardOptions = {}) {
  await resolveAllowedWebhookAddresses(value, options);
}
