# Media Storage Documentation

## Overview
This document describes how media files (audio notes and images) and their extracted text are stored in the database.

## Database Schema

The `messages` table stores comprehensive information about each message, including media files and extracted text:

```sql
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  message_sid VARCHAR(255) UNIQUE,
  from_number VARCHAR(255),
  body TEXT,                          -- Processed text (transcribed/extracted or original)
  original_body TEXT,                 -- Original text body if it was a text message
  extracted_text TEXT,                -- Transcribed text from audio or extracted text from image
  media_url TEXT,                      -- Twilio media URL
  media_type VARCHAR(50),             -- 'audio', 'image', or 'text'
  media_content_type VARCHAR(100),     -- MIME type (e.g., 'audio/ogg', 'image/jpeg')
  media_data BYTEA,                    -- Binary data of the media file
  referred_message_sid VARCHAR(255),
  context JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Storage Details

### For Audio Messages (Voice Notes)

When a user sends a voice note:
1. **Media Detection**: System detects audio media from Twilio webhook
2. **Download**: Audio file is downloaded from Twilio
3. **Transcription**: Audio is transcribed using Sarvam.ai STT
4. **Storage**: All information is stored:
   - `media_url`: Twilio URL to the audio file
   - `media_type`: `'audio'`
   - `media_content_type`: MIME type (e.g., `'audio/ogg'`, `'audio/opus'`)
   - `media_data`: Binary data of the audio file (BYTEA)
   - `extracted_text`: Transcribed text from the audio
   - `body`: Same as `extracted_text` (used for processing)
   - `original_body`: `null` (no original text message)

### For Image Messages

When a user sends an image (future implementation):
1. **Media Detection**: System detects image media from Twilio webhook
2. **Download**: Image file is downloaded from Twilio
3. **Extraction**: Information is extracted using Gemini Vision API
4. **Storage**: All information is stored:
   - `media_url`: Twilio URL to the image file
   - `media_type`: `'image'`
   - `media_content_type`: MIME type (e.g., `'image/jpeg'`, `'image/png'`)
   - `media_data`: Binary data of the image file (BYTEA)
   - `extracted_text`: Extracted text/information from the image
   - `body`: Same as `extracted_text` (used for processing)
   - `original_body`: `null` (no original text message)

### For Text Messages

When a user sends a text message:
1. **No Media**: No media files are involved
2. **Storage**: Text information is stored:
   - `media_url`: `null`
   - `media_type`: `'text'`
   - `media_content_type`: `null`
   - `media_data`: `null`
   - `extracted_text`: `null`
   - `body`: Original text message
   - `original_body`: Same as `body`

## Data Flow

```
User sends message (text/audio/image)
    ↓
Webhook receives message
    ↓
If media detected:
  - Download media file
  - Process media (STT for audio, Gemini Vision for image)
  - Extract text
    ↓
Store in database:
  - media_url (Twilio URL)
  - media_type ('audio'/'image'/'text')
  - media_content_type (MIME type)
  - media_data (binary file data)
  - extracted_text (transcribed/extracted text)
  - body (processed text for analysis)
  - original_body (original text if any)
    ↓
Process extracted text through existing flow
```

## Retrieving Stored Data

### Get Message with Media Information

```typescript
import { MessageService } from '@/lib/services/message-service';

// Get message by SID
const message = await MessageService.getMessageBySid(messageSid, fromNumber);

// Get all messages with media for a user
const messages = await MessageService.getMessagesWithMedia(fromNumber, 50);

// Get media file data
const mediaData = await MessageService.getMediaData(messageSid);
```

### Example Message Object

```json
{
  "id": 1,
  "message_sid": "SM1234567890",
  "from_number": "whatsapp:+1234567890",
  "body": "I need to order 5 laptops tomorrow",
  "extracted_text": "I need to order 5 laptops tomorrow",
  "original_body": null,
  "media_url": "https://api.twilio.com/2010-04-01/Accounts/.../Media/ME123",
  "media_type": "audio",
  "media_content_type": "audio/ogg",
  "has_media_data": true,
  "created_at": "2024-01-15T10:30:00Z"
}
```

## Benefits

1. **Complete History**: All media files and extracted text are retained
2. **Audit Trail**: Original media files are preserved for reference
3. **Reprocessing**: Can re-process media files if needed
4. **Analytics**: Can analyze patterns in media usage
5. **Debugging**: Can review original media if transcription/extraction issues occur

## Storage Considerations

- **Media Data Size**: BYTEA column can store large binary files
- **Performance**: Consider indexing `from_number` and `created_at` for faster queries
- **Backup**: Ensure media data is included in database backups
- **Retention**: Consider archiving old media files to reduce database size if needed

## Future Enhancements

1. **Cloud Storage**: Option to store media files in S3/GCS and store only URLs
2. **Compression**: Compress media files before storage
3. **Thumbnails**: Generate thumbnails for images
4. **Media Cleanup**: Automatic cleanup of old media files

