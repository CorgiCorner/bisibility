import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonoText } from "./MonoText";

describe("MonoText", () => {
  it("renders the muted token when muted is true", () => {
    render(<MonoText muted>prj_8fK2Qf9m</MonoText>);

    expect(screen.getByText("prj_8fK2Qf9m")).toHaveStyle({
      color: "var(--fg-muted)",
    });
  });

  it("renders the full foreground token when muted is false", () => {
    render(<MonoText muted={false}>prj_8fK2Qf9m</MonoText>);

    expect(screen.getByText("prj_8fK2Qf9m")).toHaveStyle({
      color: "var(--fg)",
    });
  });

  it("defaults to the full foreground token when muted is omitted", () => {
    render(<MonoText>prj_8fK2Qf9m</MonoText>);

    expect(screen.getByText("prj_8fK2Qf9m")).toHaveStyle({
      color: "var(--fg)",
    });
  });

  it("lets a caller-provided sx color override the muted default", () => {
    render(
      <MonoText muted sx={{ color: "rgb(17, 17, 17)" }}>
        prj_8fK2Qf9m
      </MonoText>,
    );

    expect(screen.getByText("prj_8fK2Qf9m")).toHaveStyle({
      color: "rgb(17, 17, 17)",
    });
  });

  it("preserves the mono family and size class from the cva variants", () => {
    render(<MonoText size="lg">prj_8fK2Qf9m</MonoText>);

    expect(screen.getByText("prj_8fK2Qf9m")).toHaveClass("font-mono", "text-[11px]");
  });
});
