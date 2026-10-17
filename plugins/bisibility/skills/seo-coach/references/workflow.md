# Route from intent to a shipped plugin skill

| User need | Next command and reason |
|-|-|
| Set up a domain or save goals, audience, products, competitors and key pages | `/bisibility:project-setup` - establish reusable context and a confirmed setup plan. |
| Decide where to start | `/bisibility:seo-coach` - clarify the goal, then select one concrete next skill. Do not recursively invoke yourself. |
| Prioritize technical, content and visibility fixes | `/bisibility:seo-audit` - combine a bounded crawl with saved evidence. |
| Find new queries or demand opportunities | `/bisibility:keyword-opportunity-research` - research and prioritize keywords with cost approval. |
| Explain weekly ranking gains and losses | `/bisibility:rank-tracking-report` - analyze saved checks. |
| Review link quality and referring domains | `/bisibility:backlink-profile-analysis` - analyze a backlink profile with cost approval. |
| Explain retained AI mentions/citations | `/bisibility:ai-visibility-audit` - separate observed visibility from synthetic tests. |
| Investigate noisy or sudden ranking alerts | `/bisibility:alert-triage` - corroborate alerts against rank history. |
| Group existing phrases into pages and check conflicting targets | `/bisibility:keyword-clustering` - use intent heuristics and saved evidence before optional enrichment. |
| Understand one competitor's keywords, pages and strategy | `/bisibility:competitor-analysis` - compare one rival with the tracked project baseline after a complete cost plan. |
| Compare who leads across a market | `/bisibility:competitive-landscape` - map the project plus up to five rivals with per-domain estimates and one approved total cap. |

A precise user goal needs no extra question. For a broad request, first resolve the project and ask which outcome matters (setup, rankings, content, links or AI visibility); count each question toward the limit of two. Use saved goals if already sufficient. If ambiguity persists, state what remains unknown and give an explicitly conditional route. Never select a project merely because it is the first list result.

Start with context. Additional reads are optional: at most 50 keywords, 50 triggered alerts and three report summaries. Respect each tool's real input schema and response cursor; if the sample is incomplete, label it. No fresh crawl, provider estimate, report save, tracking change or paid call belongs here, even if the tool is exposed.

The archive router also handles provider setup, keyword import, instance health and team/API governance. Those archive-only skills are not plugin commands. Explain an unsupported need without inventing a plugin slug or an installation URL. Do not route unrelated writing or general questions into Bisibility.

Example: for 'What should I improve next for example.com?' with a clear saved goal and recent alerts, recommend `/bisibility:alert-triage` with the reason 'Verify the recent drops before choosing page changes.' An unreadable project means the reason must rely on the user's request, not invented saved evidence.
