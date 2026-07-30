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
auth_secret="$(openssl rand -base64 32)"
secrets_key="$(openssl rand -base64 32)"
tmp_file="${ENV_FILE}.tmp.$$"
trap 'rm -f "$tmp_file"' EXIT
umask 077

awk \
  -v postgres="$postgres_password" \
  -v auth="$auth_secret" \
  -v key="$secrets_key" '
    /^POSTGRES_PASSWORD=/ { print "POSTGRES_PASSWORD=" postgres; next }
    /^BETTER_AUTH_SECRET=/ { print "BETTER_AUTH_SECRET=" auth; next }
    /^BISIBILITY_SECRETS_KEY=/ { print "BISIBILITY_SECRETS_KEY=" key; next }
    /^# DEMO_FIXED_OTP=/ { print "DEMO_FIXED_OTP=1"; next }
    /^# DEMO_INSTANCE_INSECURE_AUTH_ACK=/ { print "DEMO_INSTANCE_INSECURE_AUTH_ACK=1"; next }
    { print }
  ' "$ENV_EXAMPLE" > "$tmp_file"

for required in POSTGRES_PASSWORD BETTER_AUTH_SECRET BISIBILITY_SECRETS_KEY; do
  grep -Eq "^${required}=.+" "$tmp_file" || fail "$required was not generated"
done
grep -Fxq "DEMO_FIXED_OTP=1" "$tmp_file" || fail "DEMO_FIXED_OTP was not enabled"
grep -Fxq "DEMO_INSTANCE_INSECURE_AUTH_ACK=1" "$tmp_file" \
  || fail "DEMO_INSTANCE_INSECURE_AUTH_ACK was not enabled"

mv "$tmp_file" "$ENV_FILE"
trap - EXIT

docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.yml" config --quiet

echo "Created $ENV_FILE with mode 600 and validated the Docker Compose configuration."
echo
echo "Next steps, pick one:"
echo
echo "  docker compose up --build"
echo "    App:          http://localhost:3000  (manual rank checks only, no scheduler)"
echo
echo "  docker compose --profile scheduled up --build"
echo "    App:          http://localhost:3000"
echo "    Temporal UI:  http://localhost:8233  (scheduled checks worker included)"
echo
echo "Postgres listens on localhost:5432 (override with POSTGRES_HOST_PORT in .env)."
echo "Sign in at http://localhost:3000 with demo@acme.dev and OTP 000000."
