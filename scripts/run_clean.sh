#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$DIR")"

show_help() {
  echo "Usage: ./run clean [options]"
  echo ""
  echo "Options:"
  echo "  --android, -a    Clean Android build caches (cd android && ./gradlew clean)"
  echo "  --metro, -m      Clear Metro bundler cache and watchman watches"
  echo "  --jaeger, -j     Purge persistent Jaeger trace files on disk"
  echo "  --all            Perform full cleanup (Android, Metro, and Jaeger)"
  echo "  --help, -h       Show this help message"
}

clean_android() {
  echo "🧹 Cleaning Android build cache..."
  if [ -d "$ROOT_DIR/android" ]; then
    cd "$ROOT_DIR/android"
    ./gradlew clean
    cd "$ROOT_DIR"
    echo "✔ Android build cleaned."
  fi
}

clean_metro() {
  echo "🧹 Cleaning Metro cache and watchman files..."
  which watchman >/dev/null 2>&1 && watchman watch-del-all 2>/dev/null || true
  rm -rf "$TMPDIR/metro-*" "$TMPDIR/haste-map-*" /tmp/metro-* 2>/dev/null || true
  echo "✔ Metro cache cleared."
}

clean_jaeger() {
  "$DIR/run_jaeger.sh" clean -f
}

case "${1:---all}" in
  --android|-a|android)
    clean_android
    ;;
  --metro|-m|metro)
    clean_metro
    ;;
  --jaeger|-j|jaeger)
    clean_jaeger
    ;;
  --all|all)
    clean_android
    clean_metro
    clean_jaeger
    echo "✔ Full cleanup complete."
    ;;
  --help|-h|help)
    show_help
    ;;
  *)
    echo "Unknown clean option: $1"
    show_help
    exit 1
    ;;
esac
