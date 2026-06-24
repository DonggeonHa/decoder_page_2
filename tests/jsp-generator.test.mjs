import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  addFileChunk,
  assembleFileBytes,
  createFileCollector,
  parseQrPayload
} from "../protocol.js";

const jspPath = resolve("artifacts/file-qr-sender.jsp");

test("JSP sender is FILE:V2 Base45 and reads the typed file path directly", () => {
  assert.equal(existsSync(jspPath), true, "expected JSP sender artifact to exist");

  const jsp = readFileSync(jspPath, "utf8");

  assert.match(jsp, /buildFileV2Payload/);
  assert.match(jsp, /FILE:V2:/);
  assert.match(jsp, /BASE45_CHARSET/);
  assert.match(jsp, /base45Encode/);
  assert.match(jsp, /new File\(filePath\)/);
  assert.match(jsp, /Files\.readAllBytes/);
  assert.match(jsp, /static final int QR_IMAGE_SIZE = 640/);
  assert.match(jsp, /static final int MAX_QR_TEXT_CHARS = 4296/);
  assert.match(jsp, /calculateFileChunkBytes/);
  assert.match(jsp, /parseRequestedIndexes/);
  assert.match(jsp, /name="sendMode"/);
  assert.match(jsp, /name="missingRanges"/);
  assert.match(jsp, /name="densityMode"/);
  assert.match(jsp, /name="frameDelayMs"/);
  assert.match(jsp, /qrFrameLabels/);
  assert.match(jsp, /ErrorCorrectionLevel\.L/);

  assert.doesNotMatch(jsp, /FILE legacy|USE_FILE_V1_FORMAT|name="format"|request\.getParameter\("format"\)/);
  assert.doesNotMatch(jsp, /MAX_FILE_BYTES|MAX_QR_COUNT|validateFileSize/);
  assert.doesNotMatch(jsp, /resolveAllowedFile|FILE_QR_BASE_DIR|fileQr\.baseDir|allowedBaseDir/);
  assert.doesNotMatch(jsp, /qrPayloadTexts|payload 확인|payload-text|<textarea|<details/);
});

test("JSP FILE:V2 payload shape is accepted by the decoder protocol", () => {
  const data = new TextEncoder().encode("sender to decoder \ud55c\uad6d");
  const name = encodeBase45(new TextEncoder().encode("interop:final.pptx"));
  const chunk = encodeBase45(data);

  const payloadText = `FILE:V2:${name.length}:${name}:1:1:${chunk}`;
  const parsed = parseQrPayload(payloadText);
  const collector = createFileCollector();
  const result = addFileChunk(collector, parsed);

  assert.equal(parsed.type, "file-chunk");
  assert.equal(parsed.format, "v2");
  assert.equal(parsed.encoding, "base45");
  assert.equal(parsed.fileName, "interop:final.pptx");
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(assembleFileBytes(collector)), Array.from(data));
});

function encodeBase45(bytes) {
  const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
  let output = "";
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      let value = bytes[i] * 256 + bytes[i + 1];
      output += charset[value % 45];
      value = Math.floor(value / 45);
      output += charset[value % 45];
      value = Math.floor(value / 45);
      output += charset[value];
    } else {
      let value = bytes[i];
      output += charset[value % 45];
      value = Math.floor(value / 45);
      output += charset[value];
    }
  }
  return output;
}
