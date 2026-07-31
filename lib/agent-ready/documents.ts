import { createHash } from "node:crypto";
import { getCapabilities } from "@/lib/api/capabilities";
import type { MetadataRoute } from "next";
import { getSkillArchive } from "./archive";
import { absoluteUrl } from "./origin";
import { taskSkills } from "./skills";

export const contentSignal = "ai-train=yes, search=yes, ai-input=yes";

const publicPaths = ["/", "/roadmap"] as const;
const mcpToolCapabilities = getCapabilities();

// AI crawlers may use public marketing and SEO pages, while private app/API paths
// remain disallowed; the Content-Signal header mirrors this policy.
const robotAgents = [
  "*",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "Google-Extended",
  "PerplexityBot",
  "CCBot",
] as const;

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function skillSlug(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function generatedToolDescription(tool: (typeof mcpToolCapabilities)[number]) {
  return `${tool.description}. Use when an agent needs the exact Bisibility API input schema and operation details for ${tool.operationId}.`;
}

function toolMarkdown(tool: (typeof mcpToolCapabilities)[number]) {
  const name = skillSlug(tool.name);

  return [
    "---",
    `name: ${name}`,
    `description: ${JSON.stringify(generatedToolDescription(tool))}`,
    "license: AGPL-3.0-only",
    "compatibility: Requires access to a Bisibility origin and a bearer credential with the required permission.",
    "metadata:",
    "  publisher: bisibility",
    "  bisibility.kind: generated-tool-reference",
    `  bisibility.operation_id: ${tool.operationId}`,
    "---",
    "",
    `# ${tool.name}`,
    "",
    tool.description,
    "",
    "Use this document as a generated Bisibility API tool reference, not a full task workflow.",
    "",
    "- Base URL: `/api/v1`",
    "- Auth: `Authorization: Bearer <token>`",
    `- Operation ID: \`${tool.operationId}\``,
    "",
    "## Input Schema",
    "",
    "```json",
    prettyJson(tool.input_schema),
    "```",
    "",
  ].join("\n");
}

function toolBySlug(slug: string) {
  const cleanSlug = slug.replace(/\.md$/i, "");
  return mcpToolCapabilities.find((tool) => skillSlug(tool.name) === cleanSlug) ?? null;
}

export function createRobotsTxt(origin: string) {
  const policy = [
    "Allow: /",
    "Disallow: /app",
    "Disallow: /login",
    "Disallow: /onboarding",
    "Disallow: /invite",
    "Disallow: /cloud",
    "Disallow: /api/",
    "Allow: /api/v1/openapi.json",
    "Allow: /api/v1/capabilities",
    "Allow: /api/v1/provider-rates",
    "Allow: /api/v1/cost-estimate",
    "Allow: /api/v1/llms.txt",
  ];

  const blocks = robotAgents.map((agent) => [`User-agent: ${agent}`, ...policy].join("\n"));

  return [
    ...blocks,
    `Content-Signal: ${contentSignal}`,
    `Sitemap: ${absoluteUrl(origin, "/sitemap.xml")}`,
  ].join("\n\n");
}

export function createSitemapEntries(origin: string): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.6,
    url: absoluteUrl(origin, path),
  }));
}

export function createApiCatalog(origin: string) {
  return {
    linkset: [
      {
        anchor: absoluteUrl(origin, "/api/v1"),
        "service-desc": [
          {
            href: absoluteUrl(origin, "/api/v1/openapi.json"),
            type: "application/vnd.oai.openapi+json;version=3.1",
          },
        ],
        "service-doc": [{ href: absoluteUrl(origin, "/#quickstart"), type: "text/html" }],
        status: [{ href: absoluteUrl(origin, "/api/v1/health"), type: "application/json" }],
      },
    ],
  };
}

export function createAgentSkillsIndex(origin: string) {
  const skills = mcpToolCapabilities.map((tool) => {
    const slug = skillSlug(tool.name);
    const markdown = toolMarkdown(tool);
    const hash = sha256(markdown);

    return {
      description: generatedToolDescription(tool),
      digest: `sha256:${hash}`,
      name: slug,
      sha256: hash,
      type: "skill-md",
      url: absoluteUrl(origin, `/.well-known/agent-skills/${slug}.md`),
    };
  });

  const archiveSkills = taskSkills.map((skill) => {
    const { sha256: hash } = getSkillArchive(skill);
    return {
      description: skill.description,
      digest: `sha256:${hash}`,
      name: skill.slug,
      sha256: hash,
      type: "archive",
      url: absoluteUrl(origin, `/.well-known/agent-skills/${skill.slug}.tar.gz`),
    };
  });

  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [...skills, ...archiveSkills],
  };
}

export function createAgentSkillMarkdown(slug: string) {
  const tool = toolBySlug(slug);
  return tool ? toolMarkdown(tool) : null;
}

export function createSkillArchiveBytes(slug: string): Buffer | null {
  const cleanSlug = slug.replace(/\.tar\.gz$/i, "");
  const skill = taskSkills.find((entry) => entry.slug === cleanSlug);
  return skill ? getSkillArchive(skill).bytes : null;
}

export function createMcpServerCard(origin: string) {
  return {
    $schema: "https://modelcontextprotocol.io/schemas/server-card/2025-11-25.json",
    authentication: {
      protectedResourceMetadata: absoluteUrl(
        origin,
        "/.well-known/oauth-protected-resource/api/mcp",
      ),
      required: true,
      schemes: ["bearer"],
    },
    capabilities: {
      prompts: [],
      resources: [],
      tools: mcpToolCapabilities.map((tool) => ({
        description: tool.description,
        inputSchema: tool.input_schema,
        name: tool.name,
      })),
    },
    links: {
      capabilities: absoluteUrl(origin, "/api/v1/capabilities"),
      openapi: absoluteUrl(origin, "/api/v1/openapi.json"),
    },
    protocolVersion: "2025-11-25",
    serverInfo: { name: "bisibility", version: process.env.npm_package_version ?? "0.0.0" },
    transport: {
      endpoint: absoluteUrl(origin, "/api/v1"),
      note: "REST fallback because @modelcontextprotocol/sdk is not installed in this app.",
      type: "http",
    },
  };
}
