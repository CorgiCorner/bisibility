import { renderWithExperimentalSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { deferred } from "@/tests/deferred";
import { routerMock } from "@/tests/next-navigation";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExperimentalModulesForm } from "./ExperimentalModulesForm";

describe("ExperimentalModulesForm", () => {
  it("starts disabled modules unchecked and saves the complete enabled set after a toggle", async () => {
    const user = userEvent.setup();
    const updateExperimentalModules = vi.fn().mockResolvedValue({
      enabledExperimentalModules: ["competitors"],
    });

    render(
      <ExperimentalModulesForm
        canEdit
        enabledExperimentalModules={[]}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        updateExperimentalModules={updateExperimentalModules}
      />,
    );

    expect(screen.queryByRole("switch", { name: "Prompt Playground" })).not.toBeInTheDocument();
    const competitors = screen.getByRole("switch", { name: "Competitors" });
    expect(competitors).not.toBeChecked();
    await user.click(competitors);

    await waitFor(() =>
      expect(updateExperimentalModules).toHaveBeenCalledWith({
        enabledExperimentalModules: ["competitors"],
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    );
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it("persists the later toggle when the first save is still in flight", async () => {
    const user = userEvent.setup();
    const firstSave = deferred<void>();
    const firstPersisted = deferred<void>();
    const persistedModules: string[] = [];
    let saveCount = 0;
    const updateExperimentalModules = vi.fn((input) => {
      const savedModules = [...input.enabledExperimentalModules];
      const persist = () => {
        persistedModules.splice(0, persistedModules.length, ...savedModules);
        return { enabledExperimentalModules: savedModules };
      };
      if (saveCount++ === 0) {
        return firstSave.promise.then(() => {
          const result = persist();
          firstPersisted.resolve();
          return result;
        });
      }
      return Promise.resolve(persist());
    });

    render(
      <ExperimentalModulesForm
        canEdit
        enabledExperimentalModules={[]}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        updateExperimentalModules={updateExperimentalModules}
      />,
    );

    const competitors = screen.getByRole("switch", { name: "Competitors" });
    await user.click(competitors);
    await waitFor(() => expect(updateExperimentalModules).toHaveBeenCalledOnce());
    await user.click(competitors);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    firstSave.resolve();
    await firstPersisted.promise;

    await waitFor(() => expect(persistedModules).toEqual([]));
    expect(competitors).not.toBeChecked();
  });

  it("restores the confirmed modules after a queued save fails and retries from them", async () => {
    const user = userEvent.setup();
    const firstSave = deferred<void>();
    const updateExperimentalModules = vi
      .fn()
      .mockImplementationOnce(() =>
        firstSave.promise.then(() => ({ enabledExperimentalModules: ["competitors"] })),
      )
      .mockRejectedValueOnce(new Error("The second save failed."))
      .mockResolvedValueOnce({ enabledExperimentalModules: [] });

    render(
      <ExperimentalModulesForm
        canEdit
        enabledExperimentalModules={[]}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        updateExperimentalModules={updateExperimentalModules}
      />,
    );

    const competitors = screen.getByRole("switch", { name: "Competitors" });
    await user.click(competitors);
    await waitFor(() => expect(updateExperimentalModules).toHaveBeenCalledOnce());
    await user.click(competitors);
    firstSave.resolve();

    await waitFor(() => {
      expect(competitors).toBeChecked();
      expect(screen.getByText("The second save failed.")).toBeInTheDocument();
    });

    await user.click(competitors);

    await waitFor(() =>
      expect(updateExperimentalModules).toHaveBeenLastCalledWith({
        enabledExperimentalModules: [],
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    );
  });

  it("drops queued saves after a failure and restores the confirmed modules", async () => {
    const user = userEvent.setup();
    const firstSave = deferred<void>();
    const updateExperimentalModules = vi.fn().mockImplementationOnce(() =>
      firstSave.promise.then(() => {
        throw new Error("The first save failed.");
      }),
    );

    render(
      <ExperimentalModulesForm
        canEdit
        enabledExperimentalModules={[]}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        updateExperimentalModules={updateExperimentalModules}
      />,
    );

    const competitors = screen.getByRole("switch", { name: "Competitors" });
    await user.click(competitors);
    await waitFor(() => expect(updateExperimentalModules).toHaveBeenCalledOnce());
    await user.click(competitors);
    firstSave.resolve();

    await waitFor(() => {
      expect(competitors).not.toBeChecked();
      expect(screen.getByText("The first save failed.")).toBeInTheDocument();
    });
    expect(updateExperimentalModules).toHaveBeenCalledOnce();
  });

  it("disables the module switch for read-only projects", () => {
    render(
      <ExperimentalModulesForm
        canEdit={false}
        enabledExperimentalModules={["competitors"]}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        updateExperimentalModules={vi.fn()}
      />,
    );

    expect(screen.queryByRole("switch", { name: "Prompt Playground" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Competitors" })).toBeDisabled();
  });
});
