import { ownedCdpTransport } from "./owned-cdp-transport.mjs";
import { assertOperaEndpoint } from "./attached-opera-browser.mjs";

export async function assertLocalTestBrowser(environment = process.env, fetcher = fetch) {
  if (environment.CI !== "true") await assertOperaEndpoint(fetcher);
}

/** Public Playwright transport overload allows detaching without Browser.close. */
export async function openCdpTransport(url, Socket = WebSocket) {
  const socket = new Socket(url);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Opera CDP transport did not open."));
    }, 3_000);
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        socket.close();
        reject(new Error("Opera CDP transport failed."));
      },
      { once: true },
    );
  });
  const transport = {
    onmessage: undefined,
    onclose: undefined,
    send(message) {
      if (message.method === "Browser.close")
        throw new Error("The attached browser is externally owned.");
      socket.send(JSON.stringify(message));
    },
    close() {
      socket.close();
    },
  };
  socket.addEventListener("message", (event) => {
    try {
      transport.onmessage?.(JSON.parse(event.data));
    } catch {
      socket.close();
    }
  });
  socket.addEventListener("close", () => transport.onclose?.());
  return transport;
}

/** Tests get new ephemeral contexts in this process, never the user's default context. */
export function ownedBrowserContexts(browser, disconnect) {
  const owned = new Set();
  const pending = new Set();
  let closing = false;
  const newContext = async (options) => {
    if (closing) throw new Error("The test browser attachment is closed.");
    const creation = (async () => {
      const context = await browser.newContext(options);
      if (closing) {
        await context.close();
        throw new Error("The test browser attachment is closed.");
      }
      owned.add(context);
      context.on("close", () => owned.delete(context));
      return context;
    })();
    pending.add(creation);
    try {
      return await creation;
    } finally {
      pending.delete(creation);
    }
  };
  const scoped = new Proxy(browser, {
    get(target, property) {
      if (property === "newContext") return newContext;
      if (property === "contexts") return () => [...owned];
      if (property === "close" || property === Symbol.asyncDispose) return async () => {};
      if (property === "newPage") return async (options) => (await newContext(options)).newPage();
      if (property === "newBrowserCDPSession" || property === "_newContextForReuse")
        return () => {
          throw new Error("Tests may only control their owned ephemeral contexts.");
        };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return {
    browser: scoped,
    async dispose() {
      closing = true;
      await Promise.allSettled([...pending]);
      try {
        await Promise.all([...owned].map((context) => context.close()));
      } finally {
        owned.clear();
        disconnect();
      }
    },
  };
}

export async function attachOperaForTests({
  fetcher = fetch,
  connect,
  transportFactory = openCdpTransport,
} = {}) {
  const url = await assertOperaEndpoint(fetcher);
  const transport = await transportFactory(url);
  try {
    const chromium = connect ? null : (await import("@playwright/test")).chromium;
    const connectOverCDP = connect ?? chromium.connectOverCDP.bind(chromium);
    const browser = await connectOverCDP(ownedCdpTransport(transport), {
      noDefaults: true,
      timeout: 10_000,
    });
    return ownedBrowserContexts(browser, () => transport.close());
  } catch (error) {
    transport.close();
    throw error;
  }
}
