# AIBoomi-Hackathon-Nov25

A Next.js monorepo project with WhatsApp integration using Twilio and PostgreSQL database.

## Project Structure

```
.
├── apps/
│   └── web/              # Next.js application
│       ├── app/          # Next.js App Router
│       │   ├── api/      # API routes
│       │   └── ...
│       └── lib/          # Utility libraries
├── packages/             # Shared packages (future)
└── package.json          # Root workspace configuration
```

## Prerequisites

- Node.js 18+ installed
- Docker installed (for PostgreSQL)
- Twilio account with WhatsApp enabled
- Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))
- npm or yarn package manager

## Setup Instructions

### 1. Start PostgreSQL Database

Run the PostgreSQL Docker container:

```bash
docker run --name postgresDB \
  -e POSTGRES_PASSWORD=aiBhoomiHack81125 \
  -e POSTGRES_USER=aibhoomi \
  -e POSTGRES_DB=weavers \
  -v ~/postgres-data:/var/lib/postgresql/data \
  -p 5433:5432 \
  -d postgres
```

**Note:** The port mapping should be `5433:5432` (not `5433:5433`) as PostgreSQL runs on port 5432 inside the container.

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the `apps/web/` directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5433
DB_NAME=weavers
DB_USER=aibhoomi
DB_PASSWORD=aiBhoomiHack81125

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Gemini LLM Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Order Reminder Configuration
ORDER_REMINDER_INTERVAL_MINUTES=360

# Cron Job Security (optional)
CRON_SECRET_TOKEN=your_secret_token_here
```

Replace the credentials with your actual values:
- `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token
- `TWILIO_WHATSAPP_FROM`: Your Twilio WhatsApp number (format: `whatsapp:+1234567890`)
- `GEMINI_API_KEY`: Your Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))

### 4. Run the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### 5. Configure Twilio Webhook

