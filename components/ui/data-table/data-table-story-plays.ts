import { expect, userEvent, waitFor, within } from "storybook/test";

type StoryPlayContext = { canvasElement: HTMLElement };

function bodyKeywords(canvasElement: HTMLElement, id: string): string[] {
  const body = within(canvasElement).getByTestId(`${id}-body`);
  return [...body.querySelectorAll<HTMLElement>('[data-column-id="keyword"] a')].map(
    (cell) => cell.textContent ?? "",
  );
}

export async function playServerSorting({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  const initialOrder = bodyKeywords(canvasElement, "sort-server");
  expect(canvas.queryByRole("button", { name: /Sort Device/ })).not.toBeInTheDocument();

  await userEvent.click(canvas.getByRole("button", { name: "Sort Keyword ascending" }));
  await waitFor(() =>
    expect(canvas.getByTestId("sort-server-sorting")).toHaveTextContent("keyword:asc"),
  );
  expect(bodyKeywords(canvasElement, "sort-server")).toEqual(initialOrder);

  await userEvent.click(canvas.getByRole("button", { name: "Sort Keyword descending" }));
  await waitFor(() =>
    expect(canvas.getByTestId("sort-server-sorting")).toHaveTextContent("keyword:desc"),
  );
  expect(bodyKeywords(canvasElement, "sort-server")).toEqual(initialOrder);

  await userEvent.click(canvas.getByRole("button", { name: "Clear Keyword sorting" }));
  await waitFor(() =>
    expect(canvas.getByTestId("sort-server-sorting")).toHaveTextContent("default"),
  );

  await userEvent.click(canvas.getByRole("button", { name: "Sort Volume descending" }));
  await waitFor(() =>
    expect(canvas.getByTestId("sort-server-sorting")).toHaveTextContent("volume:desc"),
  );
}

export async function playStableClientSorting({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "Sort Position ascending" }));
  await waitFor(() =>
    expect(bodyKeywords(canvasElement, "sort-client")).toEqual([
      "First result",
      "Earlier equal result",
      "Later equal result",
    ]),
  );

  await userEvent.click(canvas.getByRole("button", { name: "Sort Position descending" }));
  await waitFor(() =>
    expect(bodyKeywords(canvasElement, "sort-client")).toEqual([
      "Earlier equal result",
      "Later equal result",
      "First result",
    ]),
  );
}

