import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { featureMessagesElement } from "@/i18n/test-support/render-with-feature-messages";
import {
  defaultUsageDisplayOptions,
  type ProjectUsageDisplaySettings,
} from "@/lib/project-usage-display/schema";
import en from "@/messages/core/en/project-settings-usage.json";
import sharedEn from "@/messages/core/en/shared.json";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { UsageDisplayControls } from "./UsageDisplayControls";
import { UsageDisplaySettingsProvider } from "./UsageDisplaySettingsProvider";
import { useUsagePresentation } from "./use-usage-presentation";

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/actions/project-usage-display", () => ({ updateProjectUsageDisplay: mocks.save }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const initial: ProjectUsageDisplaySettings = {
  projectId: `prj_${"a".repeat(24)}`,
  revision: 0,
  options: defaultUsageDisplayOptions,
  canEdit: true,
};

function Amount({ label }: { label: string }) {
  const p = useUsagePresentation();
  return (
    <output aria-label={label}>
      {p.figure({ text: "7.4071", unit: "cents", certainty: "measured" })}
      {p.unit("cents")}
    </output>
  );
}
function controls(snapshot = initial) {
  return featureMessagesElement(
    <UsageDisplaySettingsProvider initial={snapshot} key={snapshot.projectId}>
      <UsageDisplayControls />
      <Amount label="Header" />
      <Amount label="Usage" />
      <Amount label="Budget" />
    </UsageDisplaySettingsProvider>,
    { locale: "en", messages: mergeMessageCatalogs(sharedEn, en) },
  );
}
async function waitForDisplayReady(label: string, value: string, control: string) {
  await waitFor(() => {
    expect(screen.getByLabelText(label)).toHaveTextContent(value);
    expect(screen.getByRole("button", { name: control })).toBeEnabled();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockReset();
  localStorage.clear();
});

it("saves shared project options and applies one server response to all three surfaces", async () => {
  let persisted = initial;
  mocks.save.mockImplementation(async (input) => {
    persisted = { ...persisted, revision: input.expectedRevision + 1, options: input.options };
    return { kind: "saved", value: persisted };
  });
  const view = render(controls());
  expect(screen.getByLabelText("Header")).toHaveTextContent("$0.07");
  fireEvent.click(screen.getByRole("button", { name: "Decimal places" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "4" }));
  await waitForDisplayReady("Usage", "$0.0741", "Amounts");
  fireEvent.click(screen.getByRole("button", { name: "Amounts" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cents" }));
  await waitForDisplayReady("Header", "7.4071cents", "Amounts");
  expect(screen.getByLabelText("Budget")).toHaveTextContent("7.4071cents");
  expect(mocks.save).toHaveBeenLastCalledWith({
    projectId: initial.projectId,
    expectedRevision: 1,
    options: { moneyDisplay: "raw-unit", moneyFractionDigits: 4, quantityFractionDigits: 4 },
  });
  expect(localStorage.getItem("bisibility:usage-display:v1")).toBeNull();
  view.unmount();
  render(controls(persisted));
  expect(screen.getByLabelText("Usage")).toHaveTextContent("7.4071cents");
  expect(mocks.refresh).toHaveBeenCalledTimes(2);
});

it("does not import old browser options and disables project viewer writes", () => {
  localStorage.setItem(
    "bisibility:usage-display:v1",
    '{"moneyDisplay":"raw-unit","moneyFractionDigits":6}',
  );
  render(controls({ ...initial, canEdit: false }));
  expect(screen.getByLabelText("Usage")).toHaveTextContent("$0.07");
  expect(screen.getByRole("button", { name: "Amounts" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Decimal places" })).toBeDisabled();
  expect(mocks.save).not.toHaveBeenCalled();
});

it("shows pending and preserves saved amounts when a write fails", async () => {
  let reject!: (reason: Error) => void;
  mocks.save.mockReturnValue(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  render(controls());
  fireEvent.click(screen.getByRole("button", { name: "Amounts" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cents" }));
  expect(screen.getByText("Saving project display settings...")).toHaveAttribute("role", "status");
  expect(screen.getByRole("button", { name: "Amounts" })).toBeDisabled();
  expect(screen.getByLabelText("Usage")).toHaveTextContent("$0.07");
  await act(async () => reject(new Error("write failed")));
  expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
  expect(screen.getByLabelText("Usage")).toHaveTextContent("$0.07");
});

it("shows the other editor's current settings after a revision conflict", async () => {
  mocks.save.mockResolvedValue({
    kind: "conflict",
    value: {
      ...initial,
      revision: 1,
      options: { moneyDisplay: "raw-unit", moneyFractionDigits: 3, quantityFractionDigits: 3 },
    },
  });
  render(controls());
  fireEvent.click(screen.getByRole("button", { name: "Amounts" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cents" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Another editor"));
  expect(screen.getByLabelText("Budget")).toHaveTextContent("7.407cents");
});

it("ignores a response for another project", async () => {
  mocks.save.mockResolvedValue({
    kind: "saved",
    value: {
      ...initial,
      projectId: `prj_${"b".repeat(24)}`,
      revision: 1,
      options: { moneyDisplay: "raw-unit", moneyFractionDigits: 6, quantityFractionDigits: 6 },
    },
  });
  render(controls());
  fireEvent.click(screen.getByRole("button", { name: "Amounts" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cents" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(screen.getByLabelText("Usage")).toHaveTextContent("$0.07");
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("a project switch cannot inherit an in-flight write from the previous project", async () => {
  let resolve!: (value: unknown) => void;
  mocks.save.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = render(controls());
  fireEvent.click(screen.getByRole("button", { name: "Amounts" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cents" }));
  const other = { ...initial, projectId: `prj_${"b".repeat(24)}` };
  view.rerender(controls(other));
  await act(async () =>
    resolve({
      kind: "saved",
      value: {
        ...initial,
        revision: 1,
        options: { moneyDisplay: "raw-unit", moneyFractionDigits: 6, quantityFractionDigits: 6 },
      },
    }),
  );
  expect(screen.getByLabelText("Header")).toHaveTextContent("$0.07");
  expect(screen.getByLabelText("Budget")).toHaveTextContent("$0.07");
});

it("refreshing the same project adopts newer server settings and permission revocation", () => {
  const view = render(controls());
  view.rerender(
    controls({
      ...initial,
      revision: 2,
      canEdit: false,
      options: { moneyDisplay: "raw-unit", moneyFractionDigits: 4, quantityFractionDigits: 4 },
    }),
  );
  expect(screen.getByLabelText("Header")).toHaveTextContent("7.4071cents");
  expect(screen.getByRole("button", { name: "Amounts" })).toBeDisabled();
});

it("disables further edits when the server reports revoked permission", async () => {
  mocks.save.mockResolvedValue({ kind: "forbidden" });
  render(controls());
  fireEvent.click(screen.getByRole("button", { name: "Amounts" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cents" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no longer edit"));
  expect(screen.getByRole("button", { name: "Amounts" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Decimal places" })).toBeDisabled();
  expect(screen.getByLabelText("Usage")).toHaveTextContent("$0.07");
});

it("restores edit permission from fresh server props after an earlier forbidden save", async () => {
  mocks.save.mockResolvedValue({ kind: "forbidden" });
  const view = render(controls());
  fireEvent.click(screen.getByRole("button", { name: "Amounts" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cents" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no longer edit"));
  view.rerender(controls({ ...initial, canEdit: false }));
  expect(screen.getByRole("button", { name: "Amounts" })).toBeDisabled();
  expect(
    screen.getByText("Project editors can change these shared display settings."),
  ).toBeInTheDocument();
  view.rerender(controls({ ...initial, canEdit: true }));
  await waitForDisplayReady("Usage", "$0.07", "Amounts");
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Amounts" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cents" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  expect(mocks.refresh).toHaveBeenCalled();
});
