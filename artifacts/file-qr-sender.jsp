<%@page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>

<%--
  개인용 단순 개선 버전

  원본 JSP에서 유지:
  - 서버 파일 절대 경로 입력
  - 파일 bytes를 여러 QR 프레임으로 분할
  - 화면에서 QR 애니메이션 재생

  원본 대비 개선:
  - payload는 FILE:V2 고정
  - Base45로 QR alphanumeric mode 용량 활용
  - 파일명은 Base45 길이 기반 필드로 구분자 충돌 방지
  - QR 크기/조각 크기를 상단 상수로 분리

--%>

<%@page import="com.google.zxing.BarcodeFormat"%>
<%@page import="com.google.zxing.EncodeHintType"%>
<%@page import="com.google.zxing.common.BitMatrix"%>
<%@page import="com.google.zxing.qrcode.QRCodeWriter"%>
<%@page import="com.google.zxing.qrcode.decoder.ErrorCorrectionLevel"%>

<%@page import="javax.imageio.ImageIO"%>
<%@page import="java.awt.image.BufferedImage"%>
<%@page import="java.io.ByteArrayOutputStream"%>
<%@page import="java.io.File"%>
<%@page import="java.io.IOException"%>
<%@page import="java.nio.charset.StandardCharsets"%>
<%@page import="java.nio.file.Files"%>

<%@page import="java.util.ArrayList"%>
<%@page import="java.util.List"%>
<%@page import="java.util.HashMap"%>
<%@page import="java.util.Map"%>
<%@page import="java.util.Base64"%>

<%!
	static final int QR_IMAGE_SIZE = 640;
	static final int MAX_QR_TEXT_CHARS = 4296;
	static final String BASE45_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

	public static String escapeHtml(String input) {
		if (input == null) return "";
		return input.replace("&", "&amp;")
				.replace("<", "&lt;")
				.replace(">", "&gt;")
				.replace("\"", "&quot;")
				.replace("'", "&#x27;");
	}

	public static String sanitizeFileName(String fileName) {
		String value = fileName == null ? "download.bin" : fileName.trim();
		value = value.replace('\\', '_').replace('/', '_');
		if (value.length() == 0) return "download.bin";
		if (value.length() > 180) return value.substring(0, 180);
		return value;
	}

	public static String base45Encode(byte[] bytes) {
		StringBuilder output = new StringBuilder(((bytes.length + 1) / 2) * 3);
		for (int i = 0; i < bytes.length; i += 2) {
			if (i + 1 < bytes.length) {
				int value = ((bytes[i] & 0xff) * 256) + (bytes[i + 1] & 0xff);
				output.append(BASE45_CHARSET.charAt(value % 45));
				value = value / 45;
				output.append(BASE45_CHARSET.charAt(value % 45));
				value = value / 45;
				output.append(BASE45_CHARSET.charAt(value));
			} else {
				int value = bytes[i] & 0xff;
				output.append(BASE45_CHARSET.charAt(value % 45));
				value = value / 45;
				output.append(BASE45_CHARSET.charAt(value));
			}
		}
		return output.toString();
	}

	public static String textBase45(String value) {
		return base45Encode(value.getBytes(StandardCharsets.UTF_8));
	}

	public static int base45CharsToMaxBytes(int charCount) {
		if (charCount < 2) return 0;
		int bytes = (charCount / 3) * 2;
		if (charCount % 3 >= 2) bytes += 1;
		return bytes;
	}

	public static byte[] sliceBytes(byte[] source, int start, int end) {
		byte[] chunk = new byte[end - start];
		System.arraycopy(source, start, chunk, 0, chunk.length);
		return chunk;
	}

	public static String buildFileV2Payload(String safeFileName, int index, int total, byte[] chunk) {
		String encodedName = textBase45(safeFileName);
		return "FILE:V2:" + encodedName.length() + ":" + encodedName + ":" + index + ":" + total + ":" + base45Encode(chunk);
	}

	public static int calculateFileChunkBytes(String safeFileName, int byteLength) {
		String encodedName = textBase45(safeFileName);
		int encodedNameLength = encodedName.length();
		int totalChunks = 1;

		for (int guard = 0; guard < 10; guard += 1) {
			int digits = String.valueOf(totalChunks).length();
			int overhead = "FILE:V2:".length()
					+ String.valueOf(encodedNameLength).length()
					+ 1
					+ encodedNameLength
					+ 1 + digits
					+ 1 + digits
					+ 1;
			int chunkChars = MAX_QR_TEXT_CHARS - overhead;
			int chunkBytes = base45CharsToMaxBytes(chunkChars);
			if (chunkBytes < 1) {
				throw new IllegalArgumentException("파일명이 너무 길어 QR payload를 만들 수 없습니다.");
			}

			int nextTotalChunks = (byteLength + chunkBytes - 1) / chunkBytes;
			if (nextTotalChunks == totalChunks) {
				return chunkBytes;
			}
			totalChunks = nextTotalChunks;
		}

		throw new IllegalArgumentException("QR chunk 크기 계산에 실패했습니다.");
	}

	public static String generateQRCodeBase64(String text, int size) throws Exception {
		QRCodeWriter qrWriter = new QRCodeWriter();
		Map<EncodeHintType, Object> hints = new HashMap<EncodeHintType, Object>();
		hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
		hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.L);
		hints.put(EncodeHintType.MARGIN, Integer.valueOf(2));

		BitMatrix bitMatrix = qrWriter.encode(text, BarcodeFormat.QR_CODE, size, size, hints);
		BufferedImage image = new BufferedImage(size, size, BufferedImage.TYPE_BYTE_BINARY);

		for (int y = 0; y < size; y += 1) {
			for (int x = 0; x < size; x += 1) {
				image.setRGB(x, y, bitMatrix.get(x, y) ? 0x000000 : 0xFFFFFF);
			}
		}

		ByteArrayOutputStream baos = new ByteArrayOutputStream();
		if (!ImageIO.write(image, "png", baos)) {
			throw new IOException("PNG writer is not available.");
		}

		return Base64.getEncoder().encodeToString(baos.toByteArray());
	}
