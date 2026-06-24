export var FILE_PREFIX = "FILE:";
export var BASE45_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
var BASE45_LOOKUP = createBase45Lookup();

export function parseQrPayload(value) {
  var raw = String(value || "").replace(/^[\r\n\t]+|[\r\n\t]+$/g, "");

  if (!raw) {
    return { type: "empty" };
  }

  if (raw.indexOf(FILE_PREFIX) !== 0) {
    return { type: "unsupported", reason: "Unsupported QR payload." };
  }

  if (raw.indexOf("FILE:v1:") === 0) {
    return parseFileV1Payload(raw);
  }

  if (raw.indexOf("FILE:V2:") === 0) {
    return parseFileV2Payload(raw);
  }

  return parseLegacyFilePayload(raw);
}

function parseLegacyFilePayload(raw) {
  var parts = raw.split(":");
  if (parts.length < 4) {
    return { type: "invalid", reason: "FILE format must be FILE:<name>:<index>/<total>:<chunk>." };
  }

  var fileName = parts[1];
  var indexInfo = parts[2].split("/");
  var index = Number(indexInfo[0]);
  var total = Number(indexInfo[1]);
  var chunk = parts.slice(3).join(":").replace(/\s+/g, "");

  if (!fileName) {
    return { type: "invalid", reason: "FILE name is empty." };
  }

  var validation = validateChunkFields(index, total, chunk);
  if (validation) return validation;

  return {
    type: "file-chunk",
    format: "legacy",
    encoding: "base64",
    fileName: fileName,
    fileId: "legacy:" + fileName + ":" + total,
    index: index,
    total: total,
    chunk: chunk
  };
}

function parseFileV1Payload(raw) {
  var parts = raw.split(":");
  if (parts.length < 6) {
    return { type: "invalid", reason: "FILE v1 format must be FILE:v1:<name>:<index>:<total>:<chunk>." };
  }

  var encodedName = parts[2];
  var index = Number(parts[3]);
  var total = Number(parts[4]);
  var chunk = parts.slice(5).join(":").replace(/\s+/g, "");
  var fileName;

  try {
    fileName = base64UrlToText(encodedName);
  } catch (error) {
    return { type: "invalid", reason: "FILE v1 filename is not valid base64url." };
  }

  if (!fileName) {
    return { type: "invalid", reason: "FILE v1 filename is empty." };
  }

  var validation = validateChunkFields(index, total, chunk);
  if (validation) return validation;

  return {
    type: "file-chunk",
    format: "v1",
    encoding: "base64",
    fileName: fileName,
    fileId: "v1:" + encodedName + ":" + total,
    index: index,
    total: total,
    chunk: chunk
  };
}

function parseFileV2Payload(raw) {
  var prefix = "FILE:V2:";
  var cursor = prefix.length;
  var lengthEnd = raw.indexOf(":", cursor);
  if (lengthEnd < 0) {
    return { type: "invalid", reason: "FILE V2 format must include filename length." };
  }

  var nameLengthText = raw.slice(cursor, lengthEnd);
  var nameLength = Number(nameLengthText);
  if (!/^[0-9]+$/.test(nameLengthText) || !Number.isInteger(nameLength) || nameLength < 1) {
    return { type: "invalid", reason: "FILE V2 filename length is invalid." };
  }

  cursor = lengthEnd + 1;
  var encodedName = raw.slice(cursor, cursor + nameLength);
  cursor += nameLength;
  if (encodedName.length !== nameLength || raw[cursor] !== ":") {
    return { type: "invalid", reason: "FILE V2 filename field is incomplete." };
  }

  cursor += 1;
  var indexEnd = raw.indexOf(":", cursor);
  if (indexEnd < 0) {
    return { type: "invalid", reason: "FILE V2 index field is missing." };
  }
  var index = Number(raw.slice(cursor, indexEnd));

  cursor = indexEnd + 1;
  var totalEnd = raw.indexOf(":", cursor);
  if (totalEnd < 0) {
    return { type: "invalid", reason: "FILE V2 total field is missing." };
  }
  var total = Number(raw.slice(cursor, totalEnd));
  var chunk = raw.slice(totalEnd + 1);
  var fileName;

  try {
    fileName = base45ToText(encodedName);
  } catch (error) {
    return { type: "invalid", reason: "FILE V2 filename is not valid Base45." };
  }

  if (!fileName) {
    return { type: "invalid", reason: "FILE V2 filename is empty." };
  }

  var validation = validateChunkFields(index, total, chunk, "base45");
  if (validation) return validation;

  return {
    type: "file-chunk",
    format: "v2",
    encoding: "base45",
    fileName: fileName,
    fileId: "v2:" + nameLength + ":" + encodedName + ":" + total,
    index: index,
    total: total,
    chunk: chunk
  };
}

