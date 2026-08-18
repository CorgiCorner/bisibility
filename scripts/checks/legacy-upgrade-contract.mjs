export const LEGACY_UPGRADE_PAGE = "self-hosting/legacy-upgrades/v0-1-to-v0-2.mdx";
export const LEGACY_UPGRADE_HUB = "self-hosting/upgrades.mdx";

export const LEGACY_UPGRADE_ANCHORS = [
  "1-back-up-postgresql",
  "2-check-the-port-change",
  "3-fetch-v020",
  "4-keep-deliberate-host-local-database-access",
  "5-build-and-start-the-release",
  "6-verify-the-upgrade",
  "7-roll-back",
];

const PROCEDURE_TERMS = [
  "<AccordionGroup>",
  "bisibility-v0.1.0-before-v0.2.0.dump",
  "docker compose -f docker-compose.yml -f docker-compose.debug.yml up -d --build",
  "docker compose exec -T postgres pg_restore",
];

const LEGACY_LINK = "(/self-hosting/legacy-upgrades/v0-1-to-v0-2)";

function anchorPresenceFailures(source, surfaceLabel, anchorLabel) {
  const failures = [];
  for (const anchor of LEGACY_UPGRADE_ANCHORS) {
    if (!source.includes(`id="${anchor}"`)) {
      failures.push(
        `${surfaceLabel} is missing the ${anchorLabel} anchor #${anchor}.`,
      );
    }
  }
  return failures;
}

function anchorPrecedenceFailures(source, surfaceLabel, beforeMarker) {
  const failures = [];
  const linkIndex = source.indexOf(beforeMarker);
  if (linkIndex === -1) return failures;
  for (const anchor of LEGACY_UPGRADE_ANCHORS) {
    const anchorIndex = source.indexOf(`id="${anchor}"`);
    if (anchorIndex !== -1 && anchorIndex > linkIndex) {
      failures.push(
        `${surfaceLabel} must place the compatibility anchor #${anchor} before the moved-procedure link.`,
      );
    }
  }
  return failures;
}

export function checkLegacyUpgradeContract(pages) {
  const failures = [];
  const hub = pages.get(LEGACY_UPGRADE_HUB) ?? "";
  const legacy = pages.get(LEGACY_UPGRADE_PAGE) ?? "";

  if (
    !hub.includes(
      '<span id="upgrade-from-v010-to-v020"></span>\n\n## Upgrade from v0.1.0 to v0.2.0',
    )
  ) {
    failures.push("self-hosting/upgrades.mdx is missing #upgrade-from-v010-to-v020.");
  }
  if (!hub.includes(LEGACY_LINK)) {
    failures.push(
      "self-hosting/upgrades.mdx must link to the legacy v0.1.0 to v0.2.0 upgrade page.",
    );
  }

  failures.push(
    ...anchorPresenceFailures(
      hub,
      "self-hosting/upgrades.mdx",
      "compatibility",
    ),
  );
  failures.push(
    ...anchorPrecedenceFailures(hub, "self-hosting/upgrades.mdx", LEGACY_LINK),
  );

  failures.push(
    ...anchorPresenceFailures(
      legacy,
      "self-hosting/legacy-upgrades/v0-1-to-v0-2.mdx",
      "historical",
    ),
  );
  for (const term of PROCEDURE_TERMS) {
    if (!legacy.includes(term)) {
      failures.push(
        `self-hosting/legacy-upgrades/v0-1-to-v0-2.mdx is missing legacy upgrade guidance: ${term}`,
      );
    }
  }

  return failures;
}
