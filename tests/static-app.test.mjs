import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

test("static decoder page is self-contained and wired to local modules", () => {
  const indexPath = resolve("index.html");
  const appPath = resolve("app.js");
  const scannerPath = resolve("scanner.js");
  const stylesPath = resolve("styles.css");
  const serverPath = resolve("server.mjs");
  const packagePath = resolve("package.json");

  assert.equal(existsSync(indexPath), true, "index.html should exist");
  assert.equal(existsSync(appPath), true, "app.js should exist");
  assert.equal(existsSync(scannerPath), true, "scanner.js should exist");
  assert.equal(existsSync(stylesPath), true, "styles.css should exist");
  assert.equal(existsSync(serverPath), true, "server.mjs should exist");

  const html = readFileSync(indexPath, "utf8");
  const app = readFileSync(appPath, "utf8");
  const scanner = readFileSync(scannerPath, "utf8");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

  assert.doesNotMatch(html, /https?:\/\//, "page should not depend on remote CDN assets");
  assert.match(html, /id="video"/, "page should expose camera preview");
  assert.match(html, /id="manualInput"/, "page should expose manual payload input");
  assert.match(html, /id="copyMissingBtn"/, "page should expose missing range copy action");
  assert.match(html, /id="downloadBtn"/, "page should expose download action");
  assert.match(html, /type="module" src="\.\/app\.js"/, "page should load local app module");
  assert.match(app, /from "\.\/protocol\.js"/, "app should use tested protocol helpers");
  assert.match(app, /formatIndexRanges/, "app should compact missing chunk ranges");
  assert.match(app, /copyMissingRanges/, "app should let users copy resend ranges");
  assert.match(app, /from "\.\/scanner\.js"/, "app should use scanner wrapper");
  assert.match(scanner, /BarcodeDetector/, "scanner should use browser BarcodeDetector");
  assert.equal(packageJson.scripts.dev, "node server.mjs", "dev server should not need package downloads");
});
