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

# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Replace the Twilio credentials with your actual values:
- `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token
- `TWILIO_WHATSAPP_FROM`: Your Twilio WhatsApp number (format: `whatsapp:+1234567890`)

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
- ✅ Automatic message storage in database
- ✅ Simple "Hi" response to all incoming messages

### How It Works

1. When a user sends a WhatsApp message to your Twilio number, Twilio sends a POST request to your webhook endpoint
2. The webhook receives the message and stores it in the PostgreSQL database
3. The bot responds with "Hi" message
4. The response is sent back via Twilio's WhatsApp API

## API Endpoints

### POST `/api/webhook/whatsapp`

Twilio webhook endpoint that receives incoming WhatsApp messages.

**Request:** Form data from Twilio containing:
- `From`: Sender's WhatsApp number
- `Body`: Message content
- `MessageSid`: Unique message identifier

**Response:** TwiML XML response with the bot's reply

## Database Schema

The application automatically creates a `messages` table with the following structure:

```sql
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  message_sid VARCHAR(255) UNIQUE,
  from_number VARCHAR(255),
  body TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Next Steps

- [ ] Add conversation state management
- [ ] Implement more sophisticated message handling
- [ ] Add user authentication/identification
- [ ] Create admin dashboard
- [ ] Add message history viewing
- [ ] Implement AI/ML integration for intelligent responses

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
