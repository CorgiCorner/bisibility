import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import { composerContentKey } from "@/lib/model-playground/composer-revision";
import { createFakeModelPlaygroundLaunchService } from "@/lib/model-playground/launch-service.fake.test-support";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useModelPlayground } from "./useModelPlayground";

it.each(["workspaceId", "allowedProviders"] as const)(
  "binds %s to quote revision, launch fence and dedup content",
  async (field) => {
    const fixture = composerFixture();
    if (field === "allowedProviders") {
      const column = fixture.input.columns[1];
      column.providerId = "vercel_ai_gateway";
      column.connectionId = fixture.connections[3].connectionId as `conn_${string}`;
    } else {
      fixture.catalogs.push({ ...fixture.catalogs[1], workspaceId: "wrkspc_SyntheticA" });
    }
    const service = createFakeModelPlaygroundLaunchService(fixture);
    const preview = vi.spyOn(service, "preview");
    const launch = vi.spyOn(service, "launch");
    const hook = renderHook(() =>
      useModelPlayground({ ...fixture, service, canRun: true, debounceMs: 1 }),
    );
    await waitFor(() => expect(hook.result.current.canLaunch).toBe(true));
    const original = hook.result.current.quote;
    const originalContent = composerContentKey(hook.result.current.input);
    await act(() => hook.result.current.run());
    await waitFor(() => expect(hook.result.current.quote).not.toBeNull());
    expect(hook.result.current.canLaunch).toBe(false);
    act(() => {
      const column = hook.result.current.input.columns[1];
      hook.result.current.updateColumn(column.columnId, {
        ...column,
        settings: {
          ...column.settings,
          ...(field === "workspaceId"
            ? { workspaceId: "wrkspc_SyntheticA" }
            : { allowedProviders: ["bedrock"] }),
        },
      });
    });
    expect(hook.result.current.canLaunch).toBe(false);
    expect(composerContentKey(hook.result.current.input)).not.toBe(originalContent);
    await waitFor(() => expect(hook.result.current.canLaunch).toBe(true));
    expect(hook.result.current.quote?.configHash).not.toBe(original?.configHash);
    expect(preview.mock.lastCall?.[0].input.columns[1].settings).toHaveProperty(field);
    await act(() => hook.result.current.run());
    expect(launch).toHaveBeenCalledTimes(2);
  },
);
