import { coreMessages } from "@/i18n/core-messages";
// @vitest-environment jsdom

import {
  CommandRegistryProvider,
  useRegisteredCommands,
} from "@/components/shell/command-registry";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRankTrackerCommands } from "./useRankTrackerCommands";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), onExport: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
const messages = coreMessages;
function Probe({ supported }: { supported: boolean }) {
  const marker = useRankTrackerCommands({
    exportSupported: supported,
    canCreateKeyword: false,
    canUpdateKeyword: false,
    initialAction: "export",
    onAdd: vi.fn(),
    onImport: vi.fn(),
    onFilter: vi.fn(),
    onRunChecks: vi.fn(),
    onExport: mocks.onExport,
    rowCounts: { all: 2, visible: 2 },
  });
  const commands = useRegisteredCommands();
  return (
    <>
      <span hidden ref={marker.registerRef} />
      <span hidden ref={marker.consumeActionRef} />
      <div data-testid="commands">{commands.map((command) => command.id).join(",")}</div>
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("Local display command fence", () => {
  it.each([false, true])(
    "export support %s controls both command registration and action deep-link",
    (supported) => {
      render(
        <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
          <CommandRegistryProvider>
            <Probe supported={supported} />
          </CommandRegistryProvider>
        </NextIntlClientProvider>,
      );
      expect(screen.getByTestId("commands").textContent?.includes("rt-export")).toBe(supported);
      expect(mocks.onExport).toHaveBeenCalledTimes(supported ? 1 : 0);
    },
  );
});
