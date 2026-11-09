import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AiOverviewContent } from "./AiOverviewContent";

it("renders headings and lists as structure while leaving provider HTML inert", () => {
  const { container } = render(
    <AiOverviewContent
      ai={{
        present: true,
        paragraphs: [],
        sources: [],
        sections: [
          {
            heading: "Why it matters",
            text: "Content",
            markdown: "- **Discover** words\n- <script>alert(1)</script>",
          },
        ],
      }}
    />,
  );
  expect(screen.getByRole("heading", { name: "Why it matters" })).toBeVisible();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(container.querySelector("strong")).toHaveTextContent("Discover");
  expect(container.querySelector("script")).toBeNull();
});
