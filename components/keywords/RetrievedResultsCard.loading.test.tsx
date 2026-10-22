import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { RetrievedResults } from "@/lib/checks/contract";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RetrievedResultsCard } from "./RetrievedResultsCard";
import { entry, fullResults, OLDER_ID, renderCard } from "./retrieved-results-test-fixtures";

describe("RetrievedResultsCard loading", () => {
  it("keeps loading and error states truthful in both modes", async () => {
    const pending = new Promise<RetrievedResults[]>(() => {});
    const { rerender } = render(
      <RetrievedResultsCard
        entries={[entry()]}
        initialResults={null}
        loadResults={() => pending}
        rankingUrl={null}
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    expect(screen.getByText("Loading stored results...")).toBeInTheDocument();
    const body = screen.getByTestId("retrieved-results-body");
    expect(body).toHaveClass("h-[480px]", "sm:h-[520px]", "overflow-y-auto");

    rerender(
      <RetrievedResultsCard
        entries={[entry(), entry({ checkId: OLDER_ID })]}
        initialResults={fullResults()}
        loadResults={async () => {
          throw new Error("nope");
        }}
        rankingUrl={null}
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Stored results could not be loaded. Try again.",
    );
    expect(screen.getByTestId("retrieved-results-body")).toBe(body);
  });

  it("uses the requested project timezone and calendar order for stored-check labels", () => {
    render(
      <RetrievedResultsCard
        entries={[entry({ checkedAt: "2026-08-02T06:00:00.000Z" })]}
        initialResults={fullResults()}
        loadResults={async () => []}
        rankingUrl={null}
        retentionDays={90}
        timeZone="America/Los_Angeles"
      />,
      { dateFormat: "day_first" },
    );

    expect(screen.getByRole("button", { name: "Stored checks" })).toHaveTextContent(
      "1 Aug 2026, 23:00",
    );
  });

  it("shows the shared stale-deployment recovery for loadResults", async () => {
    render(
      <RetrievedResultsCard
        entries={[entry(), entry({ checkId: OLDER_ID })]}
        initialResults={fullResults()}
        loadResults={async () => {
          throw new Error("Failed to find Server Action");
        }}
        rankingUrl={null}
        retentionDays={90}
        timeZone="UTC"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /updated while this page was open/i,
    );
  });

  it("shows the shared digest recovery for loadResults", async () => {
    render(
      <RetrievedResultsCard
        entries={[entry(), entry({ checkId: OLDER_ID })]}
        initialResults={fullResults()}
        loadResults={async () => {
          throw Object.assign(new Error("An unexpected response was received from the server"), {
            digest: "d1",
          });
        }}
        rankingUrl={null}
        retentionDays={90}
        timeZone="UTC"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/ref d1/i);
  });

  it("does not expose an unknown loadResults failure", async () => {
    render(
      <RetrievedResultsCard
        entries={[entry(), entry({ checkId: OLDER_ID })]}
        initialResults={fullResults()}
        loadResults={async () => {
          throw new Error("private provider message");
        }}
        rankingUrl={null}
        retentionDays={90}
        timeZone="UTC"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Stored results could not be loaded. Try again.",
    );
    expect(screen.queryByText("private provider message")).not.toBeInTheDocument();
  });
});

it("keeps the date picker available and explains why comparison is disabled", () => {
  const { loadResults } = renderCard([entry()], fullResults());
  const date = screen.getByRole("button", { name: "Stored checks" });
  const compare = screen.getByRole("button", { name: "Compare" });
  expect(compare).toBeDisabled();
  expect(compare).toHaveAccessibleDescription("At least two stored checks are needed to compare.");
  date.focus();
  expect(date).toHaveFocus();
  fireEvent.click(compare);
  expect(loadResults).not.toHaveBeenCalled();
});
