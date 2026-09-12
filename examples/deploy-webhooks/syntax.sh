#!/usr/bin/env sh
set -eu
sh -n "$(dirname "$0")/generic-curl.sh"
echo "OK deploy-webhook-curl-syntax"
