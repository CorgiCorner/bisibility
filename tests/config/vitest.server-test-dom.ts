import { JSDOM } from "jsdom";
import { afterEach, vi } from "vitest";

let dom: JSDOM | undefined;

export function installServerTestDom() {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
}

afterEach(() => {
  dom?.window.close();
  dom = undefined;
  vi.unstubAllGlobals();
});
