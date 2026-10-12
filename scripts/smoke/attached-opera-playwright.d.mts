import type { Browser, BrowserType, ConnectOverCDPTransport } from "@playwright/test";

export function assertLocalTestBrowser(
  environment?: NodeJS.ProcessEnv,
  fetcher?: typeof fetch,
): Promise<void>;
export function openCdpTransport(
  url: string,
  Socket?: typeof WebSocket,
): Promise<ConnectOverCDPTransport>;
export function ownedBrowserContexts(
  browser: Browser,
  disconnect: () => void,
): {
  browser: Browser;
  dispose(): Promise<void>;
};
export function attachOperaForTests(options?: {
  fetcher?: typeof fetch;
  connect?: BrowserType["connectOverCDP"];
  transportFactory?: (url: string) => Promise<ConnectOverCDPTransport>;
}): Promise<ReturnType<typeof ownedBrowserContexts>>;
