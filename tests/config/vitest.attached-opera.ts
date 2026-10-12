import { PlaywrightBrowserProvider, playwright } from "@vitest/browser-playwright";
import { attachOperaForTests } from "../../scripts/smoke/attached-opera-playwright.mjs";

export function wrapAttachedProvider(
  delegate: PlaywrightBrowserProvider,
  attach = attachOperaForTests,
) {
  let attachment: Awaited<ReturnType<typeof attachOperaForTests>> | undefined;
  let opening: Promise<void> | undefined;
  let closing = false;
  return {
    name: delegate.name,
    supportsParallelism: false,
    initScripts: delegate.initScripts,
    mocker: delegate.mocker,
    getPage: delegate.getPage.bind(delegate),
    getCommandsContext: delegate.getCommandsContext.bind(delegate),
    getCDPSession: delegate.getCDPSession.bind(delegate),
    async openPage(...args: Parameters<typeof delegate.openPage>) {
      if (closing) throw new Error("The test browser attachment is closed.");
      opening ??= attach().then((current) => {
        attachment = current;
        delegate.browser = current.browser;
      });
      await opening;
      if (closing) throw new Error("The test browser attachment is closed.");
      await delegate.openPage(...args);
    },
    async close() {
      closing = true;
      try {
        await opening;
        await delegate.close();
      } finally {
        await attachment?.dispose();
      }
    },
  };
}

export function attachedOpera() {
  const base = playwright();
  return {
    ...base,
    // Never call the stock provider's launch prewarm on a developer workstation.
    prewarm: undefined,
    providerFactory(project: Parameters<typeof base.providerFactory>[0]) {
      return wrapAttachedProvider(new PlaywrightBrowserProvider(project, {}));
    },
  };
}
