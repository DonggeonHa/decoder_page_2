import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  addFileChunk,
  assembleFileBase64,
  base64ToBytes,
  createFileCollector,
  parseQrPayload
} from "../protocol.js";

const jspPath = resolve("artifacts/file-qr-sender.jsp");

test("JSP sender core builds legacy and v1 file payloads", () => {
  assert.equal(existsSync(jspPath), true, "expected JSP sender artifact to exist");

  const jsp = readFileSync(jspPath, "utf8");
  assert.match(jsp, /BEGIN TESTABLE CORE/);
  assert.match(jsp, /END TESTABLE CORE/);
  assert.match(jsp, /FILE:v1:/);
  assert.match(jsp, /createQrPngBase64/);
  assert.match(jsp, /resolveAllowedFile/);
  assert.match(jsp, /validateFileSize/);

  const core = jsp.match(/\/\/ BEGIN TESTABLE CORE([\s\S]*?)\/\/ END TESTABLE CORE/)?.[1];
  assert.ok(core, "expected testable core block");

  const tempDir = mkdtempSync(join(tmpdir(), "file-qr-jsp-core-"));
  const javaPath = join(tempDir, "FileQrSenderHarness.java");

  try {
    writeFileSync(javaPath, buildHarness(core));
    execFileSync("javac", ["--release", "8", javaPath], { cwd: tempDir, stdio: "pipe" });
    const output = execFileSync("java", ["-cp", tempDir, "FileQrSenderHarness"], {
      cwd: tempDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    verifyProtocolRoundTrip(output);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

function verifyProtocolRoundTrip(output) {
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  const expectedBase64 = lines.find((line) => line.startsWith("DATA|"))?.slice("DATA|".length);
  const payloadLines = lines.filter((line) => line.startsWith("PAYLOAD|")).map((line) => line.slice("PAYLOAD|".length));
  assert.ok(expectedBase64, "Java harness should emit original data");
  assert.ok(payloadLines.length > 2, "Java harness should emit sender payloads");

  for (const format of ["FILE:v1", "FILE:legacy"]) {
    const collector = createFileCollector();
    const selected = payloadLines.filter((line) => line.startsWith(format + "|")).map((line) => line.slice(format.length + 1));

    assert.ok(selected.length > 0, `expected ${format} payloads`);
    for (const payloadText of selected) {
      const parsed = parseQrPayload(payloadText);
      assert.equal(parsed.type, "file-chunk", `${format} payload should parse`);
      const result = addFileChunk(collector, parsed);
      assert.equal(result.ok, true, `${format} payload should collect`);
    }

    assert.equal(Buffer.from(base64ToBytes(assembleFileBase64(collector))).toString("base64"), expectedBase64);
  }
}

function buildHarness(core) {
  return `
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

public class FileQrSenderHarness {
${core}

  public static void main(String[] args) throws Exception {
    verifyV1Payloads();
    verifyLegacyPayloads();
    verifyAllowedBaseDirectory();
    verifyFileSizeValidation();
    verifyOversizeRejected();
    verifyEscaping();
    emitRoundTripFixtures();
  }

  private static void verifyV1Payloads() throws Exception {
    byte[] data = "Hello, file QR".getBytes(StandardCharsets.UTF_8);
    List<FileQrPayload> payloads = buildFilePayloads("report:final.txt", data, 8, true);
    assertTrue(payloads.size() > 1, "small chunk size should force multiple v1 chunks");

    StringBuilder encoded = new StringBuilder();
    for (int i = 0; i < payloads.size(); i += 1) {
      FileQrPayload payload = payloads.get(i);
      String[] parts = payload.text.split(":", 6);
      assertEquals("FILE", parts[0], "v1 prefix field");
      assertEquals("v1", parts[1], "v1 version field");
      assertEquals("report:final.txt", base64UrlToText(parts[2]), "filename should round trip");
      assertEquals(String.valueOf(i + 1), parts[3], "index should be 1 based");
      assertEquals(String.valueOf(payloads.size()), parts[4], "total should match");
      encoded.append(parts[5]);
    }
    assertArrayEquals(data, Base64.getDecoder().decode(encoded.toString()), "v1 payload data should round trip");
  }

  private static void verifyLegacyPayloads() throws Exception {
    byte[] data = "ABCDEF".getBytes(StandardCharsets.UTF_8);
    List<FileQrPayload> payloads = buildFilePayloads("legacy.txt", data, 4, false);
    assertTrue(payloads.size() > 1, "legacy payload should split with small chunk size");

    StringBuilder encoded = new StringBuilder();
    for (int i = 0; i < payloads.size(); i += 1) {
      FileQrPayload payload = payloads.get(i);
      assertTrue(payload.text.startsWith("FILE:legacy.txt:" + (i + 1) + "/" + payloads.size() + ":"), "legacy payload shape");
      encoded.append(payload.chunk);
    }
    assertArrayEquals(data, Base64.getDecoder().decode(encoded.toString()), "legacy payload data should round trip");
  }

  private static void verifyOversizeRejected() throws Exception {
    byte[] data = new byte[MAX_FILE_BYTES + 1];
    try {
      buildFilePayloads("huge.bin", data, FILE_CHUNK_SIZE, true);
      throw new AssertionError("oversize input should be rejected");
    } catch (IllegalArgumentException expected) {
      assertTrue(expected.getMessage().contains("too large"), "oversize error should explain limit");
    }
  }

  private static void verifyAllowedBaseDirectory() throws Exception {
    File base = Files.createTempDirectory("file-qr-base").toFile();
    File child = new File(base, "allowed.bin");
    Files.write(child.toPath(), "ok".getBytes(StandardCharsets.UTF_8));
    File outside = File.createTempFile("file-qr-outside", ".bin");

    try {
      assertEquals(child.getCanonicalFile(), resolveAllowedFile(child.getPath(), base.getPath()), "allowed child should resolve");

      try {
        resolveAllowedFile(outside.getPath(), base.getPath());
        throw new AssertionError("outside file should be rejected");
      } catch (IllegalArgumentException expected) {
        assertTrue(expected.getMessage().contains("outside"), "outside file rejection should explain base directory");
      }

      try {
        resolveAllowedFile(child.getPath(), "");
        throw new AssertionError("empty base directory should fail closed");
      } catch (IllegalArgumentException expected) {
        assertTrue(expected.getMessage().contains("base directory"), "empty base directory should explain configuration");
      }
    } finally {
      child.delete();
      base.delete();
      outside.delete();
    }
  }

  private static void verifyFileSizeValidation() {
    validateFileSize(MAX_FILE_BYTES);
    try {
      validateFileSize(MAX_FILE_BYTES + 1L);
      throw new AssertionError("oversize file length should be rejected before read");
    } catch (IllegalArgumentException expected) {
      assertTrue(expected.getMessage().contains("too large"), "size validation should explain limit");
    }
  }

  private static void verifyEscaping() {
    assertEquals("&lt;&gt;&amp;&quot;&#x27;", escapeHtml("<>&\\\"'"), "HTML escaping");
  }

  private static void emitRoundTripFixtures() throws Exception {
    byte[] data = "sender to decoder 한국".getBytes(StandardCharsets.UTF_8);
    System.out.println("DATA|" + Base64.getEncoder().encodeToString(data));

    List<FileQrPayload> v1Payloads = buildFilePayloads("interop:final.bin", data, 8, true);
    for (int i = 0; i < v1Payloads.size(); i += 1) {
      System.out.println("PAYLOAD|FILE:v1|" + v1Payloads.get(i).text);
    }

    List<FileQrPayload> legacyPayloads = buildFilePayloads("interop.bin", data, 8, false);
    for (int i = 0; i < legacyPayloads.size(); i += 1) {
      System.out.println("PAYLOAD|FILE:legacy|" + legacyPayloads.get(i).text);
    }
  }

  private static String base64UrlToText(String value) throws Exception {
    String normalized = value.replace('-', '+').replace('_', '/');
    int padding = (4 - (normalized.length() % 4)) % 4;
    StringBuilder padded = new StringBuilder(normalized);
    for (int i = 0; i < padding; i += 1) padded.append('=');
    return new String(Base64.getDecoder().decode(padded.toString()), StandardCharsets.UTF_8);
  }

  private static void assertTrue(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
  }

  private static void assertEquals(Object expected, Object actual, String message) {
    if (expected == null ? actual != null : !expected.equals(actual)) {
      throw new AssertionError(message + " expected=[" + expected + "] actual=[" + actual + "]");
    }
  }

  private static void assertArrayEquals(byte[] expected, byte[] actual, String message) {
    if (expected.length != actual.length) {
      throw new AssertionError(message + " length expected=" + expected.length + " actual=" + actual.length);
    }
    for (int i = 0; i < expected.length; i += 1) {
      if (expected[i] != actual[i]) {
        throw new AssertionError(message + " differs at " + i);
      }
    }
  }
}
`;
}
