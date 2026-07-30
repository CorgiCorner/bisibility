# AWS Amplify EventBridge deploy hook

Amplify Hosting emits deployment status changes through EventBridge. Forward the
raw event to bisibility with an EventBridge rule and API destination. Do not add
an input transformer.

Create an ingest hook in **Settings > Deploy webhooks**, then point the API
destination at:

```text
https://<your-instance>.example.com/api/ingest/deploy?provider=amplify
```

Configure the connection to send:

```text
Authorization: Bearer <ingest-hook-token>
```

Create a rule for successful Amplify deployments:

```bash
aws events put-rule \
  --name bisibility-amplify-deploys \
  --event-pattern '{
    "source": ["aws.amplify"],
    "detail-type": ["Amplify Deployment Status Change"],
    "detail": { "jobStatus": ["SUCCEED"] }
  }'
```

Create the connection and API destination:

```bash
aws events create-connection \
  --name bisibility-deploy-hook \
  --authorization-type API_KEY \
  --auth-parameters '{
    "ApiKeyAuthParameters": {
      "ApiKeyName": "Authorization",
      "ApiKeyValue": "Bearer <ingest-hook-token>"
    }
  }'

aws events create-api-destination \
  --name bisibility-deploy-hook \
  --connection-arn <connection-arn> \
  --invocation-endpoint 'https://<your-instance>.example.com/api/ingest/deploy?provider=amplify' \
  --http-method POST
```

Add the API destination as the target:

```bash
aws events put-targets \
  --rule bisibility-amplify-deploys \
  --targets 'Id=bisibility-deploy-hook,Arn=<api-destination-arn>,RoleArn=<eventbridge-invoke-role-arn>'
```

The target role must trust `events.amazonaws.com` and allow
`events:InvokeApiDestination` for the API destination ARN.

## Delivery behavior

Bisibility does not verify provider-native webhook signatures. The ingest token
is the only authentication. The endpoint permits 60 anonymous requests per
client address per minute and 600 authenticated requests per hook per minute.
A repeated event with the same deployment identifier and hook is collapsed for
60 minutes instead of creating another timeline signal.
