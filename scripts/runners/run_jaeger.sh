#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$DIR/../.." && pwd)"
JAEGER_BIN="$PROJECT_ROOT/scripts/jaeger/jaeger-all-in-one"
DATA_DIR="$PROJECT_ROOT/scripts/jaeger/data"
LOG_DIR="$PROJECT_ROOT/scripts/jaeger/logs"
LOG_FILE="$LOG_DIR/jaeger.log"

UI_CONFIG="$PROJECT_ROOT/scripts/jaeger/jaeger-ui.json"

ensure_installed() {
  if [ ! -f "$JAEGER_BIN" ]; then
    echo "📥 Jaeger binary not found. Downloading Jaeger v1.60.0..."
    mkdir -p "$DIR/jaeger"
    cd "$DIR/jaeger"
    wget -q https://github.com/jaegertracing/jaeger/releases/download/v1.60.0/jaeger-1.60.0-linux-amd64.tar.gz
    tar -xzf jaeger-1.60.0-linux-amd64.tar.gz --strip-components=1
    rm jaeger-1.60.0-linux-amd64.tar.gz
    cd "$PROJECT_ROOT"
  fi
}

setup_adb_ports() {
  if which adb >/dev/null 2>&1; then
    devices=$(adb devices | grep -w "device" | awk '{print $1}')
    for dev in $devices; do
      adb -s "$dev" reverse tcp:4318 tcp:4318 2>/dev/null || true
    done
  fi
}

start_jaeger() {
  ensure_installed
  mkdir -p "$DATA_DIR/keys" "$DATA_DIR/values" "$LOG_DIR"
  setup_adb_ports

  if pgrep -f "jaeger-all-in-one" >/dev/null; then
    PID=$(pgrep -f "jaeger-all-in-one" | head -n 1)
    echo "✔ Jaeger is already running (PID: $PID)!"
    echo "🌐 Web UI: http://localhost:16686"
    echo "📡 OTLP Receiver: http://localhost:4318/v1/traces"
    echo "💾 Storage: $DATA_DIR"
    echo "📄 Server Logs: $LOG_FILE"
    return 0
  fi

  UI_FLAGS=()
  if [ -f "$UI_CONFIG" ]; then
    UI_FLAGS=(--query.ui-config="$UI_CONFIG")
  fi

  if [[ "$1" == "-fg" || "$1" == "--fg" || "$2" == "-fg" || "$2" == "--fg" ]]; then
    echo "🚀 Starting Jaeger in foreground (Ctrl+C to stop)..."
    echo "🌐 Web UI: http://localhost:16686"
    echo "📡 OTLP Receiver: http://localhost:4318/v1/traces"
    echo "💾 Permanent Storage: $DATA_DIR"
    SPAN_STORAGE_TYPE=badger "$JAEGER_BIN" \
      --badger.ephemeral=false \
      --badger.consistency=true \
      --badger.directory-key="$DATA_DIR/keys" \
      --badger.directory-value="$DATA_DIR/values" \
      --badger.span-store-ttl=876000h \
      "${UI_FLAGS[@]}"
    return 0
  fi

  echo "🚀 Starting Jaeger with permanent disk storage..."
  setsid env SPAN_STORAGE_TYPE=badger "$JAEGER_BIN" \
    --badger.ephemeral=false \
    --badger.consistency=true \
    --badger.directory-key="$DATA_DIR/keys" \
    --badger.directory-value="$DATA_DIR/values" \
    --badger.span-store-ttl=876000h \
    "${UI_FLAGS[@]}" \
    > "$LOG_FILE" 2>&1 &
  PID=$!
  disown $PID 2>/dev/null || true
  sleep 1

  if kill -0 $PID 2>/dev/null; then
    echo "✔ Jaeger started successfully (PID: $PID)!"
    echo "🌐 Web UI: http://localhost:16686"
    echo "📡 OTLP Receiver: http://localhost:4318/v1/traces"
    echo "💾 Permanent Storage: $DATA_DIR"
    echo "📄 Server Logs: $LOG_FILE"
    echo "   (Traces & logs persist forever until deleted with: ./run jaeger clean)"
  else
    echo "❌ Failed to start Jaeger. Check $LOG_FILE:"
    tail -n 20 "$LOG_FILE"
    exit 1
  fi
}

