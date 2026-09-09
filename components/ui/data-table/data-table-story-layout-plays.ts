import { expect, userEvent, waitFor, within } from "storybook/test";

type StoryPlayContext = { canvasElement: HTMLElement };

type MenuQueries = ReturnType<typeof within>;

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function closeColumnsMenu(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  const trigger = canvasElement.querySelector<HTMLElement>('button[aria-label="Columns"]');
  if (trigger?.getAttribute("aria-expanded") === "true") {
    await userEvent.keyboard("{Escape}");
  }
  await waitFor(() => {
    expect(body.queryByRole("menu", { hidden: true, name: "Columns" })).not.toBeInTheDocument();
    expect(canvas.getByRole("table")).toBeVisible();
  });
}

async function withColumnsMenu(
  canvasElement: HTMLElement,
  interact: (menu: MenuQueries) => Promise<void>,
) {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByRole("button", { name: "Columns" }));
  try {
    const menu = body.getByRole("menu", { name: "Columns" });
    await interact(within(menu));
  } finally {
    await closeColumnsMenu(canvasElement);
  }
}

function columnHeader(root: HTMLElement, columnId: string) {
  return root.querySelector<HTMLElement>(`[role="columnheader"][data-column-id="${columnId}"]`);
}

function restoreStorageValue(key: string, value: string | null) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

async function restoreVirtualPerformance(
  canvas: MenuQueries,
  root: HTMLElement,
  handle: HTMLElement,
  header: HTMLElement,
  initial: { layout: string | null; left: number; top: number; width: number },
  resizeStartX: number,
) {
  const scrollBehavior = root.style.scrollBehavior;
  try {
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: resizeStartX }));
    handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    root.style.scrollBehavior = "auto";
    for (let frame = 0; frame < 2; frame += 1) {
      root.scrollTo({ behavior: "instant", left: initial.left, top: initial.top });
      root.scrollLeft = initial.left;
      root.scrollTop = initial.top;
      root.dispatchEvent(new Event("scroll", { bubbles: true }));
      await nextFrame();
    }
    await waitFor(() => {
      expect(header.getBoundingClientRect().width).toBeCloseTo(initial.width, 0);
      expect(root.scrollLeft).toBe(initial.left);
      expect(root.scrollTop).toBe(initial.top);
      expect(canvas.getByText("Group 1")).toBeVisible();
    });
  } finally {
    root.style.scrollBehavior = scrollBehavior;
    restoreStorageValue("bv:data-table:performance-10k:v1", initial.layout);
  }
}