%>

<%
	String filePath = request.getParameter("filePath");
	String errorMessage = "";
	String fileName = "";
	long fileSizeBytes = 0;
	int usedChunkBytes = 0;

	List<String> qrBase64Images = new ArrayList<String>();

	if (filePath != null && !filePath.trim().isEmpty()) {
		try {
			File targetFile = new File(filePath);
			if (!targetFile.exists() || !targetFile.isFile()) {
				throw new Exception("지정된 경로에서 파일을 찾을 수 없습니다.");
			}

			fileName = sanitizeFileName(targetFile.getName());
			fileSizeBytes = targetFile.length();

			byte[] fileBytes = Files.readAllBytes(targetFile.toPath());

			usedChunkBytes = calculateFileChunkBytes(fileName, fileBytes.length);
			int totalChunks = (fileBytes.length + usedChunkBytes - 1) / usedChunkBytes;

			for (int i = 0; i < totalChunks; i++) {
				int start = i * usedChunkBytes;
				int end = Math.min(start + usedChunkBytes, fileBytes.length);
				byte[] chunk = sliceBytes(fileBytes, start, end);

				String qrText = buildFileV2Payload(fileName, i + 1, totalChunks, chunk);
				if (qrText.length() > MAX_QR_TEXT_CHARS) {
					throw new Exception("QR payload가 너무 큽니다: " + qrText.length() + " chars");
				}
				qrBase64Images.add(generateQRCodeBase64(qrText, QR_IMAGE_SIZE));
			}
		} catch (Exception e) {
			errorMessage = escapeHtml(e.getMessage());
			qrBase64Images.clear();
		}
	}
%>

