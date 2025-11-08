#!/bin/bash

# Wrapper script to manage cron lifecycle with Next.js server
# Sets up cron on startup and removes it on exit

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Function to cleanup cron on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down... Removing cron job..."
    node "$SCRIPT_DIR/cron-manager.js" remove
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT EXIT

# Set up cron on startup
echo "🚀 Starting server with cron management..."
node "$SCRIPT_DIR/cron-manager.js" setup

# Start Next.js server and capture its PID
# Use npx next directly to avoid workspace issues
if [ "$1" = "dev" ]; then
    echo "📦 Starting Next.js development server..."
    cd "$WEB_DIR"
    npx next dev "${@:2}" &
    SERVER_PID=$!
elif [ "$1" = "start" ]; then
    echo "📦 Starting Next.js production server..."
    cd "$WEB_DIR"
    npx next start "${@:2}" &
    SERVER_PID=$!
else
    echo "Usage: $0 [dev|start] [additional npm args...]"
    exit 1
fi

# Wait for server process - when it exits, cleanup will be triggered
wait $SERVER_PID
EXIT_CODE=$?

# Cleanup will be called by trap, but ensure it runs
cleanup
exit $EXIT_CODE

