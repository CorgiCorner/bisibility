import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoredResultSelector } from "./StoredResultSelector";

vi.mock("@/components/ui/MenuSelect", () => ({
  MenuSelect: (props: { onChange: (value: string) => void; value: string }) => (
    <button onClick={() => props.onChange("saved result")} type="button">
      Choose {props.value}
    </button>
  ),
}));
describe("StoredResultSelector", () => {
  beforeEach(() => setNavigationState({ pathname: "/app/prj_1/keyword-research" }));
  it("lets an Owner explicitly enter the normal lookup while keeping it hidden from Viewers", () => {
    const { rerender } = render(
      <StoredResultSelector actorKind="viewer" options={[]} title="Keyword Research" />,
    );

    expect(screen.queryByRole("link", { name: "New lookup" })).not.toBeInTheDocument();

    rerender(
      <StoredResultSelector
        actorKind="owner"
        options={[{ label: "saved result", value: "saved result" }]}
        title="Keyword Research"
      />,
    );

    expect(screen.getByRole("link", { name: "New lookup" })).toHaveAttribute(
      "href",
      "/app/prj_1/keyword-research?demoManage=1",
    );
  });

  it("changes only the stored result selection", () => {
    render(
      <StoredResultSelector
        actorKind="viewer"
        options={[{ label: "saved result", value: "first result" }]}
        title="Keyword Research"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose first result" }));
    expect(routerMock.push).toHaveBeenCalledWith(
      "/app/prj_1/keyword-research?saved=saved%20result",
    );
  });
});
