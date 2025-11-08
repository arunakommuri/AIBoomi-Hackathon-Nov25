# Implementation Plan: Audio and Image Handling for WhatsApp Webhook

## Overview
This plan outlines the implementation of audio note and image processing capabilities in the WhatsApp webhook system. The system will:
1. Process audio notes using Speech-to-Text (STT)
2. Process images using Gemini Vision API
3. Store original media files against created orders/tasks
4. Handle multiple items in a single media input (image/audio/text)

## Architecture

### 1. Media Detection & Download
**Location**: `apps/web/lib/media-handler.ts`

**Responsibilities**:
- Detect media type from Twilio webhook (audio/image)
- Download media files from Twilio Media URLs
- Store media files locally or in cloud storage (S3, Cloud Storage, etc.)
- Return file paths/URLs for database storage

**Twilio Media Fields**:
- `NumMedia`: Number of media items (0, 1, 2, etc.)
- `MediaUrl0`, `MediaUrl1`, etc.: URLs to download media
- `MediaContentType0`, `MediaContentType1`, etc.: MIME types (audio/ogg, image/jpeg, etc.)

### 2. Speech-to-Text (STT) Service
**Location**: `apps/web/lib/stt.ts`

**Provider**: Sarvam.ai STT API
- **API Endpoint**: `https://api.sarvam.ai/speech-to-text`
- **Authentication**: `api-subscription-key` header
- **Supported Formats**: WAV, MP3, AAC, AIFF, OGG, OPUS, FLAC, MP4/M4A, AMR, WMA, WebM, PCM
- **Language Support**: Multiple Indian languages + English with auto-detection
- **API Types**: 
  - Real-Time API: For audio files under 30 seconds (immediate response)
  - Batch API: For longer files (asynchronous processing)

**Implementation**:
- Accept audio file path/URL or Buffer
- Upload to Sarvam.ai API using multipart/form-data
- Return transcribed text from response
- Handle errors gracefully
- Support both real-time and batch processing

**Environment Variables**:
- `SARVAM_AI_API_KEY`: API subscription key from Sarvam.ai dashboard
- `SARVAM_AI_MODEL`: Optional model version (default: "saarika:v2.5")

### 3. Image Analysis with Gemini
**Location**: `apps/web/lib/gemini.ts` (extend existing)

**New Functions**:
- `analyzeImage(imagePath: string): Promise<MessageAnalysis>`
- Extract information from images
- Handle multiple items in a single image
- Return structured data (products, quantities, etc.)

**Gemini Vision API**:
- Use `gemini-1.5-pro-vision` or `gemini-2.0-flash-exp` model
- Pass image as base64 or file path
- Prompt to extract order/task information

### 4. Database Schema Updates
**Location**: `apps/web/lib/db.ts`

