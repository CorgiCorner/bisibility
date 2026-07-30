# Netlify deploy notification

Create an ingest hook in **Settings > Deploy webhooks**, then add an outgoing
deploy notification for successful deploys.

1. Open the site in Netlify.
2. Go to deploy notifications.
3. Add an outgoing notification for **Deploy ready**.
4. Use this endpoint:

```text
https://<your-instance>.example.com/api/ingest/deploy?provider=netlify&token=<ingest-hook-token>
```

Netlify deploy notifications do not send custom authorization headers, so this
example uses the query token form.

Query tokens can appear in proxy, CDN, and access logs. Rotate the hook if its
URL is exposed.

## Delivery behavior

Bisibility does not verify provider-native webhook signatures. The ingest token
is the only authentication. The endpoint permits 60 anonymous requests per
client address per minute and 600 authenticated requests per hook per minute.
A repeated event with the same deployment identifier and hook is collapsed for
60 minutes instead of creating another timeline signal.
