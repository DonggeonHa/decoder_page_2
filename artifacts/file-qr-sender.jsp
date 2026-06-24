<%@page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>

<%@page import="com.google.zxing.BarcodeFormat"%>
<%@page import="com.google.zxing.EncodeHintType"%>
<%@page import="com.google.zxing.common.BitMatrix"%>
<%@page import="com.google.zxing.qrcode.QRCodeWriter"%>

<%@page import="javax.imageio.ImageIO"%>
<%@page import="java.awt.image.BufferedImage"%>
<%@page import="java.io.ByteArrayOutputStream"%>
<%@page import="java.io.File"%>
<%@page import="java.io.IOException"%>
<%@page import="java.nio.charset.StandardCharsets"%>
<%@page import="java.nio.file.Files"%>
<%@page import="java.util.ArrayList"%>
<%@page import="java.util.Base64"%>
<%@page import="java.util.HashMap"%>
<%@page import="java.util.List"%>
<%@page import="java.util.Map"%>

<%!
// BEGIN TESTABLE CORE
static final int FILE_CHUNK_SIZE = 1800;
static final int QR_IMAGE_SIZE = 440;
static final int MAX_FILE_BYTES = 2 * 1024 * 1024;
static final int MAX_QR_COUNT = 1200;

static class FileQrPayload {
  public final String mode;
  public final String text;
  public final String fileName;
  public final String chunk;
  public final int index;
  public final int total;
  public final int byteLength;

  FileQrPayload(String mode, String text, String fileName, String chunk, int index, int total) {
    this.mode = mode;
    this.text = text;
    this.fileName = fileName;
    this.chunk = chunk;
    this.index = index;
    this.total = total;
    this.byteLength = utf8Length(text);
  }
}

public static List<FileQrPayload> buildFilePayloads(String fileName, byte[] fileBytes) {
  return buildFilePayloads(fileName, fileBytes, FILE_CHUNK_SIZE, true);
}

public static List<FileQrPayload> buildFilePayloads(String fileName, byte[] fileBytes, int chunkSize, boolean useV1) {
  if (fileName == null || fileName.trim().length() == 0) {
    throw new IllegalArgumentException("File name is empty.");
  }
  if (fileBytes == null || fileBytes.length == 0) {
    throw new IllegalArgumentException("File is empty.");
  }
  validateFileSize(fileBytes.length);
  if (chunkSize < 1 || chunkSize > 2200) {
    throw new IllegalArgumentException("Chunk size is out of supported range.");
  }

  String encoded = Base64.getEncoder().encodeToString(fileBytes);
  int total = (encoded.length() + chunkSize - 1) / chunkSize;
  if (total > MAX_QR_COUNT) {
    throw new IllegalArgumentException("File requires too many QR frames. Maximum QR count is " + MAX_QR_COUNT + ".");
  }

  String safeName = sanitizeFileName(fileName);
  String encodedName = textBase64Url(safeName);
  List<FileQrPayload> payloads = new ArrayList<FileQrPayload>();

  for (int i = 0; i < total; i += 1) {
    int start = i * chunkSize;
    int end = Math.min(start + chunkSize, encoded.length());
    String chunk = encoded.substring(start, end);
    String text;
    String mode;

    if (useV1) {
      mode = "FILE:v1";
      text = "FILE:v1:" + encodedName + ":" + (i + 1) + ":" + total + ":" + chunk;
    } else {
      mode = "FILE:legacy";
      text = "FILE:" + safeName + ":" + (i + 1) + "/" + total + ":" + chunk;
    }

    payloads.add(new FileQrPayload(mode, text, safeName, chunk, i + 1, total));
  }

  return payloads;
}

public static String sanitizeFileName(String fileName) {
  String value = fileName == null ? "download.bin" : fileName.trim();
  value = value.replace('\\', '_').replace('/', '_');
  if (value.length() == 0) return "download.bin";
  if (value.length() > 180) return value.substring(0, 180);
  return value;
}

