import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  type ColorSchemeName,
  type ColorTokenName,
  colorSchemes,
  colorTokenNames,
  errorButtonForegroundTokens,
  primaryButtonForegroundTokens,
  tailwindSemanticColors,
} from "./tokens";

type Rgb = readonly [number, number, number];

type Pair = {
  background: Rgb;
  description: string;
  foreground: Rgb;
  minimum: number;
};

const bodySurfaces = ["bg", "bg-elev", "bg-sidebar", "bg-sunken", "bg-inset"] as const;
const ordinaryTextSurfaces = ["bg", "bg-elev", "bg-sunken"] as const;
const readableTextTokens = [
  "fg",
  "fg-muted",
  "accent-text",
  "green-text",
  "yellow-text",
] as const satisfies readonly ColorTokenName[];
const statusTextTokens = ["red-text", "blue-text"] as const satisfies readonly ColorTokenName[];
const statusTintTokens = [
  "red",
  "yellow",
  "green",
  "blue",
] as const satisfies readonly ColorTokenName[];
const coloredSurfaceClasses: Readonly<Record<string, ColorTokenName>> = {
  "bg-accent": "accent",
  "bg-accent-hover": "accent-hover",
  "bg-accent-solid": "accent-solid",
  "bg-accent-solid-hover": "accent-solid-hover",
  "bg-blue": "blue",
  "bg-green": "green",
  "bg-green-text": "green-text",
  "bg-red": "red",
  "bg-yellow": "yellow",
} as const satisfies Record<string, ColorTokenName>;

type ParsedClass = {
  base: string;
  modifiers: string;
};

type SourceFileGroup = {
  files: string[];
  name: string;
};

const maxSourceFilesPerGroup = 100;

function rgb(hex: `#${string}`): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function channelLuminance(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: Rgb) {
  return (
    0.2126 * channelLuminance(color[0]) +
    0.7152 * channelLuminance(color[1]) +
    0.0722 * channelLuminance(color[2])
  );
}

function contrast(foreground: Rgb, background: Rgb) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function tint(foreground: Rgb, background: Rgb, amount: number): Rgb {
  return [
    Math.round(foreground[0] * amount + background[0] * (1 - amount)),
    Math.round(foreground[1] * amount + background[1] * (1 - amount)),
    Math.round(foreground[2] * amount + background[2] * (1 - amount)),
  ];
}

function token(scheme: ColorSchemeName, name: ColorTokenName) {
  return rgb(colorSchemes[scheme][name]);
}

function parseClass(className: string): ParsedClass {
  const normalized = className.replace(/^!/, "");
  const separator = normalized.lastIndexOf(":");
  if (separator === -1) return { base: normalized, modifiers: "" };
  return {
    base: normalized.slice(separator + 1),
    modifiers: normalized.slice(0, separator),
  };
}

function foregroundFor(scheme: ColorSchemeName, className: string) {
  if (className === "text-white") return rgb("#FFFFFF");
  if (className === "text-primary-contrast") {
    return token(scheme, primaryButtonForegroundTokens[scheme]);
  }
  if (className === "text-error-contrast") {
    return token(scheme, errorButtonForegroundTokens[scheme]);
  }
  const tokenName = className.slice("text-".length);
  return className.startsWith("text-") && Object.hasOwn(colorSchemes[scheme], tokenName)
    ? token(scheme, tokenName as ColorTokenName)
    : undefined;
}

function modifierParts(className: ParsedClass) {
  return className.modifiers.split(":").filter(Boolean);
}

function interactionState(className: ParsedClass) {
  return modifierParts(className)
    .filter((modifier) => modifier !== "dark")
    .join(":");
}

function classesForState(classes: readonly ParsedClass[], state: string, scheme: ColorSchemeName) {
  const exact = classes.filter((className) => interactionState(className) === state);
  const candidates =
    exact.length > 0 ? exact : classes.filter((className) => interactionState(className) === "");
  const darkSpecific = candidates.filter((className) => modifierParts(className).includes("dark"));

  if (scheme === "dark" && darkSpecific.length > 0) return darkSpecific;
  return candidates.filter((className) => !modifierParts(className).includes("dark"));
}

function staticClassTexts(node: ts.Node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  return ts.isTemplateExpression(node)
    ? [node.head.text, ...node.templateSpans.map((span) => span.literal.text)]
    : [];
}

