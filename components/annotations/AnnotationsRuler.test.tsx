import { renderWithTimelineMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { annotationRulerPinCenter } from "@/lib/annotations/ruler";
import type { AnnotationEntry } from "@/lib/annotations/types";
import { describe, expect, it } from "vitest";
import { AnnotationsRuler } from "./AnnotationsRuler";

function entry(id: string, happenedAt: string): AnnotationEntry {
  return {
    automatic: false,
    detail: "",
    endsAt: null,
    happenedAt,
    href: null,
    id,
    kind: "note",
    marker: "N",
    range: null,
    removable: true,
    sourceLabel: "",
    subtitle: "",
    title: id,
  };
}

function ruler(entries: AnnotationEntry[]) {
  return render(
    <AnnotationsRuler
      entries={entries}
      label="Annotations"
      locale="en"
      timeZone="UTC"
      windowStart="2026-08-12T00:00:00Z"
      windowEnd="2026-11-10T00:00:00Z"
    />,
  );
}

describe("AnnotationsRuler pin positioning", () => {
  it("positions sized wrappers against the ruler using the same date scale as the ticks", () => {
    const { container } = ruler([
      entry("first", "2026-08-12T00:00:00Z"),
      entry("last", "2026-11-10T00:00:00Z"),
    ]);
    expect(container.querySelector("svg[role='img']")).toHaveAttribute(
      "preserveAspectRatio",
      "none",
    );
    const positions = [
      ...container.querySelectorAll<HTMLElement>("[data-annotation-pin-position]"),
    ];
    expect(positions.map((pin) => pin.style.getPropertyValue("--annotation-pin-x"))).toEqual([
      `${annotationRulerPinCenter(0, 390)}px`,
      `${annotationRulerPinCenter(1, 390)}px`,
    ]);
    for (const position of positions) {
      expect(position).toHaveClass("absolute", "size-4.5", "top-9");
      expect(position.parentElement).toHaveClass("relative", "h-24");
      const pin = position.querySelector("button");
      expect(pin).toHaveClass("size-full");
      expect(pin).not.toHaveClass("absolute");
      expect(pin?.parentElement).toHaveClass("size-full");
    }
  });

  it("merges two entries on the same day into a single count pin", () => {
    const { container } = ruler([
      entry("first", "2026-11-01T01:00:00Z"),
      entry("second", "2026-11-01T18:00:00Z"),
    ]);
    const pins = container.querySelectorAll("[data-annotation-pin]");
    expect(pins).toHaveLength(1);
    expect(pins[0]).toHaveTextContent("2");
  });
});