**Changes Required**:
```sql
-- Add media_url column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS media_type VARCHAR(50); -- 'audio', 'image', 'text'

-- Add media_url column to orders table  
ALTER TABLE orders ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS media_type VARCHAR(50); -- 'audio', 'image', 'text'

-- Create order_items table for multiple items in a single order
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_name VARCHAR(500) NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5. Webhook Route Updates
**Location**: `apps/web/app/api/webhook/whatsapp/route.ts`

**Flow**:
1. Check `NumMedia` field from Twilio
2. If `NumMedia > 0`:
   - Determine media type (audio/image)
   - Download media file
   - Process based on type:
     - **Audio**: STT → analyze transcribed text → create order/task
     - **Image**: Gemini Vision → extract info → create order/task
   - Store media URL in database
3. If `NumMedia === 0`:
   - Process as text (existing flow)

### 6. Multiple Items Handling
**Location**: `apps/web/lib/gemini.ts` and `apps/web/lib/crud.ts`

**Strategy**:
- Update `analyzeMessage` to return array of items when multiple detected
- Update `createOrder` to accept array of items
- Create single order with multiple order_items
- Apply same logic to text, audio, and image inputs

**Example Response Structure**:
```json
{
  "intent": "create",
  "entityType": "order",
  "parameters": {
    "items": [
      {"productName": "Laptop", "quantity": 2},
      {"productName": "Mouse", "quantity": 5}
    ],
    "fulfillmentDate": "tomorrow"
  }
}
```

## Implementation Steps

### Phase 1: Database & Media Infrastructure
1. ✅ Update database schema to add media_url and media_type columns
2. ✅ Create media-handler.ts for downloading and storing media
3. ✅ Update CRUD operations to handle media URLs

### Phase 2: STT Integration
1. ✅ Choose STT provider (Google Cloud Speech-to-Text recommended)
2. ✅ Create stt.ts service
3. ✅ Add environment variables
4. ✅ Test audio transcription

### Phase 3: Image Processing
1. ✅ Extend Gemini service with vision capabilities
2. ✅ Create analyzeImage function
3. ✅ Test image analysis with sample images

### Phase 4: Webhook Integration
1. ✅ Update webhook route to detect media
2. ✅ Integrate STT for audio
3. ✅ Integrate Gemini Vision for images
4. ✅ Store media URLs in database

### Phase 5: Multiple Items Support
1. ✅ Update analyzeMessage to detect multiple items
2. ✅ Update createOrder to handle item arrays
3. ✅ Create order_items table and CRUD operations
4. ✅ Test with multi-item scenarios

## File Structure

```
apps/web/
├── lib/
│   ├── media-handler.ts      # NEW: Media download and storage
│   ├── stt.ts                 # NEW: Speech-to-Text service
│   ├── gemini.ts              # UPDATE: Add image analysis
│   ├── crud.ts                # UPDATE: Support multiple items
│   └── db.ts                  # UPDATE: Schema changes
├── app/api/webhook/whatsapp/
│   └── route.ts               # UPDATE: Media handling logic
└── env.example                # UPDATE: Add STT API keys
```

## Environment Variables

```env
# Existing
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash-lite-001

# New - STT (Sarvam.ai)
SARVAM_AI_API_KEY=...            # Sarvam.ai API subscription key
SARVAM_AI_MODEL=saarika:v2.5     # Optional: Model version

# Media Storage (optional - for cloud storage)
AWS_S3_BUCKET=...                # If storing in S3
GOOGLE_CLOUD_STORAGE_BUCKET=... # If storing in GCS
```

## Error Handling

1. **Media Download Failures**: Log error, respond with helpful message
2. **STT Failures**: Fallback to asking user to type the message
3. **Image Analysis Failures**: Ask user to describe the image or try again
4. **Multiple Items Parsing**: If unclear, ask user to confirm items

## Testing Strategy

1. **Unit Tests**:
   - Media download functionality
   - STT transcription
   - Image analysis
   - Multiple items parsing

2. **Integration Tests**:
   - End-to-end audio note processing
   - End-to-end image processing
   - Multiple items in single order

3. **Manual Testing**:
   - Send audio note via WhatsApp
   - Send image via WhatsApp
   - Send image with multiple items
   - Verify media URLs stored in database

## Considerations

1. **Media Storage**: 
   - Option 1: Store locally (simple, but limited scalability)
   - Option 2: Store in cloud storage (S3, GCS) - recommended for production

2. **Audio Format**: 
   - WhatsApp audio is typically OGG Opus format
   - May need conversion depending on STT provider requirements

3. **Image Size Limits**: 
   - WhatsApp images can be large
   - Consider resizing/compression before processing

4. **Cost Optimization**:
   - Cache STT results for same audio
   - Optimize image size before Gemini processing
   - Batch multiple items in single API call when possible

5. **Security**:
   - Validate media URLs from Twilio
   - Sanitize file paths
   - Set appropriate file size limits

## Next Steps

1. Review and approve this plan
2. Choose STT provider
3. Decide on media storage strategy
4. Begin Phase 1 implementation

