import { expect, waitFor } from "storybook/test";

const box = (element: Element) => {
  const { left, right, top, bottom, width } = element.getBoundingClientRect();
  return { left, right, top, bottom, width };
};
const intersection = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

export function assertMatrixLayout(root: ParentNode) {
  const matrix = root.querySelector<HTMLElement>('[data-model-matrix] [role="table"]');
  if (!matrix?.parentElement) throw new Error("Missing matrix scroller");
  const headers = [...matrix.querySelectorAll('[role="columnheader"]')];
  const expectedWidth = Math.max(matrix.parentElement.clientWidth, headers.length * 192);
  expect(box(matrix).width, "Matrix fills its container when the tracks fit").toBeCloseTo(
    expectedWidth,
    1,
  );
  for (const header of headers) {
    expect(box(header).width, "Matrix tracks are at least 192px").toBeGreaterThanOrEqual(192);
    expect(box(header).width, "Matrix tracks share the available width equally").toBeCloseTo(
      expectedWidth / headers.length,
      1,
    );
  }
  for (const row of matrix.querySelectorAll('[role="row"]')) {
    expect(box(row).left, "Row rule starts at the matrix edge").toBe(box(matrix).left);
    expect(box(row).right, "Row rule ends at the matrix edge").toBeCloseTo(box(matrix).right, 1);
    for (const [index, cell] of [...row.children].entries()) {
      expect(box(cell).left, "Header and body tracks align").toBe(box(headers[index]).left);
      expect(box(cell).width, "Header and body widths match").toBe(box(headers[index]).width);
    }
  }
}

export function measureColumnLayout(root: ParentNode) {
  const scroller = root.querySelector<HTMLElement>(".model-playground-scroll");
  if (!scroller) throw new Error("Missing answer scroller");
  const viewport = box(scroller);
  const cards = [...scroller.querySelectorAll<HTMLElement>("article[data-column-id]")].map(
    (card) => {
      const border = box(card);
      const style = getComputedStyle(card);
      const inset = (side: "Left" | "Right" | "Top" | "Bottom") =>
        Number.parseFloat(style[`border${side}Width`]) + Number.parseFloat(style[`padding${side}`]);
      const content = {
        ...border,
        left: border.left + inset("Left"),
        right: border.right - inset("Right"),
        top: border.top + inset("Top"),
        bottom: border.bottom - inset("Bottom"),
        width: border.width - inset("Left") - inset("Right"),
      };
      return {
        border,
        content,
        full: border.left >= viewport.left - 0.5 && border.right <= viewport.right + 0.5,
        snapped: Math.abs(border.left - viewport.left) <= 0.5,
      };
    },
  );
  const fades = [...root.querySelectorAll<HTMLElement>(".model-playground-fade")].map((fade) => ({
    edge: fade.dataset.edge,
    visible: getComputedStyle(fade).display !== "none" && box(fade).width > 0,
    box: box(fade),
  }));
  const full = cards.filter((card) => card.full);
  return {
    viewport,
    scrollLeft: scroller.scrollLeft,
    overflow: document.documentElement.scrollWidth - innerWidth,
    cards,
    fades,
    intersections: fades
      .filter((fade) => fade.visible)
      .flatMap((fade) =>
        full.map((card) => ({
          edge: fade.edge,
          content: intersection(fade.box, card.content),
          border: intersection(fade.box, card.border),
        })),
      ),
  };
}

type Measurement = ReturnType<typeof measureColumnLayout>;

export function assertFadeContent(measured: Measurement) {
  for (const overlap of measured.intersections)
    expect(overlap.content, "Fade does not cover a fully visible card's content").toBe(0);
}

export function assertFadeBorders(measured: Measurement) {
  for (const overlap of measured.intersections)
    expect(overlap.border, "Fade does not cover a fully visible card's border").toBe(0);
}

export function assertColumnPeek(measured: Measurement) {
  if (innerWidth >= 640) return;
  for (const [index, card] of measured.cards.entries()) {
    if (!card.snapped || index >= measured.cards.length - 1) continue;
    const next = measured.cards[index + 1].border;
    expect(next.left, "Next card peeks into the viewport").toBeLessThan(measured.viewport.right);
    expect(measured.viewport.right - next.left, "Peek uses spacing-6").toBe(24);
  }
}

export function assertColumnLayout(root: ParentNode) {
  const measured = measureColumnLayout(root);
  expect(measured.overflow, "No horizontal page overflow").toBe(0);
  expect(
    measured.cards.some((card) => card.full),
    "A whole card remains readable",
  ).toBe(true);
  for (const fade of measured.fades) {
    const partial = measured.cards.some(({ border }) =>
      fade.edge === "start"
        ? border.left < measured.viewport.left - 0.5 && border.right > measured.viewport.left
        : border.right > measured.viewport.right + 0.5 && border.left < measured.viewport.right,
    );
    expect(fade.visible, "Only a partially visible card gets a fade").toBe(partial);
  }
  assertFadeContent(measured);
  assertFadeBorders(measured);
  assertColumnPeek(measured);
  for (const card of measured.cards) {
    if (innerWidth >= 640) expect(card.border.width, "Desktop column width").toBe(400);
    else if (measured.cards.length === 1) {
      expect(card.border.width, "Single mobile card fills the scroller").toBe(
        measured.viewport.width,
      );
      expect(
        measured.fades.some((fade) => fade.visible),
        "Single card has no fade",
      ).toBe(false);
    }
  }
  return measured;
}

export async function assertColumnScrollPositions(root: ParentNode) {
  const scroller = root.querySelector<HTMLElement>(".model-playground-scroll");
  if (!scroller) throw new Error("Missing answer scroller");
  const cards = [...scroller.querySelectorAll<HTMLElement>("article[data-column-id]")];
  const stride = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 0;
  const max = scroller.scrollWidth - scroller.clientWidth;
  for (const target of [0, Math.min(Math.floor((cards.length - 1) / 2) * stride, max), max, 0]) {
    const nudge = target === max ? -Math.min(48, max) : Math.min(48, max - target);
    await assertColumnPosition(root, target, nudge);
  }
}

export async function assertColumnPosition(root: ParentNode, target: number, nudge = 0) {
  const scroller = root.querySelector<HTMLElement>(".model-playground-scroll");
  if (!scroller) throw new Error("Missing answer scroller");
  scroller.scrollTo({ left: target + nudge, behavior: "instant" });
  return waitFor(() => {
    expect(
      Math.abs(scroller.scrollLeft - target),
      "Snap lands on the column start or scroll end",
    ).toBeLessThanOrEqual(0.5);
    return assertColumnLayout(root);
  });
}
