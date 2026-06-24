# File QR Decoder V2 Design

## Goal

Create a separate static decoder page and matching JSP artifact for closed-network file transfer by animated QR. The decoder must run locally for testing, deploy cleanly to GitHub Pages, and support the existing attached JSP format while providing a safer v1 format for filenames and validation.

## Architecture

The browser app is a dependency-light static site. QR scanning uses the browser `BarcodeDetector` API, so the page has no CDN dependency and remains suitable for GitHub Pages or local HTTPS-capable browser testing. Protocol parsing and chunk assembly live in small ES modules that can be tested with Node.

The JSP artifact is a single-file closed-network sender. It reads a server-side file path, Base64-encodes the bytes, splits the payload into QR-sized chunks, renders animated QR PNG frames with ZXing, and embeds the raw payload list in the page for local verification.

## Supported Formats

Legacy format from the attached JSP:

```text
FILE:<fileName>:<index>/<total>:<base64Chunk>
```

Improved v1 format:

```text
FILE:v1:<fileNameBase64Url>:<index>:<total>:<base64Chunk>
```

The decoder accepts both. The v1 format is preferred because filenames can contain punctuation without breaking colon-based parsing. Chunk indexes are 1-based, duplicates are ignored, conflicting duplicates are rejected, and chunks from another file group are rejected unless the user resets the collector.

## Components

- `protocol.js`: Parses `FILE:` payloads, validates indexes/totals, tracks chunk collection, assembles Base64, and converts Base64 to bytes.
- `scanner.js`: Wraps `BarcodeDetector` and camera lifecycle.
- `app.js`: Owns UI state, scanner buttons, manual payload input, progress, validation messages, and download trigger.
- `artifacts/file-qr-sender.jsp`: Closed-network JSP sender for server-side files.
- `tests/*.test.mjs`: Node tests for parser, collector, binary reconstruction, and JSP core behavior.

## Error Handling

Invalid payloads display a specific error and do not mutate the collector. Duplicate chunks do not increase progress. Conflicting chunks fail fast so corrupted streams are visible. The decoder refuses to download until all expected chunks are present and Base64 decoding succeeds.

## Testing

Node tests cover parser compatibility, filename-safe v1 parsing, out-of-order collection, duplicate/conflict handling, Base64 byte reconstruction, and extracted JSP core generation. The JSP core is compiled with `javac --release 8` so Java 8 compatibility is checked without requiring a servlet container.

