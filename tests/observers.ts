import { afterEach } from "vitest";

type ObserverController<TObserver, TEntry> = {
  observer: TObserver;
  trigger: (entries: TEntry[]) => void;
};

type ObserverConstructor<TObserver, TEntry> = new (
  callback: (entries: TEntry[], observer: TObserver) => void,
) => TObserver;

const originalIntersectionObserver = globalThis.IntersectionObserver;
const originalResizeObserver = globalThis.ResizeObserver;

function stubObserver<TObserver, TEntry>(
  install: (observerClass: ObserverConstructor<TObserver, TEntry>) => void,
): ObserverController<TObserver, TEntry>[] {
  const controllers: ObserverController<TObserver, TEntry>[] = [];

  class MockObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly scrollMargin = "";
    readonly thresholds: number[] = [];

    constructor(callback: (entries: TEntry[], observer: TObserver) => void) {
      const observer = this as unknown as TObserver;
      controllers.push({
        observer,
        trigger: (entries) => callback(entries, observer),
      });
    }

    disconnect() {}
    observe() {}
    takeRecords(): TEntry[] {
      return [];
    }
    unobserve() {}
  }

  install(MockObserver as unknown as ObserverConstructor<TObserver, TEntry>);
  return controllers;
}

export function stubIntersectionObserver() {
  return stubObserver<IntersectionObserver, IntersectionObserverEntry>((observerClass) => {
    globalThis.IntersectionObserver = observerClass as typeof IntersectionObserver;
  });
}

export function stubResizeObserver() {
  return stubObserver<ResizeObserver, ResizeObserverEntry>((observerClass) => {
    globalThis.ResizeObserver = observerClass as typeof ResizeObserver;
  });
}

afterEach(() => {
  globalThis.IntersectionObserver = originalIntersectionObserver;
  globalThis.ResizeObserver = originalResizeObserver;
});