function sourcePairFailures(filename: string, sourceText: string) {
  const source = ts.createSourceFile(
    filename,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const failures = new Set<string>();

  function visit(node: ts.Node) {
    for (const classText of staticClassTexts(node)) {
      const classes = classText.split(/\s+/).filter(Boolean).map(parseClass);
      const backgrounds = classes.filter((className) => className.base.startsWith("bg-"));
      const foregrounds = classes.filter((className) => foregroundFor("light", className.base));
      const states = new Set([...backgrounds, ...foregrounds].map(interactionState));
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));

      for (const state of states) {
        for (const scheme of ["light", "dark"] as const) {
          for (const background of classesForState(backgrounds, state, scheme)) {
            const backgroundToken = coloredSurfaceClasses[background.base];
            if (!backgroundToken) continue;
            for (const foreground of classesForState(foregrounds, state, scheme)) {
              const foregroundColor = foregroundFor(scheme, foreground.base);
              if (!foregroundColor) continue;
              const ratio = contrast(foregroundColor, token(scheme, backgroundToken));
              if (ratio < 4.5) {
                failures.add(
                  `${filename}:${line + 1}: ${foreground.base} on ${background.base} (${scheme}) is ${ratio.toFixed(2)}:1, below 4.5:1`,
                );
              }
            }
          }
        }
      }

      for (const foreground of foregrounds) {
        const statusToken = foreground.base.slice("text-".length) as ColorTokenName;
        if (!statusTintTokens.includes(statusToken as (typeof statusTintTokens)[number])) continue;
        for (const surface of ordinaryTextSurfaces) {
          for (const scheme of ["light", "dark"] as const) {
            const foregroundColor = foregroundFor(scheme, foreground.base);
            if (!foregroundColor) continue;
            const ratio = contrast(foregroundColor, token(scheme, surface));
            if (ratio < 4.5) {
              failures.add(
                `${filename}:${line + 1}: ${foreground.base} on --${surface} (${scheme}) is ${ratio.toFixed(2)}:1, below 4.5:1`,
              );
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return [...failures];
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:stories|test)\.(?:ts|tsx)$/.test(entry.name)
      ? [file]
      : [];
  });
}

function sourceFileGroups(root: string, directories: readonly string[]): SourceFileGroup[] {
  return directories.flatMap((directory) =>
    readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(root, directory, entry.name);
      if (entry.isDirectory()) {
        const files = sourceFiles(path);
        const groupCount = Math.ceil(files.length / maxSourceFilesPerGroup);
        return Array.from({ length: groupCount }, (_, index) => ({
          files: files.slice(index * maxSourceFilesPerGroup, (index + 1) * maxSourceFilesPerGroup),
          name: `${directory}/${entry.name}${groupCount > 1 ? ` (${index + 1}/${groupCount})` : ""}`,
        }));
      }
      return /\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:stories|test)\.(?:ts|tsx)$/.test(entry.name)
        ? [{ files: [path], name: `${directory}/${entry.name}` }]
        : [];
    }),
  );
}

function allPairsForScheme(scheme: ColorSchemeName): Pair[] {
  const pairs: Pair[] = [];

  for (const surface of bodySurfaces) {
    for (const foreground of readableTextTokens) {
      pairs.push({
        background: token(scheme, surface),
        description: `${scheme}: --${foreground} on --${surface}`,
        foreground: token(scheme, foreground),
        minimum: 4.5,
      });
    }

    pairs.push({
      background: token(scheme, surface),
      description: `${scheme}: --border-strong against --${surface}`,
      foreground: token(scheme, "border-strong"),
      minimum: 3,
    });

    for (const status of statusTintTokens) {
      pairs.push({
        background: tint(token(scheme, status), token(scheme, surface), 0.12),
        description: `${scheme}: CheckStatusChip --fg on 12% --${status} tint over --${surface}`,
        foreground: token(scheme, "fg"),
        minimum: 4.5,
      });
    }
  }

  for (const foreground of statusTextTokens) {
    for (const surface of ordinaryTextSurfaces) {
      pairs.push({
        background: token(scheme, surface),
        description: `${scheme}: --${foreground} status text on --${surface}`,
        foreground: token(scheme, foreground),
        minimum: 4.5,
      });
    }
  }

  for (const [status, amount] of [
    ["red", 0.07],
    ["yellow", 0.1],
  ] as const satisfies readonly [ColorTokenName, number][]) {
    for (const surface of bodySurfaces) {
      pairs.push({
        background: tint(token(scheme, status), token(scheme, surface), amount),
        description: `${scheme}: AlertBanner --fg on ${amount * 100}% --${status} tint over --${surface}`,
        foreground: token(scheme, "fg"),
        minimum: 4.5,
      });
    }
  }

  const primaryButtonForeground = primaryButtonForegroundTokens[scheme];
  for (const buttonSurface of ["accent-solid", "accent-solid-hover"] as const) {
    pairs.push({
      background: token(scheme, buttonSurface),
      description: `${scheme}: --${primaryButtonForeground} primary text on --${buttonSurface}`,
      foreground: token(scheme, primaryButtonForeground),
      minimum: 4.5,
    });
  }

  const errorButtonForeground = errorButtonForegroundTokens[scheme];
  pairs.push({
    background: token(scheme, "red"),
    description: `${scheme}: --${errorButtonForeground} destructive text on --red`,
    foreground: token(scheme, errorButtonForeground),
    minimum: 4.5,
  });

  return pairs;
}