export async function playColumnVisibility({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  const root = canvas.getByTestId("visibility");
  const resize = canvas.getByRole("separator", { name: "Resize Device column" });

  resize.focus();
  await userEvent.keyboard("{ArrowRight}{ArrowRight}{Enter}");
  expect(root.style.getPropertyValue("--dt-col-device")).toBe("128px");

  await withColumnsMenu(canvasElement, async (menu) => {
    expect(menu.queryByRole("checkbox", { name: /Keyword column/ })).not.toBeInTheDocument();
    expect(menu.queryByRole("checkbox", { name: /Actions column/ })).not.toBeInTheDocument();
    await userEvent.click(menu.getByRole("checkbox", { name: "Hide Device column" }));
  });

  await waitFor(() => expect(columnHeader(root, "device")).toBeNull());
  expect(root.querySelector('[role="cell"][data-column-id="device"]')).toBeNull();
  expect(root.style.getPropertyValue("--dt-col-device")).toBe("");

  await withColumnsMenu(canvasElement, async (menu) => {
    await userEvent.click(menu.getByRole("checkbox", { name: "Show Device column" }));
  });
  await waitFor(() => expect(columnHeader(root, "device")).toBeVisible());
  expect(root.style.getPropertyValue("--dt-col-device")).toBe("128px");

  await withColumnsMenu(canvasElement, async (menu) => {
    await userEvent.click(menu.getByRole("menuitem", { name: "Reset layout" }));
  });
  await waitFor(() => expect(root.style.getPropertyValue("--dt-col-device")).toBe("112px"));
}

export async function playPersistedLayout({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  let root = canvas.getByTestId("persisted-layout");

  try {
    if (!columnHeader(root, "device")) {
      await withColumnsMenu(canvasElement, async (menu) => {
        await userEvent.click(menu.getByRole("checkbox", { name: "Show Device column" }));
      });
    }
    await waitFor(() => expect(columnHeader(root, "device")).toBeVisible());

    const resize = canvas.getByRole("separator", { name: "Resize Device column" });
    await userEvent.dblClick(resize);
    await waitFor(() => expect(root.style.getPropertyValue("--dt-col-device")).toBe("112px"));
    resize.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{Enter}");
    await waitFor(() => expect(root.style.getPropertyValue("--dt-col-device")).toBe("144px"));

    await withColumnsMenu(canvasElement, async (menu) => {
      await userEvent.click(menu.getByRole("checkbox", { name: "Hide Device column" }));
    });
    await waitFor(() => expect(columnHeader(root, "device")).toBeNull());
    expect(root.querySelector('[role="cell"][data-column-id="device"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem("bv:data-table:persisted-layout:v1") ?? "null")).toEqual(
      expect.objectContaining({
        columnSizing: expect.objectContaining({ device: 144 }),
        columnVisibility: expect.objectContaining({ device: false }),
      }),
    );

    const previousRoot = root;
    await userEvent.click(canvas.getByRole("button", { name: "Remount table" }));
    await waitFor(() => expect(canvas.getByTestId("persisted-layout")).not.toBe(previousRoot));
    root = canvas.getByTestId("persisted-layout");
    expect(columnHeader(root, "device")).toBeNull();

    await withColumnsMenu(canvasElement, async (menu) => {
      await userEvent.click(menu.getByRole("checkbox", { name: "Show Device column" }));
    });
    await waitFor(() => expect(root.style.getPropertyValue("--dt-col-device")).toBe("144px"));

    await withColumnsMenu(canvasElement, async (menu) => {
      await userEvent.click(menu.getByRole("checkbox", { name: "Hide Device column" }));
    });
    await waitFor(() => expect(columnHeader(root, "device")).toBeNull());
  } finally {
    await closeColumnsMenu(canvasElement);
  }
}

export async function playPinnedScroll({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  const root = canvas.getByTestId("pinned-scroll");
  const keywordHeader = root.querySelector<HTMLElement>(
    '[role="columnheader"][data-column-id="keyword"]',
  );
  const keywordCell = root.querySelector<HTMLElement>('[role="cell"][data-column-id="keyword"]');
  const actionsHeader = root.querySelector<HTMLElement>(
    '[role="columnheader"][data-column-id="actions"]',
  );
  if (!keywordHeader || !keywordCell || !actionsHeader) throw new Error("Pinned cells are missing");

  expect(root.scrollWidth).toBeGreaterThan(root.clientWidth);
  expect(getComputedStyle(keywordHeader).position).toBe("sticky");
  expect(getComputedStyle(keywordCell).position).toBe("sticky");
  expect(getComputedStyle(actionsHeader).position).toBe("sticky");
  const headerLeft = keywordHeader.getBoundingClientRect().left;
  const cellLeft = keywordCell.getBoundingClientRect().left;
  const actionsRight = actionsHeader.getBoundingClientRect().right;

  root.scrollLeft = 320;
  root.dispatchEvent(new Event("scroll", { bubbles: true }));
  await nextFrame();
  expect(root).toHaveAttribute("data-scrolled", "true");
  expect(keywordHeader.getBoundingClientRect().left).toBeCloseTo(headerLeft, 0);
  expect(keywordCell.getBoundingClientRect().left).toBeCloseTo(cellLeft, 0);
  expect(actionsHeader.getBoundingClientRect().right).toBeCloseTo(actionsRight, 0);
  expect(getComputedStyle(keywordHeader).boxShadow).not.toBe("none");

  root.scrollLeft = 0;
  root.dispatchEvent(new Event("scroll", { bubbles: true }));
  await nextFrame();
  expect(root).toHaveAttribute("data-scrolled", "false");
  expect(getComputedStyle(keywordHeader).boxShadow).toBe("none");
}

export async function playResponsiveWidths({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  for (const width of [375, 768, 1024]) {
    const viewport = canvas.getByTestId(`responsive-${width}`);
    const table = within(viewport).getByRole("table");
    expect(viewport.getBoundingClientRect().width).toBeCloseTo(width, 0);
    expect(table.getBoundingClientRect().width).toBeCloseTo(width, 0);
    expect(table).toHaveClass("min-w-0", "overflow-x-auto");
    const pinned = table.querySelector<HTMLElement>('[data-column-id="keyword"]');
    expect(pinned).not.toBeNull();
    expect(getComputedStyle(pinned as HTMLElement).position).toBe("sticky");
  }
  const narrowTable = within(canvas.getByTestId("responsive-375")).getByRole("table");
  expect(narrowTable.scrollWidth).toBeGreaterThan(narrowTable.clientWidth);
  await waitFor(() =>
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    ),
  );
}

export async function playFillLayout({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  const root = canvas.getByTestId("fill-layout");
  const header = root.querySelector<HTMLElement>('[role="rowgroup"]');
  const footer = canvas.getByTestId("data-table-footer");
  if (!header) throw new Error("Fill header is missing");
  expect(getComputedStyle(header).position).toBe("sticky");
  expect(getComputedStyle(header).top).toBe("0px");
  expect(getComputedStyle(footer).position).toBe("sticky");
  expect(getComputedStyle(footer).bottom).toBe("0px");
  expect(footer.parentElement).toBe(root);
  expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    root.getBoundingClientRect().bottom + 1,
  );
}

export async function playVirtualPerformance({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  const root = canvas.getByTestId("performance-10k");
  const body = canvas.getByTestId("performance-10k-body");
  const reset = canvas.getByRole("button", { name: "Reset row-cell subtree commits" });
  const rowCellCommits = canvas.getByTestId("performance-row-cell-commits");
  const handle = canvas.getByRole("separator", { name: "Resize Keyword column" });
  const header = root.querySelector<HTMLElement>('[role="columnheader"][data-column-id="keyword"]');
  if (!header) throw new Error("Performance keyword header is missing");
  const rect = handle.getBoundingClientRect();
  const initial = {
    layout: localStorage.getItem("bv:data-table:performance-10k:v1"),
    left: root.scrollLeft,
    top: root.scrollTop,
    width: header.getBoundingClientRect().width,
  };
  let playError: unknown;
  let playFailed = false;

  try {
    expect(root).toHaveAttribute("aria-rowcount", "11000");
    expect(root.scrollHeight).toBeGreaterThan(500_000);
    expect(body.childElementCount).toBeLessThan(40);

    await userEvent.click(reset);
    handle.focus();
    handle.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: rect.right }),
    );
    for (const delta of [8, 16, 24, 32]) {
      document.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: rect.right + delta }),
      );
      await nextFrame();
      expect(header.getBoundingClientRect().width).toBeCloseTo(initial.width + delta, 0);
      expect(rowCellCommits).toHaveAttribute("data-count", "0");
    }
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: rect.right + 32 }));
    await nextFrame();
    expect(header.getBoundingClientRect().width).toBeCloseTo(initial.width + 32, 0);
    expect(rowCellCommits).toHaveAttribute("data-count", "0");

    root.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 1_200 }));
    root.scrollTo({ behavior: "smooth", top: 48_000 });
    await new Promise((resolve) => setTimeout(resolve, 460));
    expect(root.scrollTop).toBeGreaterThan(0);
    const firstRenderedRow = body.querySelector<HTMLElement>('[role="row"][aria-rowindex]');
    expect(Number(firstRenderedRow?.getAttribute("aria-rowindex"))).toBeGreaterThan(2);
    const frameOutput = canvas.getByTestId("performance-frame-samples");
    expect(Number(frameOutput.dataset.samples)).toBeGreaterThan(5);
    expect(Number(frameOutput.dataset.p95)).toBeGreaterThan(0);
    expect(body.childElementCount).toBeLessThan(40);
  } catch (error) {
    playFailed = true;
    playError = error;
  }

  try {
    await restoreVirtualPerformance(canvas, root, handle, header, initial, rect.right);
  } catch (cleanupError) {
    if (!playFailed) throw cleanupError;
  }
  if (playFailed) throw playError;
}
