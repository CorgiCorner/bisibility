import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportBody } from "./ReportBody";

describe("report analysis rendering", () => {
  it("escapes markup and URLs rather than rendering producer HTML", () => {
    const payload = '<img src="x" onerror="alert(1)"><script>alert(1)</script>';
    const { container } = render(
      <ReportBody
        value={{
          analysis: payload,
          url: "javascript:alert(1)",
          nested: [{ text: "<iframe srcdoc='bad'>" }],
        }}
      />,
    );
    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
    expect(container.querySelector("script,img,iframe,a")).toBeNull();
  });
  it("renders nested primitive arrays and false, zero and null without omissions", () => {
    render(<ReportBody value={{ rows: [0, false, null, "Saved observation"] }} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.getByText("Saved observation")).toBeInTheDocument();
  });
});
