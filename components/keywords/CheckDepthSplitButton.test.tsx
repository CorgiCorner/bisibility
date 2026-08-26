import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CheckDepthSplitButton } from "./CheckDepthSplitButton";

function withProjectWriteMode({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ProjectWriteModeProvider projectRef="prj_1" writeMode="active">
      {children}
    </ProjectWriteModeProvider>
  );
}

describe("CheckDepthSplitButton", () => {
  it("uses the compact bulk-bar height and outlined chrome at xs", () => {
    render(
      <CheckDepthSplitButton
        actionLabel="Run check (Top 20)"
        currentDepth={20}
        onAction={vi.fn()}
        onDepthChange={vi.fn()}
        size="xs"
      />,
      { wrapper: withProjectWriteMode },
    );

    const action = screen.getByRole("button", { name: "Run check (Top 20)" });
    expect(action).toHaveClass("min-h-[30px]");
    expect(action).toHaveClass("MuiButton-outlined");
    expect(action).not.toHaveClass("MuiButton-contained");
  });

  it("uses the header CTA height at md", () => {
    render(
      <CheckDepthSplitButton
        actionLabel="Run first check (Top 20)"
        currentDepth={20}
        onAction={vi.fn()}
        onDepthChange={vi.fn()}
      />,
      { wrapper: withProjectWriteMode },
    );

    const action = screen.getByRole("button", { name: "Run first check (Top 20)" });
    expect(action).toHaveClass("min-h-[36px]");
    expect(action).toHaveClass("MuiButton-outlined");
    expect(action).not.toHaveClass("min-h-[30px]");
    expect(action).not.toHaveClass("MuiButton-contained");
  });

  it("runs from the primary button and only changes depth from the menu", () => {
    const onAction = vi.fn();
    const onDepthChange = vi.fn();
    render(
      <CheckDepthSplitButton
        actionLabel="Run check (Top 50)"
        currentDepth={50}
        onAction={onAction}
        onDepthChange={onDepthChange}
      />,
      { wrapper: withProjectWriteMode },
    );

    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 50)" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onDepthChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Top 20" }));
    expect(onDepthChange).toHaveBeenCalledWith(20);
    expect(onAction).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    const changeDefault = screen.getByRole("link", { name: "Change default" });
    expect(changeDefault).toHaveAttribute("href", "/app/prj_1/settings/tracking");
    expect(changeDefault).toHaveClass("w-full");
    expect(changeDefault.closest("li")).toHaveClass("w-full");
    fireEvent.click(changeDefault);
    expect(onDepthChange).toHaveBeenCalledOnce();
  });
});
