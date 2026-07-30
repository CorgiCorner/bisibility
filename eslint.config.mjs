import path from "node:path";
import { fileURLToPath } from "node:url";
import nodeResolver from "eslint-import-resolver-node";
import importPlugin from "eslint-plugin-import";
import * as espree from "espree";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const importExtensions = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".json"];

const originalNodeResolve = nodeResolver.resolve.bind(nodeResolver);
nodeResolver.resolve = (source, file, config) => {
  const resolvedSource = source.startsWith("@/") ? path.join(repoRoot, source.slice(2)) : source;

  return originalNodeResolve(resolvedSource, file, config);
};

function safeLine(line) {
  const trimmed = line.trimStart();
  if (trimmed === "" || trimmed.startsWith("//")) {
    return line;
  }

  return ";";
}

function moduleSpecifier(statement, kind) {
  if (kind === "import") {
    const sideEffectImport = statement.match(/^\s*import\s+(["'])([^"']+)\1/u);
    if (sideEffectImport) {
      return sideEffectImport[2];
    }
  }

  return statement.match(/\bfrom\s+(["'])([^"']+)\1/u)?.[2] ?? null;
}

function moduleEdgeLine(kind, specifier) {
  return kind === "export"
    ? `export {} from ${JSON.stringify(specifier)};`
    : `import ${JSON.stringify(specifier)};`;
}

function isStaticImportStart(trimmed) {
  return /^import[\s"'{*]/u.test(trimmed) && !/^import\s*\(/u.test(trimmed);
}

function isExportFromStart(trimmed) {
  return /^export\s+(?:type\s+)?[*{]/u.test(trimmed);
}

function readModuleEdge(lines, startIndex) {
  const trimmed = lines[startIndex].trimStart();
  const kind = trimmed.startsWith("export") ? "export" : "import";
  const maxEndIndex = Math.min(lines.length, startIndex + 80);
  const statementLines = [];

  for (let index = startIndex; index < maxEndIndex; index += 1) {
    statementLines.push(lines[index]);

    const statement = statementLines.join("\n");
    const specifier = moduleSpecifier(statement, kind);
    if (specifier) {
      return {
        endIndex: index,
        line: moduleEdgeLine(kind, specifier),
      };
    }

    if (statement.includes(";")) {
      return null;
    }
  }

  return null;
}

function buildImportEdgeText(text) {
  const lines = text.split("\n");
  const outputLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trimStart();

    if (isStaticImportStart(trimmed) || isExportFromStart(trimmed)) {
      const edge = readModuleEdge(lines, index);

      if (edge) {
        outputLines.push(edge.line);
        for (
          let importLineIndex = index + 1;
          importLineIndex <= edge.endIndex;
          importLineIndex += 1
        ) {
          outputLines.push(safeLine(lines[importLineIndex]));
        }
        index += edge.endIndex - index;
        continue;
      }
    }

    outputLines.push(safeLine(line));
  }

  return outputLines.join("\n");
}

const importEdgeParser = {
  meta: {
    name: "import-edge-parser",
    version: "1.0.0",
  },
  parseForESLint(text, options = {}) {
    const parserOptions = {
      ...options,
      comment: true,
      ecmaVersion: "latest",
      loc: true,
      range: true,
      sourceType: "module",
      tokens: true,
    };
    const ast = espree.parse(buildImportEdgeText(text), parserOptions);

    return {
      ast,
      visitorKeys: espree.VisitorKeys,
    };
  },
};

const importGuardFiles = [
  "app/**/*.{ts,tsx}",
  "components/**/*.{ts,tsx}",
  "hooks/**/*.{ts,tsx}",
  "lib/**/*.{ts,tsx}",
];

const uiDeepImportPattern = {
  group: ["@/components/ui/*"],
  message:
    "Use the @/components/ui barrel import outside components/ui instead of deep UI component paths.",
};

const parentRelativeImportPattern = {
  group: ["../*"],
  message:
    "Cross-directory relative imports are not allowed here; use the @/ alias or a same-directory ./ import.",
};

const libComponentImportPattern = {
  group: ["@/components/*"],
  message:
    "lib files must not import components; move shared code to lib or pass UI in from components.",
};

const appPrismaImportPattern = {
  group: ["@/lib/db/prisma", "@/lib/db/prisma/*"],
  message: "App files must not import Prisma directly; use lib/queries or lib/actions instead.",
};

const featureComponentNames = [
  "account",
  "activity",
  "alerts",
  "audit",
  "auth",
  "cloud",
  "competitors",
  "docs",
  "integrations",
  "invite",
  "keywords",
  "onboarding",
  "overview",
  "sample-data",
  "settings",
  "timeline",
  "theme",
];

const featureComponentImportGroups = featureComponentNames.flatMap((name) => [
  `@/components/${name}`,
  `@/components/${name}/*`,
]);

const productComponentImportPattern = {
  group: [...featureComponentImportGroups, "@/components/shell", "@/components/shell/*"],
  message:
    "Marketing code must not import product feature or shell components; move shared UI to components/ui.",
};

const marketingComponentImportPattern = {
  group: ["@/components/marketing", "@/components/marketing/*"],
  message:
    "Product code must not import marketing components; keep product and marketing layers separate.",
};

const lineCountProcessor = {
  preprocess(text) {
    const safeText = text
      .split("\n")
      .map((line) => {
        const trimmed = line.trimStart();
        if (trimmed === "" || trimmed.startsWith("//")) {
          return line;
        }

        return ";";
      })
      .join("\n");

    return [safeText, buildImportEdgeText(text)];
  },
  postprocess(messages) {
    const [lineCountMessages = [], importGuardMessages = []] = messages;

    return [
      ...lineCountMessages.filter((message) => message.fatal || message.ruleId === "max-lines"),
      ...importGuardMessages.filter((message) => message.ruleId !== "max-lines"),
    ];
  },
  supportsAutofix: false,
};

export default [
  {
    ignores: [
      "**/*.test.*",
      "**/*.stories.*",
      "node_modules/**",
      ".next/**",
      ".cache/**",
      "storybook-static/**",
      "coverage/**",
      "lib/generated/prisma/**",
      "prisma/generated/**",
      ".agent-private/design-source/**",
    ],
  },
  {
    files: importGuardFiles,
    languageOptions: {
      ecmaVersion: "latest",
      parser: importEdgeParser,
      sourceType: "module",
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      "import/extensions": importExtensions,
      "import/resolver": {
        node: {
          extensions: importExtensions,
          moduleDirectory: ["node_modules", "."],
          paths: [repoRoot],
        },
      },
    },
    rules: {
      "import/no-cycle": ["error", { disableScc: true, ignoreExternal: true, maxDepth: 4 }],
    },
  },
  {
    files: ["lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [parentRelativeImportPattern, libComponentImportPattern],
        },
      ],
    },
  },
  {
    files: ["lib/temporal/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [libComponentImportPattern],
        },
      ],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [parentRelativeImportPattern, appPrismaImportPattern, uiDeepImportPattern],
        },
      ],
    },
  },
  {
    files: ["components/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
    ignores: ["components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [parentRelativeImportPattern, uiDeepImportPattern],
        },
      ],
    },
  },
  {
    files: ["components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [parentRelativeImportPattern],
        },
      ],
    },
  },
  {
    files: ["components/marketing/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            parentRelativeImportPattern,
            productComponentImportPattern,
            uiDeepImportPattern,
          ],
        },
      ],
    },
  },
  {
    files: featureComponentNames.map((name) => `components/${name}/**/*.{ts,tsx}`),
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            parentRelativeImportPattern,
            marketingComponentImportPattern,
            uiDeepImportPattern,
          ],
        },
      ],
    },
  },
  {
    files: ["app/(marketing)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            parentRelativeImportPattern,
            appPrismaImportPattern,
            productComponentImportPattern,
            uiDeepImportPattern,
          ],
        },
      ],
    },
  },
  {
    files: ["app/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            parentRelativeImportPattern,
            appPrismaImportPattern,
            marketingComponentImportPattern,
            uiDeepImportPattern,
          ],
        },
      ],
    },
  },
  {
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "hooks/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
    ],
    plugins: {
      lineCount: {
        processors: {
          safe: lineCountProcessor,
        },
      },
    },
    processor: "lineCount/safe",
    rules: {
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
];
