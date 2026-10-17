export type CacheModule =
  | "keyword_research"
  | "keyword_metrics"
  | "ranked_keywords"
  | "backlinks"
  | "domain_overview"
  | "ai_visibility"
  | "prompt_explorer"
  | "site_audit";
export function identifyProjectCacheKey(key: string, projectId: string) {
  const p = key.split(":");
  if (p[2] !== projectId || !/^[a-zA-Z0-9_-]+$/.test(projectId)) return null;
  if (
    p[0] === "kr" &&
    p[1] === "v2" &&
    p.length >= 10 &&
    ["related", "suggestion", "idea"].includes(p.at(-3) ?? "") &&
    /^\d+$/.test(p.at(-2) ?? "") &&
    /^[01]$/.test(p.at(-1) ?? "")
  )
    return {
      module: "keyword_research" as const,
      keyword: p.slice(4, -5).join(":"),
      source: p.at(-3) ?? "",
      providerRef: p[3],
      country: p.at(-5) ?? "",
      language: p.at(-4) ?? "",
    };
  if (
    p[0] === "km" &&
    p[1] === "v1" &&
    p.length >= 7 &&
    /^[01]$/.test(p.at(-2) ?? "") &&
    /^[a-f0-9]{64}$/.test(p.at(-1) ?? "")
  )
    return {
      module: "keyword_metrics" as const,
      keyword: null,
      source: "metrics",
      providerRef: p[3],
      country: p.slice(4, -2).join(":"),
      language: "",
    };
  if (
    p[0] === "rk" &&
    p[1] === "v2" &&
    p.length >= 8 &&
    /^\d+$/.test(p.at(-1) ?? "") &&
    /^\d+$/.test(p.at(-2) ?? "")
  )
    return {
      module: "ranked_keywords" as const,
      keyword: p[4],
      source: "keywords",
      providerRef: p[3],
      country: p.slice(5, -2).join(":"),
      language: "",
    };
  if (
    p[0] === "bl" &&
    p[1] === "v3" &&
    p.length >= 9 &&
    /^\d+$/.test(p.at(-1) ?? "") &&
    /^[01]$/.test(p.at(-3) ?? "") &&
    ["site", "page"].includes(p.at(-4) ?? "") &&
    ["as_is", "one_per_domain"].includes(p.at(-2) ?? "")
  )
    return {
      module: "backlinks" as const,
      keyword: p.slice(4, -4).join(":"),
      source: "backlinks",
      providerRef: decodeURIComponent(p[3]),
      scope: p.at(-4) ?? "",
      includeSubdomains: p.at(-3) === "1",
      mode: p.at(-2) ?? "",
      country: p.at(-4) ?? "",
      language: "",
    };
  if (
    p[0] === "do" &&
    p[1] === "v1" &&
    p.length >= 9 &&
    ["overview", "history", "keywords", "pages"].includes(p[4])
  ) {
    const paged = ["keywords", "pages"].includes(p[4]);
    const tail = paged ? 5 : 3;
    if (
      !["root", "subdomain"].includes(p.at(-tail) ?? "") ||
      !/^\d+$/.test(p.at(-(tail - 1)) ?? "") ||
      !/^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(p.at(-(tail - 2)) ?? "") ||
      (paged && (!/^\d+$/.test(p.at(-1) ?? "") || !/^\d+$/.test(p.at(-2) ?? "")))
    )
      return null;
    return {
      module: "domain_overview" as const,
      keyword: p.slice(5, -tail).join(":"),
      source: p[4],
      scope: p.at(-tail) ?? "",
      providerRef: p[3],
      country: p.at(-(tail - 1)) ?? "",
      language: p.at(-(tail - 2)) ?? "",
    };
  }
  if (
    p[0] === "ai" &&
    /^v[12](?:-provider-domain-v1)?$/.test(p[1]) &&
    p.length === 6 &&
    ["ai_visibility", "prompt_explorer"].includes(p[4]) &&
    /^[a-f0-9]{64}$/.test(p[5])
  )
    return {
      module: p[4] as "ai_visibility" | "prompt_explorer",
      keyword: null,
      source: p[4],
      providerRef: p[3],
      country: "",
      language: "",
    };
  return null;
}
