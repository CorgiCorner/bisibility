import { AvatarField } from "@/components/account/AvatarField";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("AvatarField", () => {
  it("shows initials when no avatar URL is available", () => {
    render(<AvatarField email="john@example.com" image={null} name="John Doe" />);

    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("shows the display name and email", () => {
    render(<AvatarField email="john@example.com" image={null} name="John Doe" />);

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("falls back to email as display name when name is empty", () => {
    render(<AvatarField email="john@example.com" image={null} name="" />);

    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("does not show the email twice when it is also the display name", () => {
    render(<AvatarField email="john@example.com" image={null} name="" />);

    const emailElements = screen.getAllByText("john@example.com");
    expect(emailElements).toHaveLength(1);
  });

  it("renders an image when an avatar URL is provided", () => {
    render(
      <AvatarField
        email="john@example.com"
        image="https://example.com/avatar.png"
        name="John Doe"
      />,
    );

    expect(document.querySelector("img")).toHaveAttribute("src", "https://example.com/avatar.png");
  });

  it("does not render an editable avatar URL field", () => {
    render(<AvatarField email="john@example.com" image={null} name="John Doe" />);

    expect(screen.queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/avatar/)).not.toBeInTheDocument();
  });
});
