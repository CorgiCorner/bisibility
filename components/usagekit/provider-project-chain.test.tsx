import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ProviderChainEditor } from "./provider-chain-editor";

it("disables the rank-check switches for a reader", async () => {
  const user = userEvent.setup();
  const commit = vi.fn();
  const snapshot = {
    identity: "reader-switch",
    revision: "1",
    entries: [{ id: "connection", label: "SerpApi", enabled: true, revision: "1" }],
  };
  render(
    <ProviderChainEditor
      mode="project"
      canEdit={false}
      evidence={snapshot}
      snapshot={snapshot}
      onCommit={commit}
      onReload={async () => null}
    />,
  );
  const toggle = screen.getByRole("switch", { name: "Use SerpApi for rank checks" });
  expect(toggle).toBeChecked();
  expect(toggle).toBeDisabled();
  await user.click(toggle);
  expect(toggle).toBeChecked();
  expect(commit).not.toHaveBeenCalled();
});
