#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$DIR")"
JAEGER_BIN="$DIR/jaeger/jaeger-all-in-one"

if [ ! -f "$JAEGER_BIN" ]; then
  echo "📥 Jaeger binary not found. Downloading Jaeger v1.60.0..."
  mkdir -p "$DIR/jaeger"
  cd "$DIR/jaeger"
  wget -q https://github.com/jaegertracing/jaeger/releases/download/v1.60.0/jaeger-1.60.0-linux-amd64.tar.gz
  tar -xzf jaeger-1.60.0-linux-amd64.tar.gz --strip-components=1
  rm jaeger-1.60.0-linux-amd64.tar.gz
  cd "$PROJECT_ROOT"
fi

# Reverse port 4318 for any connected Android devices so physical phones can send traces to localhost:4318
if which adb >/dev/null 2>&1; then
  devices=$(adb devices | grep -w "device" | awk '{print $1}')
  for dev in $devices; do
    adb -s "$dev" reverse tcp:4318 tcp:4318 2>/dev/null || true
  done
fi

if pgrep -f "jaeger-all-in-one" >/dev/null; then
  echo "✔ Jaeger is already running!"
  echo "🌐 Open Jaeger Web UI: http://localhost:16686"
  echo "📡 OTLP HTTP Receiver: http://localhost:4318/v1/traces"
  exit 0
fi

echo "🚀 Starting Jaeger in background..."
nohup "$JAEGER_BIN" > /tmp/jaeger.log 2>&1 &
sleep 1

echo "✔ Jaeger is now running!"
echo "🌐 Open Jaeger Web UI: http://localhost:16686"
echo "📡 OTLP HTTP Receiver: http://localhost:4318/v1/traces"