<!DOCTYPE html>
<html lang="ko">
<head>
	<meta charset="UTF-8">
	<title>FILE:V2 QR 송신기</title>
	<style>
		body { font-family: sans-serif; padding: 20px; background-color: #f4f4f4; margin: 0; text-align: center;}
		.container { max-width: 900px; margin: 0 auto; background: white; padding: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1); border-radius: 8px;}
		input[type="text"] { width: 100%; padding: 10px; box-sizing: border-box; margin-bottom: 10px; font-family: monospace; }
		button { padding: 10px 20px; font-size: 16px; cursor: pointer; background-color: #0056b3; color: white; border: none; border-radius: 4px;}
		.error-msg { color: red; font-weight: bold; margin-top: 10px; }
		.player-area { text-align: center; margin-top: 30px; border: 2px solid #333; padding: 20px; background-color: #fff;}
		#qrImage { border: 8px solid #000; display: inline-block; max-width: 100%; height: auto; }
		.controls { margin-top: 20px; }
		.controls button { background-color: #333; margin: 0 5px; }
		.status { font-size: 20px; font-weight: bold; margin-top: 10px; }
		.file-info { background: #e9ecef; padding: 10px; margin-top: 20px; text-align: left; }
	</style>
</head>
<body>
	<div class="container">
		<h2>FILE:V2 Base45 대용량 QR 송신기</h2>
		<form method="post" action="">
			<label style="display:block; text-align:left; font-weight:bold; margin-bottom:5px;">서버 내 파일 절대 경로 입력</label>
			<input type="text" name="filePath" value="<%= escapeHtml(filePath) %>" placeholder="C:\temp\sample.pptx">
			<button type="submit">QR 스트림 생성</button>
		</form>

		<% if (!errorMessage.isEmpty()) { %>
			<div class="error-msg">오류 발생: <%= errorMessage %></div>
		<% } %>

		<% if (!qrBase64Images.isEmpty()) { %>
			<div class="file-info">
				<strong>파일명:</strong> <%= escapeHtml(fileName) %><br>
				<strong>파일 크기:</strong> <%= fileSizeBytes %> bytes<br>
				<strong>payload 형식:</strong> FILE:V2 / Base45<br>
				<strong>총 생성 프레임:</strong> <%= qrBase64Images.size() %>장<br>
				<strong>QR 이미지:</strong> <%= QR_IMAGE_SIZE %>px /
				<strong>chunk:</strong> <%= usedChunkBytes %> bytes /
				<strong>QR 최대 payload:</strong> <%= MAX_QR_TEXT_CHARS %> chars
			</div>

			<div class="player-area">
				<img id="qrImage" src="" alt="QR Stream" width="<%= QR_IMAGE_SIZE %>" height="<%= QR_IMAGE_SIZE %>" />
				<div class="status" id="frameStatus">준비됨</div>

				<div class="controls">
					<button onclick="startPlay()" type="button">▶ 재생</button>
					<button onclick="stopPlay()" type="button">⏸ 일시정지</button>
					<button onclick="resetPlay()" type="button">⏹ 처음으로</button>
				</div>
			</div>

			<script>
				var qrFrames = [
					<% for(int i = 0; i < qrBase64Images.size(); i++) { %>
						"data:image/png;base64,<%=qrBase64Images.get(i)%>"<%= i < qrBase64Images.size() - 1 ? "," : "" %>
					<% } %>
				];

				var currentIndex = 0;
				var playInterval = null;
				var imgElement = document.getElementById("qrImage");
				var statusElement = document.getElementById("frameStatus");

				if(qrFrames.length > 0) {
					imgElement.src = qrFrames[0];
					updateStatus();
				}

				function updateStatus() {
					statusElement.innerText = (currentIndex + 1) + " / " + qrFrames.length + " 프레임";
				}

				function nextFrame() {
					currentIndex++;
					if (currentIndex >= qrFrames.length) {
						currentIndex = 0;
					}
					imgElement.src = qrFrames[currentIndex];
					updateStatus();
				}

				function startPlay() {
					if (playInterval) clearInterval(playInterval);
					playInterval = setInterval(nextFrame, 150);
				}

				function stopPlay() {
					if (playInterval) clearInterval(playInterval);
					playInterval = null;
				}

				function resetPlay() {
					stopPlay();
					currentIndex = 0;
					imgElement.src = qrFrames[0];
					updateStatus();
				}
			</script>
		<% } %>
	</div>
</body>
</html>
