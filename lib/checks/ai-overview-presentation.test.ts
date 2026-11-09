import { expect, it } from "vitest";
import { aiOverviewPresentation } from "./ai-overview-presentation";

it("extracts saved overview text and safe citations without tokens or HTML execution", () => {
  expect(
    aiOverviewPresentation([
      {
        title: "Overview",
        rawFragment: {
          page_token: "private",
          text_blocks: [{ snippet: "Stored answer" }],
          references: [
            { link: "https://example.com/source", title: "Source" },
            { link: "javascript:alert(1)" },
          ],
        },
      },
    ]),
  ).toEqual({
    paragraphs: ["Overview", "Stored answer"],
    sources: [{ url: "https://example.com/source", title: "Source" }],
  });
});
