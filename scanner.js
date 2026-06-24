export function createQrScanner(options) {
  var video = options.video;
  var overlay = options.overlay;
  var onScan = options.onScan;
  var onStatus = options.onStatus;
  var detector = null;
  var stream = null;
  var running = false;
  var lastRawValue = "";
  var lastScanAt = 0;

  function setOverlay(message, visible) {
    if (!overlay) return;
    overlay.textContent = message || "";
    overlay.classList.toggle("hidden", !visible);
  }

  async function ensureDetector() {
    if (!("BarcodeDetector" in window)) {
      throw new Error("BarcodeDetector가 없습니다. Chrome에서 열어주세요.");
    }

    if (!detector) {
      detector = new BarcodeDetector({ formats: ["qr_code"] });
    }
  }

  async function start() {
    if (running) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("카메라 API를 사용할 수 없습니다.");
    }

    await ensureDetector();

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });

    video.srcObject = stream;
    await video.play();
    running = true;
    setOverlay("", false);
    onStatus("스캔 중", "ok");
    scanLoop();
  }

  function stop() {
    running = false;

    if (stream) {
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
      stream = null;
    }

    video.srcObject = null;
    setOverlay("카메라 대기", true);
    onStatus("스캔 중지됨");
  }

  async function scanLoop() {
    if (!running) return;

    try {
      var codes = await detector.detect(video);
      if (codes && codes.length > 0) {
        var rawValue = codes[0].rawValue || "";
        var now = Date.now();

        if (rawValue && (rawValue !== lastRawValue || now - lastScanAt > 900)) {
          lastRawValue = rawValue;
          lastScanAt = now;
          await onScan(rawValue);
        }
      }
    } catch (error) {
      onStatus(error && error.message ? error.message : "QR 스캔 오류", "error");
    }

    requestAnimationFrame(scanLoop);
  }

  return {
    start: start,
    stop: stop,
    isRunning: function () {
      return running;
    }
  };
}
