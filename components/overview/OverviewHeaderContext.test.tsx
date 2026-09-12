import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { OverviewHeaderContext } from "./OverviewHeaderContext";

const options = [
  { label: "Spain", secondary: "Spanish", value: "loc_es_es" },
  { label: "Belgium", secondary: "Dutch", value: "loc_be_nl" },
];
beforeEach(() => setNavigationState({ pathname: "/app/prj_1/dashboard" }));

it("shows markets in the header context and preserves the other dashboard filters", () => {
  setNavigationState({
    pathname: "/app/prj_1/dashboard",
    searchParams: { range: "7d", device: "mobile", tag: "Docs" },
  });
  render(<OverviewHeaderContext options={options} />);
  const markets = screen.getByRole("button", { name: "Markets" });
  expect(screen.getByRole("group", { name: "Change context" })).toContainElement(markets);
  expect(markets).toHaveClass(
    "border-transparent",
    "bg-transparent",
    "hover:border-transparent",
    "hover:bg-bg-sunken",
    "active:bg-bg-inset",
    "focus-visible:outline-accent-solid",
  );
  expect(markets.querySelector("[data-context-switcher-caret]")).toBeInTheDocument();
  fireEvent.click(markets);
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Spain.*Spanish/ }));
  expect(routerMock.push).toHaveBeenCalledWith(
    "/app/prj_1/dashboard?range=7d&device=mobile&tag=Docs&market=loc_es_es",
  );
  fireEvent.click(screen.getByRole("menuitemradio", { name: "All markets" }));
  expect(routerMock.push).toHaveBeenLastCalledWith(
    "/app/prj_1/dashboard?range=7d&device=mobile&tag=Docs",
  );
});

it("keeps the device selector in the header and preserves dashboard filters", () => {
  setNavigationState({
    pathname: "/app/prj_1/dashboard",
    searchParams: new URLSearchParams(
      "range=7d&device=mobile&tag=Docs&market=loc_es_es&market=loc_be_nl",
    ),
  });
  render(<OverviewHeaderContext options={options} />);

  const group = screen.getByRole("group", { name: "Change context" });
  const device = screen.getByRole("button", { name: "Device scope" });
  expect(device).toHaveTextContent("Mobile");
  expect(group).toContainElement(device);
  expect(device).toHaveClass(
    "border-transparent",
    "bg-transparent",
    "hover:border-transparent",
    "hover:bg-bg-sunken",
    "active:bg-bg-inset",
    "focus-visible:outline-accent-solid",
  );
  expect(device.querySelector("[data-context-switcher-caret]")).toBeInTheDocument();

  fireEvent.click(device);
  fireEvent.click(screen.getByRole("menuitem", { name: "Desktop" }));

  expect(routerMock.push).toHaveBeenCalledWith(
    "/app/prj_1/dashboard?range=7d&device=desktop&tag=Docs&market=loc_es_es&market=loc_be_nl",
  );
});

it("reflects multiple markets from direct navigation", () => {
  setNavigationState({
    pathname: "/app/prj_1/dashboard",
    searchParams: new URLSearchParams("market=loc_es_es&market=loc_be_nl"),
  });
  render(<OverviewHeaderContext options={options} />);
  expect(screen.getByRole("button", { name: "Markets" })).toHaveTextContent("2 markets");
  fireEvent.click(screen.getByRole("button", { name: "Markets" }));
  expect(screen.getByRole("menuitemcheckbox", { name: /Spain.*Spanish/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(screen.getByRole("menuitemcheckbox", { name: /Belgium.*Dutch/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

it("omits an empty market selector", () => {
  render(<OverviewHeaderContext options={[]} />);
  expect(screen.queryByRole("button", { name: "Markets" })).not.toBeInTheDocument();
});
