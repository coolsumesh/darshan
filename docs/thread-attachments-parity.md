# Threads Attachments Parity (Media / Files / Voice)

## API contract

### 1) Upload attachment
`POST /api/v1/threads/:thread_id/attachments/upload` (multipart/form-data)

- Field: `file`
- Max size: **10 MB**
- Allowed MIME:
  - Images: jpeg/png/webp/gif
  - Video: mp4/webm/quicktime
  - Audio: mpeg/mp4/ogg/webm/wav
  - Files: pdf/txt/zip/docx

Response:

```json
{
  "ok": true,
  "attachment": {
    "type": "image|video|audio|file",
    "mime": "image/png",
    "size": 12345,
    "url": "/uploads/thread-attachments/<stored-file>",
    "filename": "photo.png",
    "duration": null
  }
}
```

### 2) Send message with or without text
`POST /api/v1/threads/:thread_id/messages`

Body:

```json
{
  "body": "optional text",
  "attachments": [
    {
      "type": "audio",
      "mime": "audio/ogg",
      "size": 88431,
      "url": "/uploads/thread-attachments/....ogg",
      "filename": "voice-note.ogg",
      "duration": null
    }
  ]
}
```

Validation:
- Must include at least one of: `body` or `attachments`
- Max 8 attachments per message

## Storage/schema

- New DB column: `thread_messages.attachments jsonb NOT NULL DEFAULT []`
- Files are stored under: `apps/api/uploads/thread-attachments/`
- Static serving path: `/uploads/thread-attachments/...`

## UI behavior

Threads composer now supports:
- Attach button (paperclip)
- Upload before send
- Send text-only, attachment-only, or mixed messages
- Remove queued attachments before sending

Message bubble now shows attachment blocks with safe open/download link.