1. Go to your Twilio Console
2. Navigate to your WhatsApp Sandbox or WhatsApp number settings
3. Set the webhook URL to: `https://your-domain.com/api/webhook/whatsapp`
   - For local development, use a tool like [ngrok](https://ngrok.com/) to expose your local server:
     ```bash
     ngrok http 3000
     ```
   - Then use the ngrok URL: `https://your-ngrok-url.ngrok.io/api/webhook/whatsapp`

## Features

### Current Implementation

- ✅ WhatsApp webhook endpoint at `/api/webhook/whatsapp`
- ✅ PostgreSQL database connection
- ✅ Google Gemini LLM integration for message analysis
- ✅ Automatic message storage in database
- ✅ Intelligent CRUD operations for Tasks/Reminders and Orders/Products
- ✅ Natural language understanding and response generation
- ✅ Automated pending order reminders (configurable interval)

### How It Works

1. When a user sends a WhatsApp message to your Twilio number, Twilio sends a POST request to your webhook endpoint
2. The webhook receives the message and stores it in the PostgreSQL database
3. The message is analyzed using Google Gemini LLM to extract:
   - **Intent**: create, get, update, or unknown
   - **Entity Type**: task, reminder, order, or product
   - **Parameters**: relevant data like task title, due date, order ID, etc.
4. Based on the analysis, the system performs the appropriate database operation:
   - **Create**: Creates new tasks or orders
   - **Get**: Retrieves and lists user's tasks or orders
   - **Update**: Updates existing tasks or orders
5. A natural language response is generated and sent back via Twilio's WhatsApp API

### Supported Commands

**Tasks/Reminders:**
- Create: "Create a task to buy groceries tomorrow"
- View: "Show my tasks" or "List my reminders"
- Update: "Mark task 1 as completed" or "Update task 2 to completed"

**Orders/Products:**
- Create: "Create an order for 5 laptops"
- View: "Show my orders" or "List my products"
- Update: "Update order #123 to completed" or "Change order ORD-123 status to processing"

## API Endpoints

### POST `/api/webhook/whatsapp`

Twilio webhook endpoint that receives incoming WhatsApp messages.

**Request:** Form data from Twilio containing:
- `From`: Sender's WhatsApp number
- `Body`: Message content
- `MessageSid`: Unique message identifier

**Response:** TwiML XML response with the bot's reply

### GET/POST `/api/cron/order-reminders`

Cron job endpoint for sending pending order reminders to users.

**Authentication:** Optional - set `CRON_SECRET_TOKEN` environment variable and include it in the request:
- Header: `Authorization: Bearer <token>` or
- Query parameter: `?token=<token>`

**Response:** JSON with success status and statistics:
```json
{
  "success": true,
  "message": "Order reminders sent",
  "stats": {
    "successCount": 5,
    "errorCount": 0,
    "totalUsers": 5,
    "duration": "1234ms"
  }
}
```

**Setup:**
1. Set `ORDER_REMINDER_INTERVAL_MINUTES` in your `.env.local` file (default: 360 minutes = 6 hours)
2. Run the setup script to configure the cron job based on the environment variable:
   ```bash
   cd apps/web
   bash scripts/setup-order-reminder-cron.sh
   ```
   This script will:
   - Read `ORDER_REMINDER_INTERVAL_MINUTES` from `.env.local`
   - Remove any existing order-reminder cron jobs
   - Set up a new cron job with the correct schedule
3. (Optional) Set `CRON_SECRET_TOKEN` for security

**Note:** The cron schedule is automatically calculated from `ORDER_REMINDER_INTERVAL_MINUTES`:
- Less than 60 minutes: Runs every X minutes (e.g., `*/30 * * * *` for 30 minutes)
- Exactly 60 minutes: Runs every hour at :00 (e.g., `0 * * * *`)
- Multiple of 60: Runs every X hours at :00 (e.g., `0 */6 * * *` for 6 hours)
- Other values: Runs every X minutes (e.g., `*/90 * * * *` for 90 minutes)

**Example cron schedules:**
- Every 6 hours (360 minutes): `0 */6 * * *` (runs at 00:00, 06:00, 12:00, 18:00)
- Every 12 hours (720 minutes): `0 */12 * * *` (runs at 00:00, 12:00)
- Every 4 hours (240 minutes): `0 */4 * * *`
- Every 30 minutes: `*/30 * * * *` (runs every 30 minutes)
- Every 1 hour (60 minutes): `0 * * * *` (runs at the top of every hour)
- Every 15 minutes: `*/15 * * * *` (runs every 15 minutes)

**For Vercel deployments:**
Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/order-reminders",
    "schedule": "0 */6 * * *"
  }]
}
```

**For other platforms:**
Use external cron services like:
- [cron-job.org](https://cron-job.org/)
- [EasyCron](https://www.easycron.com/)
- GitHub Actions scheduled workflows
- Your server's cron daemon

## Database Schema

The application automatically creates the following tables:

**Messages Table:**
```sql
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  message_sid VARCHAR(255) UNIQUE,
  from_number VARCHAR(255),
  body TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Tasks Table:**
```sql
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  user_number VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  due_date TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Orders Table:**
```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_number VARCHAR(255) NOT NULL,
  order_id VARCHAR(255) UNIQUE,
  product_name VARCHAR(500) NOT NULL,
  quantity INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Next Steps

- [x] Implement AI/ML integration for intelligent responses (Gemini LLM)
- [x] Add CRUD operations for tasks and orders
- [ ] Add conversation state management
- [ ] Add user authentication/identification
- [ ] Create admin dashboard
- [ ] Add message history viewing
- [ ] Add support for deleting tasks and orders

## Troubleshooting

### Database Connection Issues

- Ensure PostgreSQL container is running: `docker ps`
- Check if port 5433 is available and not in use
- Verify database credentials in `.env.local`

### Twilio Webhook Issues

- Ensure your webhook URL is publicly accessible (use ngrok for local development)
- Check Twilio console for webhook delivery logs
- Verify your Twilio credentials are correct

### Port Conflicts

If port 3000 is in use, Next.js will automatically use the next available port.

### Gemini API Issues

- Ensure your `GEMINI_API_KEY` is set correctly in `.env.local`
- Check that you have API quota available in your Google Cloud Console
- Verify the API key has access to Gemini Pro model
- If you see "API key not valid" errors, regenerate your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
