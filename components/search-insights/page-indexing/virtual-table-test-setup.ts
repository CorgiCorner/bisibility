import { afterAll, beforeAll } from "vitest";

const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return this.matches('[data-testid="indexing-urls"]') ? 500 : (original?.get?.call(this) ?? 0);
    },
  });
});
afterAll(() => {
  if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
  else Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
});
