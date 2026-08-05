#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_EXAMPLE="${BISIBILITY_ENV_EXAMPLE:-$ROOT_DIR/.env.example}"
ENV_FILE="${BISIBILITY_ENV_FILE:-$ROOT_DIR/.env}"

fail() {
  echo "Local bootstrap failed: $*" >&2
  exit 1
}

[[ -f "$ENV_EXAMPLE" ]] || fail "missing environment template: $ENV_EXAMPLE"
[[ ! -e "$ENV_FILE" ]] || fail "$ENV_FILE already exists; remove it explicitly before bootstrapping again"
command -v openssl >/dev/null 2>&1 || fail "openssl is required"
command -v docker >/dev/null 2>&1 || fail "Docker with Compose is required"

postgres_password="$(openssl rand -hex 24)"
temporal_postgres_password="$(openssl rand -hex 24)"
auth_secret="$(openssl rand -base64 32)"
secrets_key="$(openssl rand -base64 32)"
deployment_suffix="$(openssl rand -hex 4)"
probe_token="${INTERNAL_PROBE_TOKEN:-$(openssl rand -base64 32)}"
tmp_file="${ENV_FILE}.tmp.$$"
trap 'rm -f "$tmp_file"' EXIT
umask 077

awk \
  -v postgres="$postgres_password" \
  -v temporal_postgres="$temporal_postgres_password" \
  -v auth="$auth_secret" \
  -v key="$secrets_key" \
  -v suffix="$deployment_suffix" \
  -v probe="$probe_token" '
    /^POSTGRES_PASSWORD=/ { print "POSTGRES_PASSWORD=" postgres; next }
    /^TEMPORAL_POSTGRES_PASSWORD=/ { print "TEMPORAL_POSTGRES_PASSWORD=" temporal_postgres; next }
    /^SITE_URL=/ { print "SITE_URL=http://localhost:3000"; next }
    /^BETTER_AUTH_URL=/ { print "BETTER_AUTH_URL=http://localhost:3000"; next }
    /^DEPLOYMENT_ENV=/ { print "DEPLOYMENT_ENV=development"; next }
    /^BETTER_AUTH_SECRET=/ { print "BETTER_AUTH_SECRET=" auth; next }
    /^BISIBILITY_SECRETS_KEY=/ { print "BISIBILITY_SECRETS_KEY=" key; next }
    /^BISIBILITY_DEPLOYMENT_SUFFIX=/ { print "BISIBILITY_DEPLOYMENT_SUFFIX=" suffix; next }
    $0 == "# INTERNAL_PROBE_TOKEN" "=" { print "INTERNAL_PROBE_TOKEN" "=" probe; next }
    /^# DEMO_FIXED_OTP=/ { print "DEMO_FIXED_OTP=1"; next }
    /^# DEMO_INSTANCE_INSECURE_AUTH_ACK=/ { print "DEMO_INSTANCE_INSECURE_AUTH_ACK=1"; next }
    { print }
  ' "$ENV_EXAMPLE" > "$tmp_file"

if ! grep -q '^BISIBILITY_DEPLOYMENT_SUFFIX=' "$tmp_file"; then
  printf '\nBISIBILITY_DEPLOYMENT_SUFFIX=%s\n' "$deployment_suffix" >> "$tmp_file"
fi

for required in POSTGRES_PASSWORD TEMPORAL_POSTGRES_PASSWORD BETTER_AUTH_SECRET BISIBILITY_SECRETS_KEY BISIBILITY_DEPLOYMENT_SUFFIX INTERNAL_PROBE_TOKEN; do
  grep -Eq "^${required}=.+" "$tmp_file" || fail "$required was not generated"
done
grep -Fxq "SITE_URL=http://localhost:3000" "$tmp_file" || fail "SITE_URL was not configured"
grep -Fxq "BETTER_AUTH_URL=http://localhost:3000" "$tmp_file" \
  || fail "BETTER_AUTH_URL was not configured"
grep -Fxq "DEPLOYMENT_ENV=development" "$tmp_file" \
  || fail "DEPLOYMENT_ENV was not configured for the demo"
grep -Fxq "DEMO_FIXED_OTP=1" "$tmp_file" || fail "DEMO_FIXED_OTP was not enabled"
grep -Fxq "DEMO_INSTANCE_INSECURE_AUTH_ACK=1" "$tmp_file" \
  || fail "DEMO_INSTANCE_INSECURE_AUTH_ACK was not enabled"

mv "$tmp_file" "$ENV_FILE"
trap - EXIT

docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.yaml" config --quiet

echo "Created $ENV_FILE with mode 600 and validated the Docker Compose configuration."
echo
echo "Next steps, pick one:"
echo
echo "  docker compose -f compose.yaml up -d"
echo "    App:          http://localhost:3000  (manual rank checks only, no scheduler)"
echo
echo "  docker compose -f compose.yaml -f compose.worker.yaml -f compose.temporal.yaml --profile temporal-ui up -d"
echo "    App:          http://localhost:3000"
echo "    Temporal UI:  http://localhost:8233  (scheduled checks worker included)"
echo
echo "PostgreSQL is reachable only inside the Compose network."
echo "For deliberate host access, use: docker compose -f compose.yaml -f docker-compose.debug.yml up -d"
echo "Sign in at http://localhost:3000 with demo@acme.dev and OTP 000000."
