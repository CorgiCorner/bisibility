import "./real-page-mocks.test-fixture";
import { routerMock } from "@/tests/next-navigation";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { realPage } from "./real-page-mocks.test-fixture";
import { renderRealPage } from "./real-page-render.test-fixture";
import { prepareRealScenario } from "./real-page-scenario.test-fixture";

const settle = async () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
it("restores off-page account drawers across URL navigation and a fresh mount", async () => {
  prepareRealScenario("ManyAccounts");
  const result = await renderRealPage("Accounts");
  fireEvent.click(screen.getByRole("button", { name: "user01@example.com" }));
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("user01@example.com"));
  const selected = realPage.params.toString();
  expect(realPage.params.get("drawer")).toBe("account");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close drawer" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  realPage.navigate(`/app/admin/users/accounts?${selected}&page=3`);
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("user01@example.com"));
  result.unmount();
  await renderRealPage("Accounts");
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("user01@example.com"));
  expect(realPage.lookup).toHaveBeenCalledWith("public-1");
});
it("restores case selection and clearing a default sort after refresh", async () => {
  prepareRealScenario("RecoveryParity");
  const result = await renderRealPage("Tasks");
  fireEvent.click(screen.getAllByRole("button", { name: "Details" })[0]);
  await screen.findByRole("dialog");
  expect(realPage.params.get("case")).toBeTruthy();
  const selected = realPage.params.toString();
  result.unmount();
  await renderRealPage("Tasks");
  expect(screen.getByRole("dialog")).toHaveTextContent("Case details");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close modal" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  realPage.navigate(`/app/admin/operations/tasks?${selected}`);
  await screen.findByRole("dialog");
});
it("retains search, sort and page size and resets paging when submitting search", async () => {
  prepareRealScenario("ManyAccounts");
  realPage.params = new URLSearchParams("page=2&pageSize=10&sort=email&direction=asc");
  const result = await renderRealPage("Accounts");
  fireEvent.change(screen.getByRole("textbox", { name: "Search accounts" }), {
    target: { value: "user27" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search accounts" }));
  await waitFor(() => expect(realPage.params.get("search")).toBe("user27"));
  await settle();
  expect(realPage.params.get("page")).toBe("1");
  expect(realPage.params.get("sort")).toBe("email");
  expect(realPage.params.get("pageSize")).toBe("10");
  result.unmount();
  await renderRealPage("Accounts");
  expect(screen.getByRole("textbox", { name: "Search accounts" })).toHaveValue("user27");
  expect(screen.getByText("user27@example.com")).toBeVisible();
});
it("gets a new authorized preview after closing and reopening a batch", async () => {
  prepareRealScenario("RecoveryParity");
  await renderRealPage("Tasks");
  const table = screen.getByRole("table", { name: "Task recovery" });
  fireEvent.click(
    within(table)
      .getAllByRole("checkbox")
      .find((item) => !item.hasAttribute("disabled")) as HTMLElement,
  );
  fireEvent.click(screen.getByRole("button", { name: "Review selected (1)" }));
  await waitFor(() => expect(realPage.preview).toHaveBeenCalledTimes(1));
  await settle();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close modal" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Review selected/ }));
  await waitFor(() => expect(realPage.preview).toHaveBeenCalledTimes(2));
});
it("selects cases in memory without rendering the route again", async () => {
  prepareRealScenario("RecoveryParity");
  await renderRealPage("Tasks");
  const table = screen.getByRole("table", { name: "Task recovery" });
  const [first, second] = within(table)
    .getAllByRole("checkbox")
    .filter((item) => !item.hasAttribute("disabled"));
  fireEvent.click(first);
  fireEvent.click(second);
  // Nothing to wait for: a navigation per checkbox would read the whole page from the server.
  expect(first).toBeChecked();
  expect(second).toBeChecked();
  expect(screen.getByRole("button", { name: "Review selected (2)" })).toBeEnabled();
  fireEvent.click(first);
  expect(first).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Review selected (1)" })).toBeEnabled();
  await settle();
  // The same mounted checkboxes: neither the route nor the table cells were rendered anew.
  expect(first).toBeInTheDocument();
  expect(first).not.toBeChecked();
  expect(second).toBeChecked();
  expect(realPage.tasks).toHaveBeenCalledTimes(1);
  expect(routerMock.push).not.toHaveBeenCalled();
  expect(realPage.params.has("selected")).toBe(false);
});
it("keeps the selection when a read seals new case tokens and previews with the latest ones", async () => {
  prepareRealScenario("RecoveryParity");
  await renderRealPage("Tasks");
  const table = () => screen.getByRole("table", { name: "Task recovery" });
  const eligible = within(table())
    .getAllByRole("checkbox")
    .find((item) => !item.hasAttribute("disabled")) as HTMLElement;
  const name = eligible.getAttribute("aria-label") as string;
  fireEvent.click(eligible);
  fireEvent.click(screen.getByRole("button", { name: "Refresh cases" }));
  await waitFor(() => expect(realPage.tasks).toHaveBeenCalledTimes(2));
  await settle();
  expect(within(table()).getByRole("checkbox", { name })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Review selected (1)" }));
  await waitFor(() => expect(realPage.preview).toHaveBeenCalledTimes(1));
  expect(realPage.preview).toHaveBeenCalledWith({ caseTokens: [expect.stringMatching(/:2$/)] });
  await waitFor(() => expect(realPage.params.get("batch")).toMatch(/^\["ref-[a-z]+"\]$/));
  await settle();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close modal" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(within(table()).getByRole("checkbox", { name })).toBeChecked();
  expect(screen.getByRole("button", { name: "Review selected (1)" })).toBeEnabled();
});