function validateChunkFields(index, total, chunk, encoding) {
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < 1 || index > total) {
    return { type: "invalid", reason: "FILE index/total is invalid." };
  }

  if (!chunk) {
    return { type: "invalid", reason: "FILE chunk is empty." };
  }

  if (encoding === "base45") {
    if (!isValidBase45(chunk)) {
      return { type: "invalid", reason: "FILE V2 chunk is not valid Base45." };
    }
    return null;
  }

  if (!isValidBase64Chunk(chunk, index, total)) {
    return { type: "invalid", reason: "FILE chunk is not valid base64." };
  }

  return null;
}

export function createFileCollector() {
  return {
    fileId: "",
    fileName: "",
    encoding: "",
    total: 0,
    chunks: Object.create(null)
  };
}

export function addFileChunk(collector, payload) {
  if (!collector || !payload || payload.type !== "file-chunk") {
    return { ok: false, reason: "Invalid file QR payload." };
  }

  if (!collector.fileId) {
    collector.fileId = payload.fileId;
    collector.fileName = payload.fileName;
    collector.encoding = payload.encoding || "base64";
    collector.total = payload.total;
  }

  if (collector.fileId !== payload.fileId) {
    return {
      ok: false,
      reason: "Different file stream. Expected " + collector.fileName + " but got " + payload.fileName + "."
    };
  }

  if (collector.total !== payload.total) {
    return { ok: false, reason: "Total count mismatch for file stream." };
  }

  if (collector.encoding !== (payload.encoding || "base64")) {
    return { ok: false, reason: "Encoding mismatch for file stream." };
  }

  if (collector.chunks[payload.index] && collector.chunks[payload.index] !== payload.chunk) {
    return {
      ok: false,
      reason: "Conflicting chunk for FILE index " + payload.index + ". Reset and scan the same stream again."
    };
  }

  var duplicate = collector.chunks[payload.index] === payload.chunk;
  collector.chunks[payload.index] = payload.chunk;

  return {
    ok: true,
    duplicate: duplicate,
    complete: isFileCollectorComplete(collector),
    received: getReceivedIndexes(collector),
    missing: getMissingIndexes(collector)
  };
}

export function isFileCollectorComplete(collector) {
  if (!collector || !collector.total) return false;

  for (var i = 1; i <= collector.total; i += 1) {
    if (!collector.chunks[i]) return false;
  }

  return true;
}

export function getReceivedIndexes(collector) {
  if (!collector || !collector.total) return [];

  var indexes = [];
  for (var i = 1; i <= collector.total; i += 1) {
    if (collector.chunks[i]) indexes.push(i);
  }

  return indexes;
}

export function getMissingIndexes(collector) {
  if (!collector || !collector.total) return [];

  var indexes = [];
  for (var i = 1; i <= collector.total; i += 1) {
    if (!collector.chunks[i]) indexes.push(i);
  }

  return indexes;
}

export function assembleFileBase64(collector) {
  if (!isFileCollectorComplete(collector)) {
    throw new Error("Cannot assemble incomplete FILE stream.");
  }

  if (collector.encoding && collector.encoding !== "base64") {
    throw new Error("FILE stream is not base64 encoded.");
  }

  var combined = "";
  for (var i = 1; i <= collector.total; i += 1) {
    combined += collector.chunks[i];
  }

  return combined;
}

