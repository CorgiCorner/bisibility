import { expect, test } from "vitest";
import {
  ASSISTANT_CONTENT_FLOOR_PX,
  ASSISTANT_RESERVE_PX,
  assistantDockQuery,
  assistantReservesPage,
  SIDEBAR_COLLAPSED_PX,
  SIDEBAR_EXPANDED_PX,
} from "./dock";

test("docks only when the measured sidebar leaves a 960px content column beside the inset panel", () => {
  // 420px panel plus the 12px floating inset on each side.
  expect(ASSISTANT_RESERVE_PX).toBe(444);
  const expanded = SIDEBAR_EXPANDED_PX + ASSISTANT_RESERVE_PX + ASSISTANT_CONTENT_FLOOR_PX;
  const collapsed = SIDEBAR_COLLAPSED_PX + ASSISTANT_RESERVE_PX + ASSISTANT_CONTENT_FLOOR_PX;
  expect(expanded).toBe(1674);
  expect(collapsed).toBe(1484);
  expect(assistantDockQuery(false)).toBe("(min-width: 1674px)");
  expect(assistantDockQuery(true)).toBe("(min-width: 1484px)");
  expect(
    assistantReservesPage({ open: true, viewportWidth: expanded, sidebarCollapsed: false }),
  ).toBe(true);
  expect(
    assistantReservesPage({ open: true, viewportWidth: expanded - 1, sidebarCollapsed: false }),
  ).toBe(false);
  expect(
    assistantReservesPage({ open: true, viewportWidth: collapsed, sidebarCollapsed: true }),
  ).toBe(true);
  expect(
    assistantReservesPage({ open: true, viewportWidth: collapsed - 1, sidebarCollapsed: true }),
  ).toBe(false);
  expect(assistantReservesPage({ open: false, viewportWidth: 2000, sidebarCollapsed: false })).toBe(
    false,
  );
  expect(assistantReservesPage({ open: true, viewportWidth: 1024, sidebarCollapsed: true })).toBe(
    false,
  );
});
