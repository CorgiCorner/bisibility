import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  type MessageCatalog,
  mergeMessageCatalogs,
  validateCatalogParity,
} from "./catalog-contract";
import { coreNamespaces, loadCoreMessages } from "./catalog-loader.server";
import { type ActiveLocale, activeLocaleValues } from "./config";

const coreCatalogRoot = resolve(import.meta.dirname, "../messages/core");

type CatalogFragment = {
  catalog: MessageCatalog;
};

async function sourceCoreFragments(locale: ActiveLocale): Promise<CatalogFragment[]> {
  const coreCatalogDirectory = resolve(coreCatalogRoot, locale);
  const files = (await readdir(coreCatalogDirectory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(
      async (file) =>
        ({
          catalog: JSON.parse(await readFile(resolve(coreCatalogDirectory, file), "utf8")),
        }) as CatalogFragment,
    ),
  );
}

async function sourceCoreCatalog(locale: ActiveLocale) {
  return mergeMessageCatalogs(...(await sourceCoreFragments(locale)).map(({ catalog }) => catalog));
}

function namespaceCatalog(catalog: MessageCatalog, namespace: (typeof coreNamespaces)[number]) {
  const messages = catalog[namespace];
  if (!messages) throw new Error(`Source catalog is missing the ${namespace} namespace.`);
  return { [namespace]: messages };
}

describe("catalog loaders", () => {
  const sourceCatalogs = new Map<ActiveLocale, MessageCatalog>();

  beforeAll(async () => {
    await Promise.all(
      activeLocaleValues.map(async (locale) => {
        sourceCatalogs.set(locale, await sourceCoreCatalog(locale));
      }),
    );
  });

  for (const locale of activeLocaleValues) {
    for (const namespace of coreNamespaces) {
      it(`loads ${namespace} independently for active locale ${locale}`, async () => {
        const source = sourceCatalogs.get(locale);
        if (!source) throw new Error(`Missing prepared source catalog for ${locale}.`);

        await expect(loadCoreMessages(locale, [namespace])).resolves.toEqual(
          namespaceCatalog(source, namespace),
        );
      });
    }

    it(`matches every registered core fragment for active locale ${locale}`, async () => {
      const source = sourceCatalogs.get(locale);
      if (!source) throw new Error(`Missing prepared source catalog for ${locale}.`);

      await expect(loadCoreMessages(locale, coreNamespaces)).resolves.toEqual(source);
    });
  }

  it("loads only the requested public core namespace", async () => {
    await expect(loadCoreMessages("en", ["account"])).resolves.toEqual(
      expect.objectContaining({ account: expect.any(Object) }),
    );
    await expect(loadCoreMessages("en", ["account"])).resolves.not.toHaveProperty("shared");
  });

  it("keeps dashboard and rank tracker payloads isolated", async () => {
    const dashboardMessages = await loadCoreMessages("en", ["projectDashboard"]);
    const rankTrackerMessages = await loadCoreMessages("en", ["projectRankTracker"]);

    expect(dashboardMessages).toHaveProperty("projectDashboard.toolbar.addKeyword", "Add keyword");
    expect(dashboardMessages).not.toHaveProperty("projectRankTracker");
    expect(rankTrackerMessages).toHaveProperty("projectRankTracker.tabs.tracked", "Tracked");
    expect(rankTrackerMessages).not.toHaveProperty("projectDashboard");
  });

  it("rejects an omitted registered fragment even when source catalog parity passes", async () => {
    const source = await sourceCoreCatalog("en");

    expect(validateCatalogParity(source, source)).toEqual([]);

    vi.resetModules();
    vi.doMock("@/messages/core/en/account-preferences.json", () => ({
      default: { account: { fixture: "registered fragment omitted" } },
    }));

    try {
      const { loadCoreMessages: loadWithoutPreferences } = await import("./catalog-loader.server");
      const registryWithoutPreferences = await loadWithoutPreferences("en", coreNamespaces);

      expect(registryWithoutPreferences).not.toEqual(source);
      expect(validateCatalogParity(source, registryWithoutPreferences)).toContain(
        "account.preferences.savedCount: missing message",
      );
    } finally {
      vi.doUnmock("@/messages/core/en/account-preferences.json");
      vi.resetModules();
    }
  });

  it("rejects an unknown catalog locale before forming an import", async () => {
    await expect(loadCoreMessages("de", ["shared"])).rejects.toThrow("Unsupported UI locale.");
  });
});
