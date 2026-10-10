// Fictional structured source fixtures. No account response or production prices.
export const fixtureOrigin = "https://developers.openai.com";
export const fixturePaths = [
  "/api/docs/models/gpt-4.1-mini",
  "/_astro/LocalizedModels.react.fixture.js?dpl=test",
  "/_astro/localization.react.fixture.js?dpl=test",
  "/_astro/pricing.fixture.js?dpl=test",
];
export function fixtureItem(name: string) {
  const values = { main: { input: 0.7, output: 3.5 }, batch: { input: 0.01, output: 0.02 } };
  return {
    name,
    current_snapshot: `${name}-2025-04-14`,
    values,
    snapshots: [{ name: `${name}-2025-04-14`, values }],
  };
}
export function fixtureTable() {
  return {
    name: "Latest models",
    subsections: [
      {
        price_type: "Text tokens",
        show_price_unit: true,
        columns: [{ name: "input" }, { name: "cached_input" }, { name: "output" }],
        items: [fixtureItem("gpt-4.1-mini"), fixtureItem("gpt-4.1-nano")],
      },
    ],
  };
}
export function fixturePricing(table: unknown = fixtureTable()) {
  return `const data=JSON.parse(\`${JSON.stringify(table)}\`);`;
}
export const fixtureDescriptor = [
  'import p from "./pricing.fixture.js?dpl=test";',
  "for(let e of d){let{price_type:t,price_unit:n,show_price_unit:r,columns:i}=e;let re=n??`1M tokens`;}",
  ...["gpt-4.1-mini", "gpt-4.1-nano"].flatMap((name) => [
    `const alias={name:\`${name}\`,slug:\`${name}\`,current_snapshot:\`${name}-2025-04-14\`,type:\`chat\`,snapshots:[\`${name}-2025-04-14\`]};`,
    `const dated={name:\`${name}-2025-04-14\`,slug:\`${name}-2025-04-14\`,context_window:900000,max_output_tokens:28000,knowledge_cutoff:new Date(17172e8),reasoning_tokens:!1};`,
  ]),
].join("\n");
export const fixtureRenderer =
  "let compare=new Intl.NumberFormat(`en-US`,{style:`currency`,currency:`USD`});function Card({label:l,price:p,unit:u}){let fmt=new Intl.NumberFormat(`en-US`,{style:`currency`,currency:`USD`});return fmt.format(p)}";
export const fixtureBodies = [
  `<astro-island component-url="${fixturePaths[1]}"></astro-island>`,
  `import { data } from "./localization.react.fixture.js?dpl=test";${fixtureRenderer}`,
  fixtureDescriptor,
  fixturePricing(),
];
