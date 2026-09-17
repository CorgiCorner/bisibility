import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import polishKeywordImportMessages from "@/messages/core/pl/project-rank-tracker-keyword-import.json";
import polishSharedMessages from "@/messages/core/pl/shared.json";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddKeywordDeviceChips } from "./AddKeywordDeviceChips";

const polish = mergeMessageCatalogs(polishSharedMessages, polishKeywordImportMessages);

describe("the add-keyword device chips in a non-English locale", () => {
  it("names each device from the shared catalog instead of the SERP constant", () => {
    renderWithFeatureMessages(<AddKeywordDeviceChips devices={["desktop"]} onChange={vi.fn()} />, {
      locale: "pl",
      messages: polish,
    });

    expect(screen.getByRole("button", { name: "Komputer" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Telefon" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Desktop" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mobile" })).not.toBeInTheDocument();
  });
});
