# Vercel deploy webhook

Create an ingest hook in **Settings > Deploy webhooks**, then create a project
webhook for successful deployments.

1. Open the project in Vercel.
2. Add a webhook for `deployment.succeeded`.
3. Use this endpoint:

```text
https://<your-instance>.example.com/api/ingest/deploy?provider=vercel
```

Use an `Authorization: Bearer <ingest-hook-token>` header when your webhook
setup supports custom headers. If it does not, append the token:

```text
https://<your-instance>.example.com/api/ingest/deploy?provider=vercel&token=<ingest-hook-token>
```

Query tokens can appear in proxy, CDN, and access logs. Prefer the bearer header
whenever the webhook setup supports it.

## Delivery behavior

Bisibility does not verify provider-native webhook signatures. The ingest token
is the only authentication. The endpoint permits 60 anonymous requests per
client address per minute and 600 authenticated requests per hook per minute.
A repeated event with the same deployment identifier and hook is collapsed for
60 minutes instead of creating another timeline signal.
