import type { KeywordPersonalViewContext } from "@/lib/saved-views/keyword-personal-context";
import { emptyTablePresentation } from "@/lib/saved-views/presentation-model";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordPresentationDraftProvider } from "./KeywordPresentationDraftProvider";
import { usePersonalKeywordLayout } from "./use-personal-keyword-layout";

const columns = [
  { id: "keyword", size: 200, meta: { lockVisible: true } },
  { id: "volume", size: 100 },
];
const initial = {
  ...emptyTablePresentation,
  columnOrder: ["keyword", "volume"],
  visibility: { volume: false },
};
const context = { presentation: initial } satisfies Pick<
  KeywordPersonalViewContext,
  "presentation"
>;
function TableDraft() {
  const layout = usePersonalKeywordLayout(context, columns);
  return (
    <>
      <output data-testid="draft">
        {JSON.stringify({
          modified: layout.modified,
          visibility: layout.visibility,
          sizing: layout.sizing,
          order: layout.order,
        })}
      </output>
      <button type="button" onClick={() => layout.setVisibility({ volume: true })}>
        Show volume
      </button>
      <button
        type="button"
        onClick={() => {
          layout.setSizing({ keyword: 240, volume: 120 });
          layout.setOrder(["volume", "keyword"]);
        }}
      >
        Resize and reorder
      </button>
      <button type="button" onClick={layout.discard}>
        Discard
      </button>
    </>
  );
}
function Page({ scope, page }: { scope: string; page: number }) {
  return (
    <KeywordPresentationDraftProvider key={scope} initial={initial}>
      <TableDraft key={page} />
    </KeywordPresentationDraftProvider>
  );
}
function draft() {
  return JSON.parse(screen.getByTestId("draft").textContent ?? "{}");
}

describe("keyword presentation draft lifetime", () => {
  it("preserves unsaved visibility across a table page remount", () => {
    const { rerender } = render(<Page scope="user-a:project-a:general:1" page={1} />);
    fireEvent.click(screen.getByText("Show volume"));
    rerender(<Page scope="user-a:project-a:general:1" page={2} />);
    expect(draft()).toMatchObject({ modified: true, visibility: { keyword: true, volume: true } });
    fireEvent.click(screen.getByText("Discard"));
    expect(draft()).toMatchObject({ modified: false, visibility: { volume: false } });
  });
  it.each([
    "user-b:project-a:general:1",
    "user-a:project-b:general:1",
    "user-a:project-a:other-view:1",
    "user-a:project-a:general:2",
  ])("does not inherit an unsaved draft into %s", (scope) => {
    const { rerender } = render(<Page scope="user-a:project-a:general:1" page={1} />);
    fireEvent.click(screen.getByText("Show volume"));
    rerender(<Page scope={scope} page={2} />);
    expect(draft()).toMatchObject({ modified: false, visibility: { volume: false } });
  });
  it("retains both batched changes and never mutates the original preference", () => {
    render(<Page scope="user-a:project-a:general:1" page={1} />);
    fireEvent.click(screen.getByText("Resize and reorder"));
    expect(draft()).toMatchObject({
      modified: true,
      sizing: { keyword: 240, volume: 120 },
      order: ["volume", "keyword"],
    });
    expect(initial.sizing).toEqual({});
    expect(initial.columnOrder).toEqual(["keyword", "volume"]);
  });
});
