import {
  addFileChunk,
  assembleFileBytes,
  createFileCollector,
  formatIndexRanges,
  getMissingIndexes,
  getReceivedIndexes,
  parseQrPayload
} from "./protocol.js";
import { createQrScanner } from "./scanner.js";

var video = document.getElementById("video");
var scannerOverlay = document.getElementById("scannerOverlay");
var capabilityBadge = document.getElementById("capabilityBadge");
var environmentWarning = document.getElementById("environmentWarning");
var startScanBtn = document.getElementById("startScanBtn");
var stopScanBtn = document.getElementById("stopScanBtn");
var resetBtn = document.getElementById("resetBtn");
var statusLine = document.getElementById("statusLine");
var progressText = document.getElementById("progressText");
var progressBar = document.getElementById("progressBar");
var fileName = document.getElementById("fileName");
var streamState = document.getElementById("streamState");
var chunkStatus = document.getElementById("chunkStatus");
var resendRanges = document.getElementById("resendRanges");
var downloadBtn = document.getElementById("downloadBtn");

var collector = createFileCollector();
var completeBytes = null;

var scanner = createQrScanner({
  video: video,
  overlay: scannerOverlay,
  onScan: handleScannedValue,
  onStatus: setStatus
});

function setStatus(message, type) {
  statusLine.textContent = message || "";
  statusLine.className = "status " + (type || "");
}

function detectEnvironment() {
  var warnings = [];
  var userAgent = navigator.userAgent || "";

  if (userAgent.indexOf("KAKAOTALK") >= 0) {
    warnings.push("카카오톡 인앱 브라우저에서는 카메라 권한이 막힐 수 있습니다.");
  }

  if (!window.isSecureContext) {
    warnings.push("카메라 스캔은 HTTPS 또는 Chrome 로컬 파일에서 안정적입니다.");
  }

  if (!("BarcodeDetector" in window)) {
    warnings.push("BarcodeDetector가 없습니다.");
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    warnings.push("카메라 API를 사용할 수 없습니다.");
  }

  if (warnings.length) {
    environmentWarning.textContent = warnings.join(" ");
    environmentWarning.classList.remove("hidden");
    capabilityBadge.textContent = "Check";
    capabilityBadge.className = "badge error";
    return;
  }

  environmentWarning.classList.add("hidden");
  capabilityBadge.textContent = "Ready";
  capabilityBadge.className = "badge ok";
}

async function handleScannedValue(rawValue) {
  addPayload(rawValue);
}

function addPayload(rawValue) {
  var parsed = parseQrPayload(rawValue);

  if (parsed.type === "invalid" || parsed.type === "unsupported" || parsed.type === "empty") {
    setStatus(parsed.reason || "FILE QR payload가 아닙니다.", "error");
    return;
  }

  var result = addFileChunk(collector, parsed);
  if (!result.ok) {
    setStatus(result.reason, "error");
    renderProgress();
    return;
  }

  if (result.complete) {
    try {
      completeBytes = assembleFileBytes(collector);
    } catch (error) {
      completeBytes = null;
      downloadBtn.disabled = true;
      setStatus(error && error.message ? error.message : "파일 payload 검증 실패", "error");
      renderProgress();
      return;
    }

    setStatus("수신 완료", "ok");
    downloadBtn.disabled = false;
    if (scanner.isRunning()) {
      scanner.stop();
      setScanButtons(false);
    }
  } else {
    setStatus(result.duplicate ? "중복 조각 무시: " + parsed.index : "조각 수신: " + parsed.index, "ok");
  }

  renderProgress();
}

function renderProgress() {
  var received = getReceivedIndexes(collector);
  var missing = getMissingIndexes(collector);
  var total = collector.total || 0;
  var percent = total ? Math.round((received.length / total) * 100) : 0;
  var receivedRanges = formatIndexRanges(received);
  var missingRanges = formatIndexRanges(missing);

  fileName.textContent = collector.fileName || "-";
  progressText.textContent = received.length + " / " + total;
  progressBar.style.width = percent + "%";
  streamState.textContent = completeBytes ? "완료" : collector.fileId ? "수신 중" : "대기";
  chunkStatus.textContent = collector.fileId
    ? [
        "받은 조각: " + received.length + "개 (" + receivedRanges + ")",
        "빠진 조각: " + missing.length + "개 (" + missingRanges + ")"
      ].join("\n")
    : "수신된 조각 없음";
  resendRanges.textContent = collector.fileId && missing.length ? missingRanges : "-";
}

function resetAll() {
  if (scanner.isRunning()) {
    scanner.stop();
    setScanButtons(false);
  }

  collector = createFileCollector();
  completeBytes = null;
  downloadBtn.disabled = true;
  renderProgress();
  setStatus("초기화됨");
}

function setScanButtons(scanning) {
  startScanBtn.disabled = scanning;
  stopScanBtn.disabled = !scanning;
}

async function startScanner() {
  try {
    setScanButtons(true);
    await scanner.start();
  } catch (error) {
    setScanButtons(false);
    setStatus(error && error.message ? error.message : "카메라 시작 실패", "error");
  }
}

function triggerDownload() {
  if (!completeBytes) {
    setStatus("수신 완료 후 다운로드할 수 있습니다.", "error");
    return;
  }

  try {
    var blob = new Blob([completeBytes], { type: "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = collector.fileName || "download.bin";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setStatus("다운로드 요청됨", "ok");
  } catch (error) {
    setStatus(error && error.message ? error.message : "파일 조립 실패", "error");
  }
}

startScanBtn.onclick = startScanner;
stopScanBtn.onclick = function () {
  scanner.stop();
  setScanButtons(false);
};
resetBtn.onclick = resetAll;
downloadBtn.onclick = triggerDownload;

detectEnvironment();
renderProgress();
