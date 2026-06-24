import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

test("JSP dev server wiring exists", () => {
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  const pomPath = resolve("tools/jsp-dev-server/pom.xml");
  const runnerPath = resolve("tools/jsp-dev-server/src/main/java/local/FileQrJspDevServer.java");

  assert.equal(packageJson.scripts["jsp:dev"], "mvn -q -f tools/jsp-dev-server/pom.xml compile exec:java");
  assert.equal(existsSync(pomPath), true, "JSP dev server Maven pom should exist");
  assert.equal(existsSync(runnerPath), true, "JSP dev server runner should exist");

  const pom = readFileSync(pomPath, "utf8");
  const runner = readFileSync(runnerPath, "utf8");

  assert.match(pom, /tomcat-embed-jasper/);
  assert.match(pom, /com.google.zxing/);
  assert.match(runner, /fileQr.baseDir/);
  assert.match(runner, /resolve\("artifacts"\)/);
});