stop_jaeger() {
  if pgrep -f "jaeger-all-in-one" >/dev/null; then
    echo "🛑 Stopping Jaeger gracefully to flush all data to disk..."
    pkill -TERM -f "jaeger-all-in-one" || true
    for i in {1..10}; do
      if ! pgrep -f "jaeger-all-in-one" >/dev/null; then
        break
      fi
      sleep 0.5
    done
    if pgrep -f "jaeger-all-in-one" >/dev/null; then
      echo "⚠️ Force stopping Jaeger..."
      pkill -KILL -f "jaeger-all-in-one" || true
    fi
    echo "✔ Jaeger stopped and data flushed safely to disk."
  else
    echo "ℹ Jaeger is not running."
  fi
}

status_jaeger() {
  if pgrep -f "jaeger-all-in-one" >/dev/null; then
    PID=$(pgrep -f "jaeger-all-in-one" | head -n 1)
    echo "✔ Jaeger is running (PID: $PID)"
    echo "🌐 Web UI: http://localhost:16686"
    echo "📡 OTLP Receiver: http://localhost:4318/v1/traces"
    if [ -d "$DATA_DIR" ]; then
      SIZE=$(du -sh "$DATA_DIR" 2>/dev/null | cut -f1)
      echo "💾 Persistent Storage: $DATA_DIR ($SIZE)"
    fi
  else
    echo "⚪ Jaeger is stopped."
  fi
}

clean_jaeger() {
  if [ ! -d "$DATA_DIR" ]; then
    echo "ℹ No trace data found at $DATA_DIR."
    return 0
  fi

  FORCE=0
  if [[ "$1" == "-f" || "$1" == "--force" ]]; then
    FORCE=1
  fi

  if [ $FORCE -eq 0 ]; then
    read -p "⚠️ Delete all persistent trace data at $DATA_DIR? [y/N]: " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      echo "Operation cancelled."
      return 0
    fi
  fi

  stop_jaeger
  rm -rf "$DATA_DIR"
  echo "✔ Persistent Jaeger trace data purged."
}

export_jaeger() {
  local outfile="${1:-$LOG_DIR/traces_$(date +%Y%m%d_%H%M%S).json}"
  mkdir -p "$LOG_DIR"

  if ! pgrep -f "jaeger-all-in-one" >/dev/null; then
    echo "⚠️ Jaeger is not currently running. Starting it..."
    start_jaeger
    sleep 2
  fi

  echo "📥 Querying all traces from local Jaeger API..."
  curl -s "http://localhost:16686/api/traces?service=expense-tracker-mobile&limit=10000&lookback=4w" > "$outfile"
  echo "✔ Exported traces to: $outfile ($(du -h "$outfile" 2>/dev/null | cut -f1))"
}

show_help() {
  echo "Usage: ./run jaeger [command] [options]"
  echo ""
  echo "Commands:"
  echo "  start       Start Jaeger daemon with permanent disk storage"
  echo "  stop        Stop the running Jaeger daemon"
  echo "  restart     Restart Jaeger daemon"
  echo "  status      Check Jaeger status, ports, and storage size"
  echo "  clean       Purge persistent trace data from disk (-f to skip prompt)"
  echo "  export      Export all traces to a JSON log file in scripts/jaeger/logs/"
  echo ""
  echo "Flags:"
  echo "  --start     Alias for start"
  echo "  --stop      Alias for stop"
  echo "  --restart   Alias for restart"
  echo "  --status    Alias for status"
  echo "  --clean     Alias for clean"
  echo "  --export    Alias for export [output.json]"
  echo "  --help, -h  Show this help message"
}

case "${1:-start}" in
  start|--start)
    start_jaeger
    ;;
  stop|--stop)
    stop_jaeger
    ;;
  restart|--restart)
    stop_jaeger
    start_jaeger
    ;;
  status|--status)
    status_jaeger
    ;;
  clean|--clean)
    clean_jaeger "$2"
    ;;
  export|--export)
    export_jaeger "$2"
    ;;
  --help|-h|help)
    show_help
    ;;
  *)
    echo "Unknown option: $1"
    show_help
    exit 1
    ;;
esac
