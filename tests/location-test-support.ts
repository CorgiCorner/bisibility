import { vi } from "vitest";

type LocationImplementation = {
  assign(url: string): void;
  reload(): void;
  href: string;
};

// jsdom's public Location methods are non-configurable in its VM context.
export function stubLocation(options: {
  assign?: (url: string) => void;
  reload?: () => void;
  setHref?: (url: string) => void;
  url?: string;
}): () => void {
  const environment = globalThis as typeof globalThis & {
    jsdom: { reconfigure(options: { url: string }): void };
  };
  const originalUrl = window.location.href;
  const symbol = Object.getOwnPropertySymbols(window.location).find(
    (key) => key.description === "impl",
  );
  if (!symbol) throw new Error("Could not find jsdom's Location implementation");
  const implementation = Reflect.get(window.location, symbol) as LocationImplementation;
  const restore: Array<() => void> = [];
  if (options.url) environment.jsdom.reconfigure({ url: options.url });
  if (options.assign) {
    const spy = vi.spyOn(implementation, "assign").mockImplementation(options.assign);
    restore.push(() => spy.mockRestore());
  }
  if (options.reload) {
    const spy = vi.spyOn(implementation, "reload").mockImplementation(options.reload);
    restore.push(() => spy.mockRestore());
  }
  if (options.setHref) {
    const spy = vi.spyOn(implementation, "href", "set").mockImplementation(options.setHref);
    restore.push(() => spy.mockRestore());
  }
  return () => {
    for (const undo of restore) undo();
    if (options.url) environment.jsdom.reconfigure({ url: originalUrl });
  };
}
