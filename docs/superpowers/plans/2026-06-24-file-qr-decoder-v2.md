# File QR Decoder V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate static file QR decoder and matching JSP sender for closed-network animated QR file transfer.

**Architecture:** Keep the browser app dependency-light and split protocol parsing from UI/scanner code. The JSP sender exposes a testable Java core between `BEGIN TESTABLE CORE` and `END TESTABLE CORE` so Node can compile and verify it with `javac`.

**Tech Stack:** Static HTML/CSS/ES modules, Browser `BarcodeDetector`, Node `node:test`, Java 8-compatible JSP core, ZXing imports in the JSP artifact.

---

### Task 1: Repository Skeleton And Failing Tests

**Files:**
- Create: `package.json`
- Create: `tests/protocol.test.mjs`
- Create: `tests/jsp-generator.test.mjs`

- [ ] **Step 1: Add test runner and failing protocol/JSP tests**

Create `package.json` with:

```json
{
  "name": "decoder-page-2",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "dev": "npx --yes http-server . -a 127.0.0.1 -p 4173 -c-1"
  }
}
```

Create `tests/protocol.test.mjs` with tests that import `../protocol.js`, parse legacy and v1 `FILE:` payloads, collect chunks out of order, reject conflicting duplicates, and reconstruct bytes.

Create `tests/jsp-generator.test.mjs` with a test that extracts the JSP core from `artifacts/file-qr-sender.jsp`, compiles it with `javac --release 8`, and verifies both legacy and v1 payload generation.

- [ ] **Step 2: Verify RED**

Run: `npm test`

Expected: FAIL because `protocol.js` and `artifacts/file-qr-sender.jsp` do not exist yet.

### Task 2: Protocol Core

**Files:**
- Create: `protocol.js`
- Test: `tests/protocol.test.mjs`

- [ ] **Step 1: Implement protocol core**

Add exported functions:

```js
parseQrPayload(value)
createFileCollector()
addFileChunk(collector, payload)
isFileCollectorComplete(collector)
getReceivedIndexes(collector)
getMissingIndexes(collector)
assembleFileBase64(collector)
base64ToBytes(value)
base64UrlToText(value)
textToBase64Url(value)
```

The parser must accept both `FILE:<name>:<index>/<total>:<chunk>` and `FILE:v1:<filenameBase64Url>:<index>:<total>:<chunk>`.

- [ ] **Step 2: Verify GREEN**

Run: `npm test tests/protocol.test.mjs`

Expected: PASS.

### Task 3: Static Decoder UI

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `scanner.js`
- Create: `app.js`

- [ ] **Step 1: Build the browser app**

Create a first-screen scanner workspace with camera preview, manual input, progress meter, received/missing chunk status, reset, stop scan, and download controls. UI code must call the tested protocol functions rather than re-parsing payload strings.

- [ ] **Step 2: Smoke-check static module loading**

Run: `npm test`

Expected: Existing Node tests still PASS.

### Task 4: JSP Sender Artifact

**Files:**
- Create: `artifacts/file-qr-sender.jsp`
- Test: `tests/jsp-generator.test.mjs`

- [ ] **Step 1: Implement JSP core and page**

Create Java 8-compatible helpers:

```java
static class FileQrPayload
public static List<FileQrPayload> buildFilePayloads(...)
public static String textBase64Url(...)
public static String escapeHtml(...)
public static String createQrPngBase64(...)
```

The page must read `filePath`, validate the file exists and is below limits, generate `FILE:v1:` chunks by default, and animate generated QR frames with pause/reset controls.

- [ ] **Step 2: Verify GREEN**

Run: `npm test tests/jsp-generator.test.mjs`

Expected: PASS, including `javac --release 8`.

### Task 5: Documentation And Final Verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Document local testing and closed-network deployment notes**

Document:

```text
npm test
npm run dev
```

Also document JSP ZXing dependency, supported formats, and browser requirements.

- [ ] **Step 2: Run final verification**

Run: `npm test`

Expected: PASS for all tests.

