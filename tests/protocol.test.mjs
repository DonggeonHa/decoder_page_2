import test from "node:test";
import assert from "node:assert/strict";
import * as protocol from "../protocol.js";
import {
  addFileChunk,
  assembleFileBase64,
  base64ToBytes,
  createFileCollector,
  formatIndexRanges,
  getMissingIndexes,
  parseQrPayload,
  textToBase64Url
} from "../protocol.js";

const BASE45_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

function testBase45EncodeBytes(bytes) {
  let output = "";
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      let value = bytes[i] * 256 + bytes[i + 1];
      output += BASE45_CHARSET[value % 45];
      value = Math.floor(value / 45);
      output += BASE45_CHARSET[value % 45];
      value = Math.floor(value / 45);
      output += BASE45_CHARSET[value];
    } else {
      let value = bytes[i];
      output += BASE45_CHARSET[value % 45];
      value = Math.floor(value / 45);
      output += BASE45_CHARSET[value];
    }
  }
  return output;
}

function testBase45EncodeText(value) {
  return testBase45EncodeBytes(new TextEncoder().encode(value));
}

test("parses attached legacy FILE payload", () => {
  assert.deepEqual(parseQrPayload("FILE:sample.bin:2/4:QUJD"), {
    type: "file-chunk",
    format: "legacy",
    encoding: "base64",
    fileName: "sample.bin",
    fileId: "legacy:sample.bin:4",
    index: 2,
    total: 4,
    chunk: "QUJD"
  });
});

test("parses v1 FILE payload with colon-safe filename", () => {
  const encodedName = textToBase64Url("report:final.bin");

  assert.deepEqual(parseQrPayload(`FILE:v1:${encodedName}:3:5:REVG`), {
    type: "file-chunk",
    format: "v1",
    encoding: "base64",
    fileName: "report:final.bin",
    fileId: `v1:${encodedName}:5`,
    index: 3,
    total: 5,
    chunk: "REVG"
  });
});

test("parses V2 Base45 FILE payload with length-delimited filename", () => {
  const encodedName = testBase45EncodeText("report:final.pptx");
  const encodedChunk = testBase45EncodeBytes(new Uint8Array([0, 1, 2, 3, 32, 58, 255]));
  const payload = `FILE:V2:${encodedName.length}:${encodedName}:2:4:${encodedChunk}`;

  assert.deepEqual(parseQrPayload(payload), {
    type: "file-chunk",
    format: "v2",
    encoding: "base45",
    fileName: "report:final.pptx",
    fileId: `v2:${encodedName.length}:${encodedName}:4`,
    index: 2,
    total: 4,
    chunk: encodedChunk
  });
});

test("rejects malformed FILE payloads", () => {
  assert.equal(parseQrPayload("FILE:bad.txt:3/2:AAA").type, "invalid");
  assert.equal(parseQrPayload("FILE:v1:not-base64*:1:2:AAA").type, "invalid");
  assert.equal(parseQrPayload("FILE:v1:bmFtZQ:0:2:AAA").type, "invalid");
  assert.equal(parseQrPayload("FILE:V2:3:AB:1:1:BB8").type, "invalid");
  assert.equal(parseQrPayload("FILE:V2:3:ABC:1:1:not_base45").type, "invalid");
  assert.equal(parseQrPayload("FILE:bad.txt:1/1:not@@@").type, "invalid");
  assert.equal(parseQrPayload("FILE:bad.txt:1/2:SGV=").type, "invalid");
  assert.equal(parseQrPayload("RAW:hello").type, "unsupported");
});

test("collects V2 Base45 chunks and reconstructs bytes", () => {
  const data = new TextEncoder().encode("Base45 transfer 한국");
  const name = testBase45EncodeText("deck:final.pptx");
  const firstBytes = data.slice(0, 8);
  const secondBytes = data.slice(8);
  const first = testBase45EncodeBytes(firstBytes);
  const second = testBase45EncodeBytes(secondBytes);
  const collector = createFileCollector();

  assert.equal(addFileChunk(collector, parseQrPayload(`FILE:V2:${name.length}:${name}:2:2:${second}`)).ok, true);
  const done = addFileChunk(collector, parseQrPayload(`FILE:V2:${name.length}:${name}:1:2:${first}`));

  assert.equal(done.complete, true);
  assert.equal(typeof protocol.assembleFileBytes, "function");
  assert.deepEqual(Array.from(protocol.assembleFileBytes(collector)), Array.from(data));
});

test("collects file chunks out of order and assembles base64", () => {
  const collector = createFileCollector();
  const chunks = [
    parseQrPayload("FILE:file.txt:2/3:REVG"),
    parseQrPayload("FILE:file.txt:1/3:QUJD"),
    parseQrPayload("FILE:file.txt:3/3:R0g=")
  ];

  assert.equal(addFileChunk(collector, chunks[0]).complete, false);
  assert.deepEqual(getMissingIndexes(collector), [1, 3]);
  assert.equal(addFileChunk(collector, chunks[1]).complete, false);
  const done = addFileChunk(collector, chunks[2]);

  assert.equal(done.complete, true);
  assert.equal(assembleFileBase64(collector), "QUJDREVGR0g=");
});

test("ignores exact duplicates and rejects conflicting duplicates", () => {
  const collector = createFileCollector();
  const first = parseQrPayload("FILE:file.txt:1/2:QUJD");
  const same = parseQrPayload("FILE:file.txt:1/2:QUJD");
  const conflict = parseQrPayload("FILE:file.txt:1/2:REVG");

  assert.equal(addFileChunk(collector, first).ok, true);
  assert.equal(addFileChunk(collector, same).duplicate, true);

  const result = addFileChunk(collector, conflict);
  assert.equal(result.ok, false);
  assert.match(result.reason, /Conflicting chunk/);
});

test("rejects chunks from a different file group", () => {
  const collector = createFileCollector();

  assert.equal(addFileChunk(collector, parseQrPayload("FILE:a.txt:1/2:QUJD")).ok, true);

  const result = addFileChunk(collector, parseQrPayload("FILE:b.txt:2/2:RA=="));
  assert.equal(result.ok, false);
  assert.match(result.reason, /Different file stream/);
});

test("reconstructs bytes from assembled base64", () => {
  const bytes = base64ToBytes("SGVsbG8sIO2VnOq1rQ==");
  const text = new TextDecoder("utf-8").decode(bytes);

  assert.equal(text, "Hello, 한국");
});

test("rejects invalid assembled base64 before download", () => {
  assert.throws(() => base64ToBytes("QUJD=REV"), /Invalid base64/);
  assert.throws(() => base64ToBytes("abc"), /Invalid base64/);
  assert.throws(() => base64ToBytes("not@@@"), /Invalid base64/);
});

test("formats missing indexes as compact resend ranges", () => {
  assert.equal(formatIndexRanges([]), "-");
  assert.equal(formatIndexRanges([1, 2, 3, 7, 10, 11, 12]), "1-3, 7, 10-12");
  assert.equal(formatIndexRanges([9, 4, 5, 5, 6, 2]), "2, 4-6, 9");
});
