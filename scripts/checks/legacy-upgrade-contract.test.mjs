import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkLegacyUpgradeContract,
  LEGACY_UPGRADE_ANCHORS,
  LEGACY_UPGRADE_HUB,
  LEGACY_UPGRADE_PAGE,
} from "./legacy-upgrade-contract.mjs";

const HUB_KEY = LEGACY_UPGRADE_HUB;
const PAGE_KEY = LEGACY_UPGRADE_PAGE;
const LEGACY_LINK = "(/self-hosting/legacy-upgrades/v0-1-to-v0-2)";

function anchorTags() {
  return LEGACY_UPGRADE_ANCHORS.map((a) => `<a id="${a}"></a>`).join("\n");
}

function validHub() {
  return [
    '---\ntitle: "Self-hosted upgrades"\n---\n',
    '<span id="upgrade-from-v010-to-v020"></span>\n',
    "## Upgrade from v0.1.0 to v0.2.0\n",
    anchorTags(),
    "\nThis one-time source upgrade has its own page:",
    `[Upgrade from v0.1.0 to v0.2.0]${LEGACY_LINK}.`,
  ].join("\n");
}

function validLegacy() {
  return [
    '---\ntitle: "Upgrade from v0.1.0 to v0.2.0"\n---\n',
    "## Upgrade from v0.1.0 to v0.2.0\n",
    "<AccordionGroup>",
    ...LEGACY_UPGRADE_ANCHORS.map(
      (a) => `  <Accordion title="step" id="${a}">body</Accordion>`,
    ),
    "</AccordionGroup>",
    "bisibility-v0.1.0-before-v0.2.0.dump",
    "docker compose -f docker-compose.yml -f docker-compose.debug.yml up -d --build",
    "docker compose exec -T postgres pg_restore",
  ].join("\n");
}

function validPages() {
  return new Map([
    [HUB_KEY, validHub()],
    [PAGE_KEY, validLegacy()],
  ]);
}

function removeAnchor(source, anchor) {
  return source.replace(`<a id="${anchor}"></a>\n`, "").replace(
    `  <Accordion title="step" id="${anchor}">body</Accordion>\n`,
    "",
  );
}

describe("legacy-upgrade-contract checker", () => {
  it("accepts a valid two-page fixture", () => {
    assert.deepEqual(checkLegacyUpgradeContract(validPages()), []);
  });

  it("rejects a missing anchor on the hub", () => {
    const pages = validPages();
    const anchor = LEGACY_UPGRADE_ANCHORS[0];
    pages.set(HUB_KEY, removeAnchor(pages.get(HUB_KEY), anchor));
    const failures = checkLegacyUpgradeContract(pages);
    assert.ok(
      failures.some((f) => f.includes(HUB_KEY) && f.includes(`#${anchor}`)),
      `expected hub failure for #${anchor}, got ${JSON.stringify(failures)}`,
    );
  });

  it("rejects a missing anchor on the legacy page", () => {
    const pages = validPages();
    const anchor = LEGACY_UPGRADE_ANCHORS[2];
    pages.set(PAGE_KEY, removeAnchor(pages.get(PAGE_KEY), anchor));
    const failures = checkLegacyUpgradeContract(pages);
    assert.ok(
      failures.some((f) => f.includes(PAGE_KEY) && f.includes(`#${anchor}`)),
      `expected legacy failure for #${anchor}, got ${JSON.stringify(failures)}`,
    );
  });

  it("requires hub compatibility anchors to precede the legacy-page link", () => {
    const pages = validPages();
    const hub = pages.get(HUB_KEY);
    const anchor = LEGACY_UPGRADE_ANCHORS[0];
    const moved = hub.replace(
      anchorTags(),
      `[Upgrade from v0.1.0 to v0.2.0]${LEGACY_LINK}.\n\n${anchorTags()}`,
    );
    pages.set(HUB_KEY, moved);
    const failures = checkLegacyUpgradeContract(pages);
    assert.ok(
      failures.some(
        (f) => f.includes(HUB_KEY) && f.includes("before the moved-procedure link"),
      ),
      `expected hub precedence failure, got ${JSON.stringify(failures)}`,
    );
  });

  it("rejects a hub missing the canonical legacy link", () => {
    const pages = validPages();
    pages.set(HUB_KEY, validHub().replace(LEGACY_LINK, "(/self-hosting/upgrades)"));
    const failures = checkLegacyUpgradeContract(pages);
    assert.ok(
      failures.some((f) => f.includes("must link to the legacy")),
      `expected legacy link failure, got ${JSON.stringify(failures)}`,
    );
  });

  it("rejects a legacy page missing the full procedure", () => {
    const pages = validPages();
    pages.set(PAGE_KEY, validLegacy().replace("bisibility-v0.1.0-before-v0.2.0.dump", ""));
    const failures = checkLegacyUpgradeContract(pages);
    assert.ok(
      failures.some((f) => f.includes("is missing legacy upgrade guidance")),
      `expected procedure failure, got ${JSON.stringify(failures)}`,
    );
  });
});
