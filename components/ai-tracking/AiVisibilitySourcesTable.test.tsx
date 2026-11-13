import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AiVisibilitySourcesView } from "./AiVisibilitySourcesView";
import { sourcesDataFixture, sourcesPlanFixture, sourcesProjectId } from "./sources-fixtures";

const messages = { ...shared, ...tracking };

function renderSources(
  model = sourcesDataFixture(),
  handlers?: Partial<{
    onAdd: (domain: string, url: string | null) => void;
    onRemove: (domain: string) => void;
    onSetType: (domain: string, type: string) => void;
  }>,
) {
  const onAdd = handlers?.onAdd ?? vi.fn();
  const onRemove = handlers?.onRemove ?? vi.fn();
  const onSetType = handlers?.onSetType ?? vi.fn();
  const rendered = renderWithFeatureMessages(
    <AiVisibilitySourcesView
      error={null}
      model={model}
      onAdd={onAdd}
      onClearType={() => undefined}
      onFilter={() => undefined}
      onRemove={onRemove}
      onSetType={onSetType}
      onUpdatePlan={() => undefined}
      pending={false}
      projectId={sourcesProjectId}
    />,
    { messages, timeZone: "UTC" },
  );
  return { onAdd, onRemove, onSetType, ...rendered };
}

afterEach(() => {
  cleanup();
});

it("offers add and set type only on third-party rows", async () => {
  const { onAdd, onSetType } = renderSources();
  const add = screen.getByRole("button", { name: "Add directory.example.org to plan" });
  expect(add).toHaveClass("whitespace-nowrap");
  expect(add).toHaveAttribute("data-variant", "secondary");
  expect(screen.getByRole("row", { name: /directory\.example\.org/ })).toHaveStyle({
    height: "56px",
  });
  const you = screen.getByRole("row", { name: /acme\.example\.com/ });
  expect(within(you).queryByRole("button", { name: /plan/i })).toBeNull();
  expect(within(you).queryByRole("button", { name: /type/i })).toBeNull();
  const competitor = screen.getByRole("row", { name: /north\.example\.org/ });
  expect(within(competitor).queryByRole("button", { name: /plan/i })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Add directory.example.org to plan" }));
  expect(onAdd).toHaveBeenCalledWith("directory.example.org", null);
  await userEvent.click(screen.getByRole("button", { name: "Set type for notes.example.com" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Directory" }));
  expect(onSetType).toHaveBeenCalledWith("notes.example.com", "directory");
});

it("toggles a planned source off and keeps the plan card", async () => {
  const { onRemove } = renderSources(sourcesPlanFixture());
  expect(screen.getByDisplayValue("Ask for a listing")).toBeTruthy();
  expect(screen.queryByText(/cannot tell whether you are already listed/)).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Remove directory.example.org from the plan" }),
  );
  expect(onRemove).toHaveBeenCalledWith("directory.example.org");
});

it("replaces filtered source rows when the server model changes", () => {
  const model = sourcesDataFixture();
  const { rerender } = renderSources(model);
  expect(screen.getByRole("row", { name: /directory.example.org/ })).toBeInTheDocument();
  rerender(
    <AiVisibilitySourcesView
      error={null}
      model={{
        ...model,
        sources: { ...model.sources, rows: [] },
        filters: { ...model.filters, period: "7d" },
      }}
      onAdd={() => undefined}
      onClearType={() => undefined}
      onFilter={() => undefined}
      onRemove={() => undefined}
      onSetType={() => undefined}
      onUpdatePlan={() => undefined}
      pending={false}
      projectId={sourcesProjectId}
    />,
  );
  expect(screen.queryByRole("row", { name: /directory.example.org/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Period" })).toHaveTextContent("7");
});
