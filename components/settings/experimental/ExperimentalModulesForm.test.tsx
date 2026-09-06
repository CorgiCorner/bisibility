import { deferred } from "@/tests/deferred";
import { routerMock } from "@/tests/next-navigation";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExperimentalModulesForm } from "./ExperimentalModulesForm";

describe("ExperimentalModulesForm", () => {
  it("starts disabled modules unchecked and saves the complete enabled set after a toggle", async () => {
    const user = userEvent.setup();
    const updateExperimentalModules = vi.fn().mockResolvedValue({
      enabledExperimentalModules: ["timeline"],
    });

    render(
      <ExperimentalModulesForm
        canEdit
        enabledExperimentalModules={[]}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        updateExperimentalModules={updateExperimentalModules}
      />,
    );

    const timeline = screen.getByRole("switch", { name: "Timeline" });
    const competitors = screen.getByRole("switch", { name: "Competitors" });
    expect(timeline).not.toBeChecked();
    expect(competitors).not.toBeChecked();

    await user.click(timeline);

    await waitFor(() =>
      expect(updateExperimentalModules).toHaveBeenCalledWith({
        enabledExperimentalModules: ["timeline"],
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    );
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it("persists both changes when the first rapid toggle saves slowly", async () => {
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

    await user.click(screen.getByRole("switch", { name: "Timeline" }));
    await waitFor(() => expect(updateExperimentalModules).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("switch", { name: "Competitors" }));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    firstSave.resolve();
    await firstPersisted.promise;

    await waitFor(() => expect(persistedModules).toEqual(["timeline", "competitors"]));
  });

  it("restores the confirmed modules after a queued save fails and retries from them", async () => {
    const user = userEvent.setup();
    const firstSave = deferred<void>();
    const updateExperimentalModules = vi
      .fn()
      .mockImplementationOnce(() =>
        firstSave.promise.then(() => ({ enabledExperimentalModules: ["timeline"] })),
      )
      .mockRejectedValueOnce(new Error("The second save failed."))
      .mockResolvedValueOnce({ enabledExperimentalModules: ["timeline", "competitors"] });

    render(
      <ExperimentalModulesForm
        canEdit
        enabledExperimentalModules={[]}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        updateExperimentalModules={updateExperimentalModules}
      />,
    );

    const timeline = screen.getByRole("switch", { name: "Timeline" });
    const competitors = screen.getByRole("switch", { name: "Competitors" });
    await user.click(timeline);
    await waitFor(() => expect(updateExperimentalModules).toHaveBeenCalledOnce());
    await user.click(competitors);
    firstSave.resolve();

    await waitFor(() => {
      expect(timeline).toBeChecked();
      expect(competitors).not.toBeChecked();
      expect(screen.getByText("The second save failed.")).toBeInTheDocument();
    });

    await user.click(competitors);

    await waitFor(() =>
      expect(updateExperimentalModules).toHaveBeenLastCalledWith({
        enabledExperimentalModules: ["timeline", "competitors"],
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    );
  });

  it("drops queued saves after a failure and restores the confirmed modules", async () => {
    const user = userEvent.setup();
    const firstSave = deferred<void>();
    const updateExperimentalModules = vi
      .fn()
      .mockImplementationOnce(() =>
        firstSave.promise.then(() => {
          throw new Error("The first save failed.");
        }),
      )
      .mockResolvedValueOnce({ enabledExperimentalModules: ["competitors"] });

    render(
      <ExperimentalModulesForm
        canEdit
        enabledExperimentalModules={[]}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        updateExperimentalModules={updateExperimentalModules}
      />,
    );

    const timeline = screen.getByRole("switch", { name: "Timeline" });
    const competitors = screen.getByRole("switch", { name: "Competitors" });
    await user.click(timeline);
    await waitFor(() => expect(updateExperimentalModules).toHaveBeenCalledOnce());
    await user.click(competitors);
    firstSave.resolve();

    await waitFor(() => {
      expect(timeline).not.toBeChecked();
      expect(competitors).not.toBeChecked();
      expect(screen.getByText("The first save failed.")).toBeInTheDocument();
    });
    expect(updateExperimentalModules).toHaveBeenCalledOnce();

    await user.click(competitors);

    await waitFor(() =>
      expect(updateExperimentalModules).toHaveBeenLastCalledWith({
        enabledExperimentalModules: ["competitors"],
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    );
  });

  it("disables both module switches for read-only projects", () => {
    render(
      <ExperimentalModulesForm
        canEdit={false}
        enabledExperimentalModules={["timeline"]}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        updateExperimentalModules={vi.fn()}
      />,
    );

    expect(screen.getByRole("switch", { name: "Timeline" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Competitors" })).toBeDisabled();
  });
});