describe("theme contrast contract", () => {
  const root = resolve(import.meta.dirname, "../..");
  const staticSourceGroups = sourceFileGroups(root, ["components", "app"]);

  it("maps semantic Tailwind foregrounds to the theme contrast colors", () => {
    expect(tailwindSemanticColors).toMatchObject({
      "error-contrast": "var(--mui-palette-error-contrastText)",
      "primary-contrast": "var(--mui-palette-primary-contrastText)",
    });
  });

  it("pins the primary button pair and leaves the brand accent untouched", () => {
    const ratioFor = (scheme: ColorSchemeName, surface: ColorTokenName) => {
      const foreground = token(scheme, primaryButtonForegroundTokens[scheme]);
      return Number(contrast(foreground, token(scheme, surface)).toFixed(2));
    };

    expect(primaryButtonForegroundTokens).toEqual({
      light: "accent-on-solid",
      dark: "accent-on-solid",
    });

    // The brand token stays put; only the button surface darkens to carry a light label.
    expect(colorSchemes.light.accent).toBe("#D97757");
    expect(colorSchemes.dark.accent).toBe("#E08A6A");

    expect(colorSchemes.light).toMatchObject({
      "accent-solid": "#B74C29",
      "accent-solid-hover": "#AF4927",
      "accent-on-solid": "#FFF3EE",
    });
    expect(ratioFor("light", "accent-solid")).toBe(4.73);
    expect(ratioFor("light", "accent-solid-hover")).toBe(5.07);

    expect(colorSchemes.dark).toMatchObject({
      "accent-solid": "#BA4F27",
      "accent-solid-hover": "#B14B25",
      "accent-on-solid": "#FFF3EE",
    });
    expect(ratioFor("dark", "accent-solid")).toBe(4.56);
    expect(ratioFor("dark", "accent-solid-hover")).toBe(4.95);
  });

  it("keeps onboarding done and active glyphs distinct in both themes", () => {
    const ratioFor = (
      scheme: ColorSchemeName,
      foreground: ColorTokenName,
      background: ColorTokenName,
    ) => Number(contrast(token(scheme, foreground), token(scheme, background)).toFixed(2));

    expect(ratioFor("light", "accent-on-solid", "green-text")).toBe(5.89);
    expect(ratioFor("dark", "bg", "green-text")).toBe(9.87);
    expect(ratioFor("light", "accent-on-solid", "accent-solid")).toBe(4.73);
    expect(ratioFor("dark", "accent-on-solid", "accent-solid")).toBe(4.56);
  });

  it("keeps muted as the only named foreground tier", () => {
    expect(colorTokenNames.filter((name) => name.startsWith("fg-"))).toEqual(["fg-muted"]);
  });
  it("keeps all token pairs used by text, status chips, alerts, buttons, and fields above WCAG limits", () => {
    const failures = (["light", "dark"] as const).flatMap(allPairsForScheme).flatMap((pair) => {
      const ratio = contrast(pair.foreground, pair.background);
      return ratio < pair.minimum
        ? [`${pair.description}: ${ratio.toFixed(2)}:1 is below ${pair.minimum}:1`]
        : [];
    });

    expect(failures).toEqual([]);
  });

  it.each(staticSourceGroups)(
    "rejects inaccessible static Tailwind source pairings in $name",
    ({ files }) => {
      const failures = files.flatMap((file) =>
        sourcePairFailures(relative(root, file), readFileSync(file, "utf8")),
      );

      expect(failures).toEqual([]);
    },
  );

  it("detects an inaccessible accent source pairing", () => {
    expect(sourcePairFailures("fixture.tsx", '<span className="bg-accent text-white" />')).toEqual([
      "fixture.tsx:1: text-white on bg-accent (light) is 3.12:1, below 4.5:1",
      "fixture.tsx:1: text-white on bg-accent (dark) is 2.62:1, below 4.5:1",
    ]);
  });

  it("detects inaccessible status text on ordinary page backgrounds", () => {
    expect(
      sourcePairFailures(
        "fixture.tsx",
        '<><span className="text-red" /><span className="text-blue" /></>',
      ),
    ).toEqual([
      "fixture.tsx:1: text-red on --bg (light) is 4.13:1, below 4.5:1",
      "fixture.tsx:1: text-red on --bg-sunken (light) is 3.87:1, below 4.5:1",
      "fixture.tsx:1: text-blue on --bg (light) is 3.07:1, below 4.5:1",
      "fixture.tsx:1: text-blue on --bg-elev (light) is 3.38:1, below 4.5:1",
      "fixture.tsx:1: text-blue on --bg-sunken (light) is 2.88:1, below 4.5:1",
    ]);
  });
});
