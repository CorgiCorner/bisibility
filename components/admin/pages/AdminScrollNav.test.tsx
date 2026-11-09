import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AdminScrollNav } from "./AdminScrollNav";

it("reveals the active destination on load and exposes both overflowing edges", () => {
  const dimensions = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      return {
        left: this.tagName === "A" ? 400 : 0,
        right: this.tagName === "A" ? 480 : 300,
      } as DOMRect;
    });
  const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(300);
  const scrollWidth = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(800);
  try {
    const view = render(
      <AdminScrollNav activeKey="last" label="Destinations">
        <a href="/last" aria-current="page">
          Last destination
        </a>
      </AdminScrollNav>,
    );
    const nav = screen.getByRole("navigation");
    expect(nav.scrollLeft).toBe(200);
    expect(view.container.querySelectorAll("span[aria-hidden]")).toHaveLength(2);
    nav.scrollLeft = 500;
    fireEvent.scroll(nav);
    expect(view.container.querySelectorAll("span[aria-hidden]")).toHaveLength(1);
    expect(nav.className).toContain("whitespace-nowrap");
  } finally {
    dimensions.mockRestore();
    width.mockRestore();
    scrollWidth.mockRestore();
  }
});
