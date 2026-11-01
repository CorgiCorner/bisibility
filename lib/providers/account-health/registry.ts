import "server-only";
import type { AccountAdapter } from "./adapter";
import { dataForSeoAccountAdapter } from "./dataforseo";
import { serpApiAccountAdapter } from "./serpapi";

const adapters: Readonly<Record<string, AccountAdapter>> = {
  dataforseo: dataForSeoAccountAdapter,
  serpapi: serpApiAccountAdapter,
};

export const accountHealthAdapter = (provider: string) =>
  Object.hasOwn(adapters, provider) ? adapters[provider] : undefined;
export const accountHealthProviders = () => Object.keys(adapters);