export function assembleFileBytes(collector) {
  if (!isFileCollectorComplete(collector)) {
    throw new Error("Cannot assemble incomplete FILE stream.");
  }

  if (!collector.encoding || collector.encoding === "base64") {
    return base64ToBytes(assembleFileBase64(collector));
  }

  if (collector.encoding !== "base45") {
    throw new Error("Unsupported FILE stream encoding.");
  }

  var parts = [];
  var totalLength = 0;
  for (var i = 1; i <= collector.total; i += 1) {
    var decoded = base45ToBytes(collector.chunks[i]);
    parts.push(decoded);
    totalLength += decoded.length;
  }

  var bytes = new Uint8Array(totalLength);
  var offset = 0;
  for (var j = 0; j < parts.length; j += 1) {
    bytes.set(parts[j], offset);
    offset += parts[j].length;
  }

  return bytes;
}

export function base64ToBytes(value) {
  var compact = String(value || "").replace(/\s+/g, "");
  if (!isValidCompleteBase64(compact)) {
    throw new Error("Invalid base64 payload.");
  }

  var binary = decodeBase64(compact);
  var bytes = new Uint8Array(binary.length);

  for (var i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function isValidBase64Chunk(chunk, index, total) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(chunk)) {
    return false;
  }

  var firstPadding = chunk.indexOf("=");
  if (firstPadding >= 0) {
    if (!/^={1,2}$/.test(chunk.slice(firstPadding))) {
      return false;
    }

    if (index !== total) {
      return false;
    }
  }

  return chunk.length % 4 === 0;
}

function isValidCompleteBase64(value) {
  if (!value || value.length % 4 !== 0) {
    return false;
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return false;
  }

  var firstPadding = value.indexOf("=");
  return firstPadding < 0 || /^={1,2}$/.test(value.slice(firstPadding));
}

export function base64UrlToText(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(value || ""))) {
    throw new Error("Invalid base64url text.");
  }

  var bytes = base64UrlToBytes(value);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function base45ToText(value) {
  return new TextDecoder("utf-8", { fatal: true }).decode(base45ToBytes(value));
}

export function base45ToBytes(value) {
  var text = String(value || "");
  if (!isValidBase45(text)) {
    throw new Error("Invalid Base45 payload.");
  }

  var bytes = [];
  for (var i = 0; i < text.length; ) {
    if (i + 2 < text.length) {
      var x = BASE45_LOOKUP[text[i]] + BASE45_LOOKUP[text[i + 1]] * 45 + BASE45_LOOKUP[text[i + 2]] * 45 * 45;
      if (x > 0xffff) {
        throw new Error("Invalid Base45 payload.");
      }
      bytes.push(Math.floor(x / 256), x % 256);
      i += 3;
    } else {
      var y = BASE45_LOOKUP[text[i]] + BASE45_LOOKUP[text[i + 1]] * 45;
      if (y > 0xff) {
        throw new Error("Invalid Base45 payload.");
      }
      bytes.push(y);
      i += 2;
    }
  }

  return new Uint8Array(bytes);
}

export function textToBase64Url(value) {
  var bytes = new TextEncoder().encode(String(value || ""));
  var binary = "";

  for (var i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return encodeBase64(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  var normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  var paddingLength = (4 - (normalized.length % 4)) % 4;
  var padded = normalized + Array(paddingLength + 1).join("=");
  var binary = decodeBase64(padded);
  var bytes = new Uint8Array(binary.length);

  for (var i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function decodeBase64(value) {
  if (typeof atob === "function") {
    return atob(value);
  }

  return Buffer.from(value, "base64").toString("binary");
}

function encodeBase64(binary) {
  if (typeof btoa === "function") {
    return btoa(binary);
  }

  return Buffer.from(binary, "binary").toString("base64");
}

function isValidBase45(value) {
  var text = String(value || "");
  if (!text || text.length % 3 === 1) {
    return false;
  }

  for (var i = 0; i < text.length; i += 1) {
    if (BASE45_LOOKUP[text[i]] === undefined) {
      return false;
    }
  }

  return true;
}

function createBase45Lookup() {
  var lookup = Object.create(null);
  for (var i = 0; i < BASE45_CHARSET.length; i += 1) {
    lookup[BASE45_CHARSET[i]] = i;
  }
  return lookup;
}
