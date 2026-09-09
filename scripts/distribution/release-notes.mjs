import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

function normalizeBody(value) {
  return value.replaceAll("\r\n", "\n").trim();
}

function releaseNotes(tag) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? "")) {
    throw new Error(`Invalid final release tag: ${tag ?? "missing"}`);
  }
  const changelog = readFileSync("CHANGELOG.md", "utf8").replaceAll("\r\n", "\n");
  const headings = [...changelog.matchAll(/^##[ \t]+(.+)$/gm)];
  const matches = headings.filter(
    (heading) => heading[1].match(/^\[([^\]]+)\]/)?.[1] === tag.slice(1),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one CHANGELOG.md section for ${tag}; found ${matches.length}.`,
    );
  }
  const heading = matches[0];
  if (!/^\[[^\]]+\] - \d{4}-\d{2}-\d{2}$/.test(heading[1])) {
    throw new Error(`CHANGELOG.md section for ${tag} must have a release date.`);
  }
  const next = headings[headings.indexOf(heading) + 1];
  const body = normalizeBody(changelog.slice(heading.index + heading[0].length, next?.index));
  const maintenance = "Maintenance release. Application behavior is unchanged.";
  if (body !== maintenance && !/^- \S/m.test(body.replace(/<!--[\s\S]*?-->/g, ""))) {
    throw new Error(`CHANGELOG.md section for ${tag} has no release notes.`);
  }
  return body;
}

try {
  const { values } = parseArgs({
    options: { tag: { type: "string" }, verify: { type: "string" } },
  });
  const notes = releaseNotes(values.tag);
  if (values.verify) {
    const published = JSON.parse(readFileSync(values.verify, "utf8"));
    if (published.tagName !== values.tag) {
      throw new Error(`Published release tag does not match ${values.tag}.`);
    }
    if (typeof published.body !== "string" || normalizeBody(published.body) !== notes) {
      throw new Error(`Published release body does not match CHANGELOG.md for ${values.tag}.`);
    }
    console.log(`Published release body matches CHANGELOG.md for ${values.tag}.`);
  } else {
    process.stdout.write(`${notes}\n`);
  }
} catch (error) {
  console.error(`Release notes failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
