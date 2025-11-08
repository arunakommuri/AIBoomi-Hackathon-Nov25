#!/bin/bash

# Script to set up order reminder cron job based on ORDER_REMINDER_INTERVAL_MINUTES env variable
# This script reads the interval from .env.local and sets up the cron job accordingly

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$WEB_DIR/.env.local"

# Default to 360 minutes (6 hours) if not set
DEFAULT_INTERVAL=360

# Read ORDER_REMINDER_INTERVAL_MINUTES from .env.local
if [ -f "$ENV_FILE" ]; then
    INTERVAL=$(grep "^ORDER_REMINDER_INTERVAL_MINUTES=" "$ENV_FILE" | cut -d '=' -f2 | tr -d ' ' || echo "$DEFAULT_INTERVAL")
else
    INTERVAL="$DEFAULT_INTERVAL"
fi

# Convert to integer (remove any non-numeric characters)
INTERVAL=$(echo "$INTERVAL" | sed 's/[^0-9]//g')
if [ -z "$INTERVAL" ] || [ "$INTERVAL" -le 0 ]; then
    INTERVAL="$DEFAULT_INTERVAL"
fi

echo "📅 Setting up order reminder cron with interval: $INTERVAL minutes"

# Calculate cron schedule based on interval in minutes
if [ "$INTERVAL" -lt 60 ]; then
    # Less than 1 hour: run every X minutes
    CRON_SCHEDULE="*/$INTERVAL * * * *"
    echo "   Schedule: Every $INTERVAL minutes"
elif [ "$INTERVAL" -eq 60 ]; then
    # Exactly 1 hour: run at the top of every hour
    CRON_SCHEDULE="0 * * * *"
    echo "   Schedule: Every hour (at :00)"
elif [ $((INTERVAL % 60)) -eq 0 ]; then
    # Multiple of 60: run every X hours
    HOURS=$((INTERVAL / 60))
    CRON_SCHEDULE="0 */$HOURS * * *"
    echo "   Schedule: Every $HOURS hour(s) (at :00)"
else
    # Not a multiple of 60: use minutes (e.g., 90 minutes = every 90 minutes)
    CRON_SCHEDULE="*/$INTERVAL * * * *"
    echo "   Schedule: Every $INTERVAL minutes"
fi

# Get the API URL
API_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
ENDPOINT="$API_URL/api/cron/order-reminders"

# Get current crontab (excluding any existing order-reminders entries)
CURRENT_CRON=$(crontab -l 2>/dev/null | grep -v "order-reminders" | grep -v "^#" | grep -v "^$" || echo "")

# Create new crontab entry
CRON_ENTRY="# Order Reminder Cron - runs every $INTERVAL minutes (from ORDER_REMINDER_INTERVAL_MINUTES)"
CRON_ENTRY="$CRON_ENTRY
$CRON_SCHEDULE /usr/bin/curl -X GET '$ENDPOINT' -H 'Content-Type: application/json' >> /tmp/order-reminder.log 2>&1"

# Combine existing crontab with new entry
if [ -n "$CURRENT_CRON" ]; then
    NEW_CRON="$CURRENT_CRON

$CRON_ENTRY"
else
    NEW_CRON="$CRON_ENTRY"
fi

# Install new crontab
echo "$NEW_CRON" | crontab -

echo "✅ Cron job installed successfully!"
echo ""
echo "Current crontab:"
crontab -l | grep -A 1 "order-reminders"

