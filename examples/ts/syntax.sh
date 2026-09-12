#!/usr/bin/env sh
set -eu
node --experimental-strip-types --check "$(dirname "$0")/list-projects.ts"
echo "OK ts-list-projects-syntax"