public static File resolveAllowedFile(String filePath, String allowedBaseDir) throws IOException {
  if (allowedBaseDir == null || allowedBaseDir.trim().length() == 0) {
    throw new IllegalArgumentException("FILE QR base directory is not configured.");
  }
  if (filePath == null || filePath.trim().length() == 0) {
    throw new IllegalArgumentException("File path is empty.");
  }

  File baseDir = new File(allowedBaseDir).getCanonicalFile();
  File targetFile = new File(filePath).getCanonicalFile();
  String basePath = baseDir.getPath();
  String targetPath = targetFile.getPath();

  if (!baseDir.exists() || !baseDir.isDirectory()) {
    throw new IllegalArgumentException("Configured FILE QR base directory does not exist.");
  }
  if (!targetFile.exists() || !targetFile.isFile()) {
    throw new IllegalArgumentException("File was not found in the configured base directory.");
  }
  if (!targetPath.equals(basePath) && !targetPath.startsWith(basePath + File.separator)) {
    throw new IllegalArgumentException("Requested file is outside the configured FILE QR base directory.");
  }

  return targetFile;
}

public static void validateFileSize(long byteLength) {
  if (byteLength <= 0) {
    throw new IllegalArgumentException("File is empty.");
  }
  if (byteLength > MAX_FILE_BYTES) {
    throw new IllegalArgumentException("File is too large. Maximum file size is " + MAX_FILE_BYTES + " bytes.");
  }
}

public static String textBase64Url(String value) {
  return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
}

public static String escapeHtml(String input) {
  if (input == null) return "";
  return input.replace("&", "&amp;")
      .replace("<", "&lt;")
      .replace(">", "&gt;")
      .replace("\"", "&quot;")
      .replace("'", "&#x27;");
}

public static int utf8Length(String value) {
  return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
}
// END TESTABLE CORE

public static String createQrPngBase64(String text, int size) throws Exception {
  QRCodeWriter qrWriter = new QRCodeWriter();
  Map<EncodeHintType, Object> hints = new HashMap<EncodeHintType, Object>();
  hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
  hints.put(EncodeHintType.MARGIN, Integer.valueOf(2));

  BitMatrix matrix = qrWriter.encode(text, BarcodeFormat.QR_CODE, size, size, hints);
  BufferedImage image = new BufferedImage(size, size, BufferedImage.TYPE_BYTE_BINARY);

  for (int y = 0; y < size; y += 1) {
    for (int x = 0; x < size; x += 1) {
      image.setRGB(x, y, matrix.get(x, y) ? 0x000000 : 0xFFFFFF);
    }
  }

  ByteArrayOutputStream out = new ByteArrayOutputStream();
  if (!ImageIO.write(image, "png", out)) {
    throw new IOException("PNG writer is not available.");
  }
  return Base64.getEncoder().encodeToString(out.toByteArray());
}
%>

<%
String filePath = request.getParameter("filePath");
String format = request.getParameter("format");
String allowedBaseDir = application.getInitParameter("FILE_QR_BASE_DIR");
if (allowedBaseDir == null || allowedBaseDir.trim().length() == 0) {
  allowedBaseDir = System.getProperty("fileQr.baseDir");
}
boolean useV1 = !"legacy".equalsIgnoreCase(format);
boolean submitted = "POST".equalsIgnoreCase(request.getMethod());
String errorMessage = "";
String sourceFileName = "";
long sourceFileBytes = 0;
List<FileQrPayload> payloads = new ArrayList<FileQrPayload>();
List<String> frames = new ArrayList<String>();

if (submitted) {
  if (filePath == null || filePath.trim().length() == 0) {
    errorMessage = "파일 경로를 입력하세요.";
  } else {
    try {
      File targetFile = resolveAllowedFile(filePath, allowedBaseDir);
      validateFileSize(targetFile.length());
      sourceFileName = targetFile.getName();
      sourceFileBytes = targetFile.length();
      byte[] fileBytes = Files.readAllBytes(targetFile.toPath());
      payloads = buildFilePayloads(sourceFileName, fileBytes, FILE_CHUNK_SIZE, useV1);

      for (int i = 0; i < payloads.size(); i += 1) {
        frames.add(createQrPngBase64(payloads.get(i).text, QR_IMAGE_SIZE));
      }
    } catch (Exception e) {
      application.log("FILE QR generation failed", e);
      errorMessage = "QR 생성 실패: " + (e.getMessage() == null ? e.getClass().getName() : e.getMessage());
      payloads.clear();
      frames.clear();
    }
  }
}
%>

