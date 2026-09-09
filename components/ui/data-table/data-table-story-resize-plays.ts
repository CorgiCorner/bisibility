import { expect, userEvent, waitFor, within } from "storybook/test";

type StoryPlayContext = { canvasElement: HTMLElement };

async function drag(handle: HTMLElement, delta: number) {
  const rect = handle.getBoundingClientRect();
  const startX = rect.left + rect.width / 2;
  expect(handle.ownerDocument.elementFromPoint(startX, rect.top + 10)).toBe(handle);
  await userEvent.pointer([
    { coords: { clientX: startX, clientY: rect.top + 10 }, keys: "[MouseLeft>]", target: handle },
    { coords: { clientX: startX + delta, clientY: rect.top + 10 } },
    { keys: "[/MouseLeft]" },
  ]);
}

export async function playColumnResize({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  const root = canvas.getByTestId("resize");
  const header = root.querySelector<HTMLElement>('[data-column-id="keyword"]');
  const handle = canvas.getByRole("separator", { name: "Resize Keyword column" });
  if (!header) throw new Error("Keyword header is missing");

  await userEvent.dblClick(handle);
  await waitFor(() => expect(header.getBoundingClientRect().width).toBeCloseTo(240, 0));
  expect(root.style.getPropertyValue("--dt-col-keyword")).toBe("240px");
  const initialWidth = header.getBoundingClientRect().width;

  await drag(handle, 48);
  await waitFor(() =>
    expect(header.getBoundingClientRect().width).toBeCloseTo(initialWidth + 48, 0),
  );
  expect(root.style.getPropertyValue("--dt-col-keyword")).toBe("288px");

  await userEvent.dblClick(handle);
  await waitFor(() => expect(header.getBoundingClientRect().width).toBeCloseTo(240, 0));
  expect(root.style.getPropertyValue("--dt-col-keyword")).toBe("240px");

  await drag(handle, -400);
  await waitFor(() => expect(header.getBoundingClientRect().width).toBeCloseTo(160, 0));
}

export async function playKeyboardResize({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  const root = canvas.getByTestId("resize-keyboard");
  const handle = canvas.getByRole("separator", { name: "Resize Position column" });

  await userEvent.dblClick(handle);
  await waitFor(() => expect(root.style.getPropertyValue("--dt-col-position")).toBe("96px"));
  handle.blur();
  handle.focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(root.style.getPropertyValue("--dt-col-position")).toBe("104px");
  await userEvent.keyboard("{Escape}");
  expect(root.style.getPropertyValue("--dt-col-position")).toBe("96px");
  await userEvent.keyboard("{ArrowLeft}{Enter}");
  expect(root.style.getPropertyValue("--dt-col-position")).toBe("88px");
  expect(handle).not.toHaveFocus();
}
