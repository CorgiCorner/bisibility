import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { composerCopy } from "./model-playground-composer-copy.test-support";
import { renderNative as render } from "./model-playground-render.test-support";

describe("native composer DOM", () => {
  it("omits the duplicate lead and keys block, shows a free estimate and explicit cost and retention notice", async () => {
    render();
    expect(screen.queryByText(composerCopy.lead)).toBeNull();
    expect(screen.queryByRole("region", { name: "Keys" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage OpenAI" })).toBeNull();
    expect(screen.getByRole("button", { name: "Run" })).toHaveAttribute(
      "title",
      expect.stringContaining(composerCopy.historyNotice),
    );
    expect(screen.queryByRole("button", { name: /Pay with|top.up/i })).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    expect(screen.getByLabelText(composerCopy.estimate)).toHaveTextContent("~$0.0024");
  });
  it("discloses unknown provider prices in both estimate and Run consent", async () => {
    const { preview, originalPreview } = render();
    preview.mockImplementation(async (...args) => {
      const quote = await originalPreview(...args);
      return {
        ...quote,
        forecasts: quote.forecasts.map((item, index) =>
          index
            ? item
            : {
                ...item,
                complete: false,
                money: {
                  amount: null,
                  currency: "USD",
                  certainty: "unknown",
                  basis: "unknown",
                  rateCardVersion: null,
                },
              },
        ),
      };
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    expect(screen.getByLabelText(composerCopy.estimate)).toHaveTextContent(
      composerCopy.unknownCost,
    );
    expect(screen.getByText(composerCopy.spendNotice, { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText(composerCopy.estimate)).toHaveTextContent(
      composerCopy.fundingOwnKey,
    );
  });
  it("operates Add, settings, remove and Run with keyboard", async () => {
    const { launch } = render();
    const user = userEvent.setup();
    const add = screen.getByRole("button", { name: "Add model" });
    add.focus();
    await user.keyboard("{Enter}");
    let drawer = screen.getByRole("dialog", { name: "Add model" });
    expect(within(drawer).queryByLabelText("Temperature")).toBeNull();
    within(drawer).getByRole("button", { name: "Add model" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelectorAll("[data-column-id]")).toHaveLength(3);
    expect(add).toHaveFocus();
    const settings = screen.getAllByRole("button", { name: /^Settings:/ })[0];
    settings.focus();
    await user.keyboard("{Enter}");
    drawer = screen.getByRole("dialog", { name: "Column settings" });
    await user.clear(within(drawer).getByLabelText("Output token limit"));
    await user.type(within(drawer).getByLabelText("Output token limit"), "512");
    within(drawer).getByRole("button", { name: "Save changes" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(settings).toHaveFocus();
    screen.getAllByRole("button", { name: /^Remove:/ })[2].focus();
    await user.keyboard("{Enter}");
    expect(document.querySelectorAll("[data-column-id]")).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    screen.getByRole("button", { name: "Run" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(launch).toHaveBeenCalledTimes(1));
    // Two animated drawers and a paid-launch mock form one keyboard journey.
  }, 15_000);
  it("keeps history visible while read-only controls explain why they are disabled", async () => {
    const { launch } = render(false);
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Manage OpenAI" })).toBeNull();
    expect(screen.getAllByText(composerCopy.readOnly).length).toBeGreaterThan(0);
    expect(launch).not.toHaveBeenCalled();
  });
  it.each(["planned", "missing"])(
    "blocks an unavailable or missing key (%s) in the form",
    async (state) => {
      render(true, (fixture) => {
        fixture.connections[0] = {
          ...fixture.connections[0],
          ...(state === "planned" ? { status: "planned" } : { hasStoredCredentials: false }),
        };
      });
      expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
      if (state === "planned")
        expect(screen.queryByRole("link", { name: "Connect OpenAI" })).toBeNull();
      else
        expect(screen.getByRole("link", { name: "Connect OpenAI" })).toHaveAttribute(
          "href",
          "/app/prj_test/providers?connect=openai#provider-openai",
        );
      const card = document.querySelector("[data-column-id]") as HTMLElement;
      expect(within(card).getByRole("alert").textContent).toMatch(
        /connection|available|key|disconnected/i,
      );
      await userEvent.click(within(card).getByRole("button", { name: /^Settings:/ }));
      await userEvent.click(screen.getByRole("button", { name: "Provider" }));
      expect(screen.getByRole("menuitem", { name: /OpenAI/ })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    },
  );
});

it("offers provider setup without a keys list when no model can be added", () => {
  render(true, (fixture) => {
    fixture.connections = fixture.connections.map((connection) => ({
      ...connection,
      hasStoredCredentials: false,
    }));
    fixture.input.columns = [];
  });
  expect(screen.queryByRole("region", { name: "Keys" })).toBeNull();
  expect(screen.getByRole("link", { name: "Connect an AI provider" })).toHaveAttribute(
    "href",
    "/app/prj_test/providers",
  );
  expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  const toolbar = document.querySelector('[data-model-playground-block="toolbar"]');
  const setup = document.querySelector("[data-model-playground-setup]");
  expect(
    toolbar && setup && toolbar.compareDocumentPosition(setup) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByText(/Supported providers:/)).toBeNull();
  for (const name of ["OpenAI", "Anthropic", "OpenRouter", "Vercel AI Gateway"])
    expect(screen.getByRole("img", { name })).toBeInTheDocument();
});

it("keeps contextual setup disabled for a role that cannot connect", () => {
  render(
    true,
    (fixture) => {
      fixture.connections[0] = { ...fixture.connections[0], hasStoredCredentials: false };
    },
    false,
  );
  expect(screen.getByRole("button", { name: "Connect OpenAI" })).toBeDisabled();
  expect(screen.queryByRole("link", { name: "Connect OpenAI" })).toBeNull();
});

it("uses the shared provider empty state and respects setup access", () => {
  render(
    false,
    (fixture) => {
      fixture.connections = fixture.connections.map((connection) => ({
        ...connection,
        hasStoredCredentials: false,
      }));
      fixture.input.columns = [];
    },
    false,
  );
  expect(
    document.querySelector(
      "[data-model-playground-setup] [data-provider-empty-state] [data-empty-state]",
    ),
  ).not.toBeNull();
  expect(screen.queryByRole("link", { name: "Connect an AI provider" })).toBeNull();
  expect(
    screen.getByText("Ask a project admin to choose a data source before checks can start."),
  ).toBeInTheDocument();
});

it("briefly describes each result tab for keyboard and pointer users", () => {
  render();
  expect(screen.getByRole("radio", { name: "Answers" })).toHaveAccessibleDescription(
    "Compare the full answers from each model.",
  );
  expect(screen.getByRole("radio", { name: "Brands" })).toHaveAccessibleDescription(
    "See which brands each model mentions.",
  );
  expect(screen.getByRole("radio", { name: "Sources" })).toHaveAccessibleDescription(
    "See the pages each model cites.",
  );
});