export async function playGroupingAndSelection({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  const groupLabel = canvas.getByText("Monitoring group");
  const groupRow = groupLabel.closest<HTMLElement>('[role="row"]');
  expect(groupRow).not.toBeNull();
  expect(canvas.queryByText("open source rank tracker")).not.toBeInTheDocument();

  await userEvent.click(groupRow as HTMLElement);
  await waitFor(() => expect(canvas.getByText("open source rank tracker")).toBeVisible());
  expect(canvas.getByRole("button", { name: "Collapse Monitoring group" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(canvas.getByText("open source rank tracker").closest('[role="row"]')).toHaveAttribute(
    "data-depth",
    "1",
  );

  await userEvent.click(canvas.getByRole("button", { name: "Collapse Monitoring group" }));
  await waitFor(() =>
    expect(canvas.queryByText("open source rank tracker")).not.toBeInTheDocument(),
  );
  expect(canvas.getByRole("button", { name: "Expand Monitoring group" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await userEvent.click(canvas.getByRole("button", { name: "Expand Monitoring group" }));
  await waitFor(() => expect(canvas.getByText("open source rank tracker")).toBeVisible());

  await userEvent.click(canvas.getByRole("checkbox", { name: "Select Monitoring group" }));
  await waitFor(() =>
    expect(canvas.getByTestId("grouping-selection-selection")).toHaveTextContent(
      "leaf-agency,leaf-local,leaf-open",
    ),
  );
  expect(canvas.getByRole("checkbox", { name: "Select Monitoring group" })).toBeChecked();
  expect(canvas.getByRole("checkbox", { name: "Select open source rank tracker" })).toBeChecked();
  expect(canvas.getByRole("checkbox", { name: "Select local rank tracker" })).toBeChecked();
  expect(groupRow).toHaveAttribute("data-selected", "true");

  await userEvent.click(canvas.getByRole("checkbox", { name: "Select open source rank tracker" }));
  await waitFor(() =>
    expect(canvas.getByRole("checkbox", { name: "Select Monitoring group" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    ),
  );
  expect(canvas.getByTestId("grouping-selection-selection")).toHaveTextContent(
    "leaf-agency,leaf-local",
  );
  expect(canvas.getByRole("checkbox", { name: "Select visible rows" })).toHaveAttribute(
    "aria-checked",
    "mixed",
  );
  const archived = canvas.getByText("archived comparison").closest<HTMLElement>('[role="row"]');
  expect(within(archived as HTMLElement).queryByRole("checkbox")).not.toBeInTheDocument();
  await userEvent.click(
    canvas.getByRole("button", { name: "Open actions for search visibility report" }),
  );
  expect(canvas.getByTestId("grouping-selection-row-click")).toHaveTextContent("row:none");
}

export async function playSections({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  const section = canvas.getByText("Priority markets").closest<HTMLElement>('[role="row"]');
  expect(section).toHaveAttribute("aria-level", "1");
  expect(within(section as HTMLElement).queryByRole("button")).not.toBeInTheDocument();
  expect(canvas.getByText("technical seo audit").closest('[role="row"]')).toHaveAttribute(
    "data-depth",
    "1",
  );
  expect(canvas.queryByTestId("data-table-footer")).not.toBeInTheDocument();
}

export async function playPagination({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  expect(canvas.getByRole("table")).toHaveAttribute("aria-rowcount", "1240");
  expect(canvas.getByText("1-10 of 1,240")).toBeVisible();
  await userEvent.click(canvas.getByRole("button", { name: "Next page" }));
  await waitFor(() => expect(canvas.getByText("11-20 of 1,240")).toBeVisible());
  expect(canvas.getByTestId("pagination-pagination")).toHaveTextContent("page:2:10");

  await userEvent.click(canvas.getByRole("button", { name: "Previous page" }));
  await waitFor(() => expect(canvas.getByText("1-10 of 1,240")).toBeVisible());
  await userEvent.click(canvas.getByRole("button", { name: "Rows per page" }));
  const menu = within(canvasElement.ownerDocument.body).getByRole("menu", {
    name: "Rows per page",
  });
  await userEvent.click(within(menu).getByRole("menuitem", { name: "25" }));
  await waitFor(() => expect(canvas.getByText("1-25 of 1,240")).toBeVisible());
  expect(canvas.getByTestId("pagination-pagination")).toHaveTextContent("page:1:25");
  await waitFor(() => expect(canvas.getByRole("table")).toBeVisible());
}

export async function playClientPagination({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  expect(canvas.getByRole("table")).toHaveAttribute("aria-rowcount", "12");
  expect(canvas.getByText("1-10 of 12")).toBeVisible();
  expect(bodyKeywords(canvasElement, "client-pagination")).toHaveLength(10);

  await userEvent.click(canvas.getByRole("button", { name: "Next page" }));
  await waitFor(() => expect(canvas.getByText("11-12 of 12")).toBeVisible());
  expect(bodyKeywords(canvasElement, "client-pagination")).toEqual([
    "Client row 11",
    "Client row 12",
  ]);
}

export async function playDensity(
  { canvasElement }: StoryPlayContext,
  id: string,
  expectedHeight: number,
) {
  const canvas = within(canvasElement);
  const row = canvas.getByText("search visibility report").closest<HTMLElement>('[role="row"]');
  expect(row?.getBoundingClientRect().height).toBeCloseTo(expectedHeight, 0);
  expect(canvas.getByTestId(`${id}-density`)).toHaveTextContent(id.replace("density-", ""));
}

export async function playDensityMenu(context: StoryPlayContext) {
  const { canvasElement } = context;
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await playDensity(context, "density-standard", 68);

  try {
    await userEvent.click(canvas.getByRole("button", { name: "Table density" }));
    const menu = body.getByRole("menu", { name: "Table density" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Comfortable" }));
    const row = canvas.getByText("search visibility report").closest<HTMLElement>('[role="row"]');
    await waitFor(() => expect(row?.getBoundingClientRect().height).toBeCloseTo(78, 0));
    expect(canvas.getByTestId("density-standard-density")).toHaveTextContent("comfortable");
  } finally {
    if (body.queryByRole("menu", { hidden: true, name: "Table density" })) {
      await userEvent.keyboard("{Escape}");
    }
    await waitFor(() => {
      expect(
        body.queryByRole("menu", { hidden: true, name: "Table density" }),
      ).not.toBeInTheDocument();
      expect(canvas.getByRole("table")).toBeVisible();
    });
  }
}

export async function playEmptyAndPending({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  expect(canvas.getByText("No tracked phrases yet")).toBeVisible();
  expect(canvas.getByRole("table")).toHaveAttribute("aria-rowcount", "0");
}

export async function playPending({ canvasElement }: StoryPlayContext) {
  const canvas = within(canvasElement);
  expect(canvas.getByRole("table")).toHaveAttribute("aria-busy", "true");
  expect(canvas.getByTestId("pending-body")).toHaveClass("opacity-60");
}
