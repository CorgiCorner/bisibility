# Security Policy

## Supported versions

Only the latest release is supported for security fixes.

## Reporting a vulnerability

Do not open a public issue for suspected vulnerabilities.

Send reports to: `security@bisibility.com`.

Please include:

- A description of the issue and impact
- Steps to reproduce or proof of concept
- Affected version or commit
- Any suggested mitigation

Reports are acknowledged within 48 hours. The maintainer will review accepted
reports and publish fixes in a future release.

## API keys and webhooks

API keys are bearer secrets. They are stored in the database as hashes, not raw
values; treat an API-key leak like a password leak.

Webhook payloads are signed. Verify the signature and treat handlers as
idempotent. Outbound webhook delivery accepts only HTTP(S) URLs and rejects
loopback, RFC1918 private, IPv4/IPv6 link-local, and IPv6 unique-local targets
by default. DNS names are resolved before posting, and delivery is rejected if
any resolved address is blocked.

For a self-hosted deployment you control that must deliver webhooks to internal
services, set `WEBHOOK_ALLOW_PRIVATE_NETWORK=1`. Keep it unset for public-facing
deployments.
