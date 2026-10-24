#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$DIR")"

show_help() {
  echo "Usage: ./run setup [options]"
  echo ""
  echo "Options:"
  echo "  --android, -a    Verify Node >= 22 and auto-configure android/local.properties"
  echo "  --ios, -i        Run CocoaPods 'pod install' in ios/"
  echo "  --all            Run both Android and iOS platform setups"
  echo "  --help, -h       Show this help message"
}

case "${1:---android}" in
  --android|-a|android)
    echo "🔧 Running Android environment setup..."
    node "$DIR/setup-android.js"
    ;;
  --ios|-i|ios)
    echo "🔧 Running iOS CocoaPods setup..."
    if [ -d "$ROOT_DIR/ios" ]; then
      cd "$ROOT_DIR/ios"
      if which pod >/dev/null 2>&1; then
        pod install
        echo "✔ iOS CocoaPods installed."
      else
        echo "❌ CocoaPods ('pod') not found in PATH."
        exit 1
      fi
      cd "$ROOT_DIR"
    else
      echo "ℹ No ios/ directory found."
    fi
    ;;
  --all|all)
    "$0" --android
    "$0" --ios
    ;;
  --help|-h|help)
    show_help
    ;;
  *)
    echo "Unknown setup option: $1"
    show_help
    exit 1
    ;;
esac
