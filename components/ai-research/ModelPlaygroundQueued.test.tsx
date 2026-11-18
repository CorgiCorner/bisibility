import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ModelPlaygroundResults } from "./ModelPlaygroundResults";
import { useModelPlaygroundScroll } from "./useModelPlaygroundScroll";

vi.mock("./ModelPlaygroundHistory", () => ({ ModelPlaygroundHistoryButton: () => null }));
vi.mock("@/lib/actions/ai-tracking", () => ({ mutateAiTrackingAction: vi.fn() }));
it("keeps only booleans in state and does not rerender as the fade width changes", () => {
  let renders = 0;
  const hook = renderHook(() => {
    renders++;
    return useModelPlaygroundScroll();
  });
  const scroller = document.createElement("div");
  const track = scroller.appendChild(document.createElement("div"));
  const column = track.appendChild(document.createElement("div"));
  column.setAttribute("data-column-id", "fixture-column");
  scroller.getBoundingClientRect = () => ({ left: 0, right: 400 }) as DOMRect;
  let edge = 380;
  column.getBoundingClientRect = () => ({ left: edge, right: edge + 400 }) as DOMRect;
  act(() =>
    hook.result.current.onScroll({
      currentTarget: scroller,
    } as unknown as React.UIEvent<HTMLElement>),
  );
  expect(hook.result.current.edges).toEqual({ start: false, end: true });
  const count = renders;
  edge = 360;
  act(() =>
    hook.result.current.onScroll({
      currentTarget: scroller,
    } as unknown as React.UIEvent<HTMLElement>),
  );
  expect(renders).toBe(count);
});
it("can mount without ResizeObserver", () => {
  const original = globalThis.ResizeObserver;
  vi.stubGlobal("ResizeObserver", undefined);
  const hook = renderHook(() => useModelPlaygroundScroll());
  expect(() => hook.result.current.ref(document.createElement("div"))).not.toThrow();
  vi.stubGlobal("ResizeObserver", original);
});
it("does not attribute an old legacy charge to an in-flight run", () => {
  const quote = paymentQuote();
  renderWithFeatureMessages(
    <ModelPlaygroundResults
      canTrack={false}
      columns={[]}
      entities={[]}
      funding="byok"
      onRemove={() => {}}
      projectId="prj_test"
      prompt=""
      running
      topics={[]}
      unfinished={false}
      sourceContext={{ competitorDomains: [], excludedNames: [], overrides: [], ownDomain: null }}
      payment={{
        option: quote.option,
        charge: quote.charge,
        state: "settled",
        actionId: "a",
        quoteId: quote.id,
      }}
    />,
    { messages: { ...sharedMessages, ...aiMessages } },
  );
  expect(document.querySelector("[data-legacy-run-charge]")).toBeNull();
});
