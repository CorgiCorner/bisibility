import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { createContext, type ReactNode, useContext } from "react";
import { expect, it, vi } from "vitest";
import { project, renderWizard } from "./OnboardingWizard.test-utils";

const selfAccountContext = createContext(false);

vi.mock("@/components/settings/AccountDataSourceSlot", () => ({
  OnboardingDataSourceSlot({ children, projectId }: { children: ReactNode; projectId?: string }) {
    return (
      <>
        {useContext(selfAccountContext) && projectId ? (
          <p data-testid="self-account-project">{projectId}</p>
        ) : null}
        {children}
      </>
    );
  },
  ProviderDataSourceSlot: ({ children }: { children: ReactNode }) => children,
  ProviderAccessActionsSlot: ({ children }: { children: ReactNode }) => children,
}));

it("keeps the self account scope after local project creation without an RSC refresh", async () => {
  const createProjectAction = vi.fn(async () => ({ ok: true as const, project }));
  renderWizard(
    { actions: { createProjectAction } },
    {
      wrapper: ({ children }) => (
        <selfAccountContext.Provider value>{children}</selfAccountContext.Provider>
      ),
    },
  );
  expect(screen.queryByTestId("self-account-project")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Your website"), {
    target: { value: "https://example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  await waitFor(() =>
    expect(screen.getByTestId("self-account-project")).toHaveTextContent(project.publicId),
  );
  expect(window.location.search).toBe(`?step=2&projectId=${project.publicId}`);
  expect(routerMock.push).not.toHaveBeenCalled();
  expect(routerMock.refresh).not.toHaveBeenCalled();
});
