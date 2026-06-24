# FILE QR Decoder

폐쇄망 JSP에서 생성한 `FILE:` QR 스트림을 외부망 브라우저에서 수신해 파일로 복원하는 정적 디코더입니다.

## 지원 포맷

첨부 JSP 호환 포맷:

```text
FILE:<fileName>:<index>/<total>:<base64Chunk>
```

권장 v1 포맷:

```text
FILE:v1:<fileNameBase64Url>:<index>:<total>:<base64Chunk>
```

v1은 파일명을 Base64URL로 감싸서 `:` 같은 문자가 들어간 파일명도 안전하게 처리합니다.

## 로컬 테스트

```bash
npm test
npm run dev
```

`npm run dev`는 외부 패키지를 다운로드하지 않고 Node 내장 모듈만 사용합니다. 기본 주소는 `http://127.0.0.1:4173/`입니다.

## 브라우저 조건

- Android Chrome 권장
- 카메라 스캔은 HTTPS 또는 Chrome 로컬 테스트 환경 권장
- `BarcodeDetector`가 없는 브라우저에서는 수동 입력으로 payload를 붙여넣어 테스트할 수 있습니다.

## 폐쇄망 JSP

JSP 아티팩트는 [artifacts/file-qr-sender.jsp](artifacts/file-qr-sender.jsp)에 있습니다.

폐쇄망 WAS에 ZXing core jar가 있어야 합니다.

```java
com.google.zxing:core
```

JSP는 서버 내 파일 절대 경로를 입력받아 파일 bytes를 Base64로 인코딩하고 QR 프레임으로 나눕니다. 기본 출력은 `FILE:v1`이며 legacy 형식도 선택할 수 있습니다.

보안을 위해 JSP는 허용 디렉터리 안의 파일만 읽습니다. WAS `web.xml` context-param `FILE_QR_BASE_DIR` 또는 JVM system property `fileQr.baseDir` 중 하나를 설정해야 합니다.

```xml
<context-param>
  <param-name>FILE_QR_BASE_DIR</param-name>
  <param-value>C:\approved-transfer</param-value>
</context-param>
```

허용 디렉터리가 비어 있거나 요청 파일이 그 밖에 있으면 JSP는 파일을 읽지 않습니다.

## 개인정보 처리

디코더는 정적 HTML/JS/CSS만 사용합니다. QR 수신, 조각 병합, 파일 다운로드 생성은 브라우저 안에서 처리하며 서버로 파일 내용을 전송하지 않습니다.
