import {
  renderWithFeatureMessages as render,
  researchFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { fireEvent, screen } from "@testing-library/react";
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
      <StoredResultSelector actorKind="viewer" module="keywordResearch" options={[]} />,
      { messages: researchFeatureTestMessages },
    );

    expect(screen.queryByRole("link", { name: "New lookup" })).not.toBeInTheDocument();

    rerender(
      <StoredResultSelector
        actorKind="owner"
        module="keywordResearch"
        options={[{ label: "saved result", value: "saved result" }]}
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
        module="keywordResearch"
        options={[{ label: "saved result", value: "first result" }]}
      />,
      { messages: researchFeatureTestMessages },
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose first result" }));
    expect(routerMock.push).toHaveBeenCalledWith(
      "/app/prj_1/keyword-research?saved=saved%20result",
    );
  });

  it("localizes the saved-result control", () => {
    const messages = structuredClone(researchFeatureTestMessages);
    messages.projectResearch.demo.keywordResearch = "Badanie słów kluczowych";
    messages.projectResearch.demo.newLookup = "Nowe wyszukiwanie";
    messages.projectResearch.demo.savedResults = "Zapisane wyniki";

    render(
      <StoredResultSelector
        actorKind="owner"
        module="keywordResearch"
        options={[{ label: "standing desk - US/en", value: "saved" }]}
      />,
      { locale: "pl", messages },
    );

    expect(screen.getByRole("heading", { name: "Badanie słów kluczowych" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nowe wyszukiwanie" })).toBeInTheDocument();
  });
});
