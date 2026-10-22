import { trackingSampleFixtures } from "@/components/ai-tracking/fixtures";
import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AiRunResults } from "./AiRunResults";
import { aiRunFixture } from "./ai-runs.fixtures";

it("renders retained evidence with a translated measurement and safe citation URLs", () => {
  const sample = trackingSampleFixtures[0];
  render(
    <AiRunResults
      run={aiRunFixture}
      backHref="/runs"
      nextHref={null}
      samples={[
        {
          ...sample,
          citations: [
            ...sample.citations,
            { url: "javascript:alert(1)", title: "Unsafe citation", position: 2 },
          ],
        },
      ]}
    />,
  );
  expect(screen.getByText(/Answer available/)).toBeVisible();
  expect(screen.getByText(sample.evidence?.answerText ?? "missing")).toBeVisible();
  expect(screen.getByRole("link", { name: "Rank tracking guide" })).toHaveAttribute(
    "href",
    "https://example.com/rank-tracking-guide",
  );
  expect(screen.getByText("Unsafe citation")).not.toHaveAttribute("href");
});
