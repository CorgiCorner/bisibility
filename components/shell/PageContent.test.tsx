import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageContent } from "./PageContent";

describe("PageContent", () => {
  it("uses the analytics width by default", () => {
    const html = renderToStaticMarkup(<PageContent>content</PageContent>);
    expect(html).toContain("w-full");
    expect(html).toContain("mx-auto");
    expect(html).toContain("max-w-[1400px]");
  });

  it("left-aligns the shared form width", () => {
    const html = renderToStaticMarkup(<PageContent variant="form">content</PageContent>);
    expect(html).toContain("max-w-settings");
    expect(html).not.toContain("max-w-[1400px]");
    expect(html).not.toContain("mx-auto");
  });

  it("lets callers replace the shared form width", () => {
    const html = renderToStaticMarkup(
      <PageContent variant="form" className="max-w-[640px]">
        content
      </PageContent>,
    );
    expect(html).toContain("max-w-[640px]");
    expect(html).not.toContain("max-w-settings");
  });
});
