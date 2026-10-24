#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$DIR")"
cd "$ROOT_DIR"

show_help() {
  echo "Usage: ./run app [platform] [options]"
  echo ""
  echo "Platforms:"
  echo "  --android, -a    Build debug APK and launch on connected Android device/emulator"
  echo "  --ios, -i        Build and launch on iOS simulator"
  echo "  --help, -h       Show this help message"
}

case "${1:---android}" in
  --android|-a|android)
    shift || true
    echo "📱 Building and deploying Android app..."
    npx react-native run-android "$@"
    ;;
  --ios|-i|ios)
    shift || true
    echo "🍏 Building and deploying iOS app..."
    npx react-native run-ios "$@"
    ;;
  --help|-h|help)
    show_help
    ;;
  *)
    echo "Unknown app platform: $1"
    show_help
    exit 1
    ;;
esac
