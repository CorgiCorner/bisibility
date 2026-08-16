import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";

function queryImg(): HTMLImageElement | null {
  return document.querySelector("img");
}

describe("Avatar", () => {
  it("renders an image when src is provided", () => {
    render(
      <Avatar
        alt=""
        className="h-8 w-8 rounded-lg"
        initials="JD"
        src="https://example.com/avatar.png"
      />,
    );

    expect(queryImg()).toHaveAttribute("src", "https://example.com/avatar.png");
  });

  it("renders initials when src is null", () => {
    render(<Avatar alt="" className="h-8 w-8 rounded-lg" initials="JD" src={null} />);

    expect(screen.getByText("JD")).toBeInTheDocument();
    expect(queryImg()).toBeNull();
  });

  it("renders initials when src is empty", () => {
    render(<Avatar alt="" className="h-8 w-8 rounded-lg" initials="JD" src="" />);

    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("renders initials when src is undefined", () => {
    render(<Avatar alt="" className="h-8 w-8 rounded-lg" initials="JD" />);

    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("falls back to initials on image load error without a broken-image glyph", () => {
    render(
      <Avatar
        alt=""
        className="h-8 w-8 rounded-lg"
        initials="JD"
        src="https://example.com/missing.png"
      />,
    );

    const img = queryImg();
    expect(img).not.toBeNull();
    act(() => {
      img?.dispatchEvent(new Event("error"));
    });

    expect(screen.getByText("JD")).toBeInTheDocument();
    expect(queryImg()).toBeNull();
  });

  it("renders a new src after a previous src failed to load", () => {
    const { rerender } = render(
      <Avatar
        alt=""
        className="h-8 w-8 rounded-lg"
        initials="JD"
        src="https://example.com/missing.png"
      />,
    );

    const img = queryImg();
    expect(img).not.toBeNull();
    act(() => {
      img?.dispatchEvent(new Event("error"));
    });

    expect(screen.getByText("JD")).toBeInTheDocument();
    expect(queryImg()).toBeNull();

    rerender(
      <Avatar
        alt=""
        className="h-8 w-8 rounded-lg"
        initials="JD"
        src="https://example.com/valid.png"
      />,
    );

    expect(queryImg()).toHaveAttribute("src", "https://example.com/valid.png");
    expect(screen.queryByText("JD")).toBeNull();
  });

  it("applies the className to both the image and the initials span", () => {
    const { rerender } = render(
      <Avatar
        alt=""
        className="h-8 w-8 rounded-lg bg-accent-solid"
        initials="JD"
        src="https://example.com/a.png"
      />,
    );

    expect(queryImg()).toHaveClass("h-8", "w-8", "rounded-lg", "bg-accent-solid");

    rerender(
      <Avatar alt="" className="h-8 w-8 rounded-lg bg-accent-solid" initials="JD" src={null} />,
    );

    expect(screen.getByText("JD")).toHaveClass("h-8", "w-8", "rounded-lg", "bg-accent-solid");
  });

  it("adds object-cover to the image element", () => {
    render(
      <Avatar
        alt=""
        className="h-8 w-8 rounded-lg"
        initials="JD"
        src="https://example.com/a.png"
      />,
    );

    expect(queryImg()).toHaveClass("object-cover");
  });
});