<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FILE QR 송신기</title>
<style>
body{margin:0;padding:24px;background:#f5f7fa;color:#17181a;font-family:Arial,"Malgun Gothic",sans-serif}
.wrap{width:min(960px,100%);margin:0 auto}
.panel{margin-top:14px;padding:16px;border:1px solid #d4dbe5;border-radius:8px;background:#fff}
label{display:block;margin:10px 0 5px;font-weight:700}
input[type=text]{width:100%;box-sizing:border-box;padding:10px;border:1px solid #9aa3af;border-radius:5px;font-family:Consolas,"Courier New",monospace}
select,button{min-height:40px;margin-top:10px;padding:8px 12px;border:1px solid #7b8491;border-radius:5px;background:#f7f8fa;font-size:15px}
button.primary{border-color:#0b57d0;background:#0b57d0;color:#fff}
.error{border-color:#d92d20;background:#fff4f2;color:#b42318}
.summary{line-height:1.7}
.player{text-align:center}
#qrImage{width:100%;max-width:<%= QR_IMAGE_SIZE %>px;height:auto;border:8px solid #111;background:#fff}
.status{margin-top:10px;font-weight:700}
.controls{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:12px}
.payload{width:100%;min-height:90px;margin-top:8px;font-family:Consolas,"Courier New",monospace;font-size:12px}
</style>
</head>
<body>
<div class="wrap">
  <h1>FILE QR 송신기</h1>

  <div class="panel">
    <p class="summary">허용 디렉터리: <strong><%= escapeHtml(allowedBaseDir) %></strong></p>
    <form method="post" action="">
      <label for="filePath">서버 파일 절대 경로</label>
      <input id="filePath" type="text" name="filePath" value="<%= escapeHtml(filePath) %>" placeholder="C:\temp\sample.bin">

      <label for="format">payload 형식</label>
      <select id="format" name="format">
        <option value="v1" <%= useV1 ? "selected" : "" %>>FILE:v1</option>
        <option value="legacy" <%= !useV1 ? "selected" : "" %>>FILE legacy</option>
      </select>
      <br>
      <button class="primary" type="submit">QR 스트림 생성</button>
    </form>
  </div>

  <% if (errorMessage.length() > 0) { %>
    <div class="panel error"><%= escapeHtml(errorMessage) %></div>
  <% } %>

  <% if (!payloads.isEmpty()) { %>
    <div class="panel summary">
      <strong>파일명:</strong> <%= escapeHtml(sourceFileName) %><br>
      <strong>파일 크기:</strong> <%= sourceFileBytes %> bytes<br>
      <strong>payload 형식:</strong> <%= escapeHtml(payloads.get(0).mode) %><br>
      <strong>QR 프레임:</strong> <%= payloads.size() %>장<br>
      <strong>프레임 payload:</strong> 최대 <%= FILE_CHUNK_SIZE %> chars
    </div>

    <div class="panel player">
      <img id="qrImage" alt="FILE QR frame" src="">
      <div id="frameStatus" class="status">대기</div>
      <div class="controls">
        <button type="button" onclick="startPlay()">재생</button>
        <button type="button" onclick="stopPlay()">일시정지</button>
        <button type="button" onclick="resetPlay()">처음</button>
      </div>
    </div>

    <div class="panel">
      <details>
        <summary>payload 확인</summary>
        <textarea class="payload" readonly><% for (int i = 0; i < payloads.size(); i += 1) { %><%= escapeHtml(payloads.get(i).text) %><%= i + 1 < payloads.size() ? "\n" : "" %><% } %></textarea>
      </details>
    </div>

    <script>
      var qrFrames = [
        <% for (int i = 0; i < frames.size(); i += 1) { %>
          "data:image/png;base64,<%= frames.get(i) %>"<%= i + 1 < frames.size() ? "," : "" %>
        <% } %>
      ];
      var currentIndex = 0;
      var playInterval = null;
      var qrImage = document.getElementById("qrImage");
      var frameStatus = document.getElementById("frameStatus");

      function renderFrame() {
        if (!qrFrames.length) return;
        qrImage.src = qrFrames[currentIndex];
        frameStatus.textContent = (currentIndex + 1) + " / " + qrFrames.length;
      }

      function nextFrame() {
        currentIndex = (currentIndex + 1) % qrFrames.length;
        renderFrame();
      }

      function startPlay() {
        stopPlay();
        playInterval = setInterval(nextFrame, 150);
      }

      function stopPlay() {
        if (playInterval) clearInterval(playInterval);
        playInterval = null;
      }

      function resetPlay() {
        stopPlay();
        currentIndex = 0;
        renderFrame();
      }

      renderFrame();
    </script>
  <% } %>
</div>
</body>
</html>
