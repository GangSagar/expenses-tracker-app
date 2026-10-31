#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/../.." && pwd)"
cd "$ROOT_DIR"

show_help() {
  echo "Usage: ./run test [options]"
  echo ""
  echo "Options:"
  echo "  (no args)        Run all core unit test suites (719 passing tests)"
  echo "  --simulate, -s   Simulate live SMS, App notifications (GPay/PhonePe/Paytm/BHIM), & spam/filter tests"
  echo "  --all, -a        Run all test suites including collected real SMS dumps"
  echo "  --watch, -w      Run Jest in interactive watch mode"
  echo "  --collect, -c    Harvest real bank SMS from connected phone via ADB"
  echo "  --benchmark, -b  Benchmark parser throughput (e.g. ./run test -b 5000)"
  echo "  <test-path>      Run specific test file (e.g. ./run test src/__tests__/parser.test.ts)"
  echo "  --help, -h       Show this help message"
}

case "${1:-}" in
  --simulate|-s|simulate)
    shift || true
    exec "$ROOT_DIR/scripts/simulator/simulate_message.sh" "$@"
    ;;
  --benchmark|-b|benchmark)
    echo "⚡ Running SMS parser throughput benchmark..."
    node "$ROOT_DIR/scripts/tools/parse-cli.js" --benchmark "${2:-1000}"
    ;;
  --all|-a|all)
    echo "🧪 Running all test suites..."
    npx jest
    ;;
  --watch|-w|watch)
    echo "🧪 Running Jest in interactive watch mode..."
    npx jest --watch
    ;;
  --collect|-c|collect)
    echo "📱 Harvesting real SMS test cases from connected phone via ADB..."
    python3 "$ROOT_DIR/scripts/simulator/collect-testcases.py"
    ;;
  --help|-h|help)
    show_help
    ;;
  *)
    if [ -n "$1" ] && [ -f "$1" ]; then
      echo "🧪 Running specified test file: $1..."
      npx jest "$@"
    else
      echo "🧪 Running core unit test suites..."
      npx jest --testPathIgnorePatterns="collected-real" "$@"
    fi
    ;;
esac
