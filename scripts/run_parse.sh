#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$DIR")"
cd "$ROOT_DIR"

exec node "$DIR/parse-cli.js" "$@"

