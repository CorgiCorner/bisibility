import { featureChips, type KnownFeature } from "./retrieved-results-model";

export type RichSerpItem = {
  title: string;
  text?: string;
  url?: string;
  imageUrl?: string;
  source?: string;
  price?: string;
  priceAmount?: number;
  priceCurrency?: string;
  rating?: number;
  reviewCount?: number;
  facts?: { label: string; value: string }[];
};
export type RichSerpFeature = {
  kind: KnownFeature | "other";
  nativeTypes: string[];
  items: RichSerpItem[];
};
type Row = Record<string, unknown>;
const record = (v: unknown): Row | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null;
const text = (...values: unknown[]) => {
  const value = values.find((v) => typeof v === "string" && v.trim());
  return typeof value === "string" ? value.trim().slice(0, 3000) : undefined;
};
const number = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
export function serpPreviewUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096) return;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return;
    // Reusable provider links are neither navigation destinations nor preview images.
    if ([...url.searchParams.keys()].some((key) => /token|api_key|secret|signature/i.test(key)))
      return;
    return url.href;
  } catch {
    return;
  }
}
const aliases: Record<string, KnownFeature> = {
  knowledge_graph: "knowledgePanel",
  knowledge_graph_description_item: "knowledgePanel",
  knowledge_graph_images_item: "knowledgePanel",
  knowledge_graph_list_item: "knowledgePanel",
  images: "images",
  images_results: "images",
  inline_images: "images",
  shopping: "shopping",
  shopping_results: "shopping",
  inline_shopping: "shopping",
  popular_products: "shopping",
  immersive_products: "shopping",
  product_result: "shopping",
  related_questions: "peopleAlsoAsk",
  people_also_ask: "peopleAlsoAsk",
  answer_box: "featuredSnippet",
  featured_snippet: "featuredSnippet",
  video: "video",
  video_results: "video",
  short_videos: "video",
  inline_videos: "video",
  top_stories: "topStories",
  news_results: "news",
  paid: "ads",
  ads: "ads",
  top_ads: "ads",
  bottom_ads: "ads",
  local_ads: "ads",
  related_searches: "relatedSearches",
  recipes: "recipes",
  recipes_results: "recipes",
  events: "events",
  events_results: "events",
  discussions_and_forums: "discussions",
  perspectives: "discussions",
};
function kindOf(native: string): RichSerpFeature["kind"] {
  return aliases[native] ?? featureChips([native.replaceAll("_", " ")])[0]?.known ?? "other";
}
function projectItem(row: Row): RichSerpItem | null {
  const image = record(row.image),
    rating = record(row.rating),
    price = record(row.price);
  const title = text(row.title, row.name, row.question, row.alt, row.text, row.snippet);
  const imageUrl = serpPreviewUrl(
    row.thumbnail ?? row.image_url ?? image?.url ?? row.image ?? row.original,
  );
  const url = serpPreviewUrl(row.link ?? row.url ?? row.source_url);
  if (!title && !imageUrl) return null;
  const facts: { label: string; value: string }[] = [];
  for (const attribute of Array.isArray(row.attributes) ? row.attributes.slice(0, 12) : []) {
    const fact = record(attribute);
    const label = text(fact?.name, fact?.label),
      value = text(fact?.value, fact?.text);
    if (label && value) facts.push({ label, value });
  }
  const description = text(row.description, row.snippet, row.text, row.answer);
  return {
    title: title ?? "",
    ...(description && description !== title ? { text: description } : {}),
    ...(url ? { url } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(text(row.source, row.seller, row.domain, row.website)
      ? { source: text(row.source, row.seller, row.domain, row.website) }
      : {}),
    ...(text(row.price, price?.displayed_price, price?.display_price, price?.current)
      ? { price: text(row.price, price?.displayed_price, price?.display_price, price?.current) }
      : {}),
    ...(number(price?.current) !== undefined
      ? {
          priceAmount: number(price?.current),
          ...(typeof price?.currency === "string" && /^[A-Z]{3}$/.test(price.currency)
            ? { priceCurrency: price.currency }
            : {}),
        }
      : {}),
    ...((number(row.rating) ?? number(rating?.value)) !== undefined
      ? { rating: number(row.rating) ?? number(rating?.value) }
      : {}),
    ...(number(row.reviews ?? rating?.votes_count) !== undefined
      ? { reviewCount: number(row.reviews ?? rating?.votes_count) }
      : {}),
    ...(facts.length ? { facts } : {}),
  };
}
/** A bounded, explicit projection, never a recursive dump of a native response. */
export function richSerpFeatures(
  native: unknown,
  declared: readonly string[] = [],
): RichSerpFeature[] {
  const groups = new Map<RichSerpFeature["kind"], RichSerpFeature>();
  const add = (nativeType: string, value: unknown) => {
    const kind = kindOf(nativeType);
    if (kind === "aiOverview" || kind === "localPack" || nativeType === "organic") return;
    let group = groups.get(kind);
    if (!group) {
      group = { kind, nativeTypes: [], items: [] };
      groups.set(kind, group);
    }
    if (!group.nativeTypes.includes(nativeType)) group.nativeTypes.push(nativeType.slice(0, 100));
    const parent = record(value);
    const children = parent?.items ?? parent?.results ?? parent?.questions ?? parent?.images;
    const rows = Array.isArray(value)
      ? value
      : Array.isArray(children)
        ? [parent, ...children]
        : [value];
    for (const value of rows.slice(0, 30)) {
      const row = record(value),
        item = row ? projectItem(row) : null;
      if (
        item &&
        group.items.length < 30 &&
        !group.items.some((x) => JSON.stringify(x) === JSON.stringify(item))
      )
        group.items.push(item);
    }
  };
  const envelopes = Array.isArray(native) ? native.slice(0, 10) : [native];
  for (const envelope of envelopes) {
    const page = record(envelope);
    if (!page) continue;
    if (Array.isArray(page.tasks)) {
      for (const task of page.tasks.slice(0, 10)) {
        const results = record(task)?.result;
        for (const result of Array.isArray(results) ? results.slice(0, 10) : []) {
          const rows = record(result)?.items;
          for (const value of Array.isArray(rows) ? rows.slice(0, 200) : []) {
            const row = record(value);
            if (
              row &&
              typeof row.type === "string" &&
              !["organic", "ai_overview", "local_pack"].includes(row.type)
            )
              add(row.type, row);
          }
        }
      }
    } else {
      for (const key of Object.keys(aliases)) {
        const value = page[key];
        if ((Array.isArray(value) && value.length) || record(value)) add(key, value);
      }
    }
  }
  for (const feature of declared.slice(0, 60)) add(feature.replaceAll(" ", "_"), null);
  return [...groups.values()];
}
