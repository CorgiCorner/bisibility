import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumePendingKeywordCommandAction,
  keywordActionHref,
  parseKeywordCommandAction,
  performKeywordCommandAction,
  runKeywordCommandFromPalette,
} from "./keyword-command-actions";

describe("keyword command actions", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    history.replaceState(null, "", "/");
    consumePendingKeywordCommandAction();
  });

  it("builds and parses keyword action URLs", () => {
    expect(keywordActionHref("prj_1", "add")).toBe("/app/prj_1/rank-tracker?action=add");
    expect(parseKeywordCommandAction("run-check")).toBe("run-check");
    expect(parseKeywordCommandAction("unknown")).toBeNull();
  });

  it("clicks the existing keyword action on the keywords page", () => {
    history.replaceState(null, "", "/app/prj_1/rank-tracker");
    const push = vi.fn();
    const click = vi.fn();
    document.body.innerHTML = `<button type="button">Add keyword</button>`;
    document.querySelector("button")?.addEventListener("click", click);

    runKeywordCommandFromPalette("prj_1", "add", push);

    expect(click).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("hands off through a query param outside the keywords page", () => {
    history.replaceState(null, "", "/app/prj_1/overview");
    const push = vi.fn();

    runKeywordCommandFromPalette("prj_1", "import", push);

    expect(push).toHaveBeenCalledWith("/app/prj_1/rank-tracker?action=import");
    expect(consumePendingKeywordCommandAction()).toBe("import");
  });

  it("focuses search and opens filters for the filter action", () => {
    const click = vi.fn();
    document.body.innerHTML = `
      <input id="keywords-filter" aria-label="Filter keywords" />
      <button type="button">Filters</button>
    `;
    document.querySelector("button")?.addEventListener("click", click);

    expect(performKeywordCommandAction("filter")).toBe(true);

    expect(document.activeElement).toBe(document.querySelector("#keywords-filter"));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("falls back to the empty-state Add submit button", () => {
    const click = vi.fn();
    document.body.innerHTML = `
      <form>
        <input aria-label="Keyword" />
        <button type="button">Add</button>
      </form>
    `;
    document.querySelector("button")?.addEventListener("click", click);

    expect(performKeywordCommandAction("add")).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("does not click disabled run-check controls", () => {
    document.body.innerHTML = `<button type="button" disabled>Run checks</button>`;

    expect(performKeywordCommandAction("run-check")).toBe(false);
  });
});
