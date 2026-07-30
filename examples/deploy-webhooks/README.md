# Deploy webhook examples

Use these examples to send successful deployment events to bisibility as
`deploy.completed` timeline signals.

Start in the app at **Settings > Deploy webhooks** and create an ingest hook.
Copy the token when it is revealed. The full setup guide is in
[Deploy webhooks](/docs/api/deploy-webhooks).

Examples:

- [`generic-curl.sh`](./generic-curl.sh) sends a generic deploy event.
- [`vercel.md`](./vercel.md) shows the project webhook setup.
- [`netlify.md`](./netlify.md) shows the deploy notification setup.
- [`amplify-eventbridge.md`](./amplify-eventbridge.md) shows the EventBridge API
  destination setup.
