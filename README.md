# FILE QR Decoder

폐쇄망 JSP에서 생성한 `FILE:` QR 스트림을 외부망 브라우저에서 수신해 파일로 복원하는 정적 디코더입니다.

## 지원 포맷

legacy 호환 포맷:

```text
FILE:<fileName>:<index>/<total>:<base64Chunk>
```

호환 v1 포맷:

```text
FILE:v1:<fileNameBase64Url>:<index>:<total>:<base64Chunk>
```

권장 V2 포맷:

```text
FILE:V2:<nameLength>:<fileNameBase45>:<index>:<total>:<base45Chunk>
```

V2는 Base45를 사용해 QR alphanumeric mode 용량을 더 많이 활용합니다.

## 로컬 테스트

```bash
npm test
npm run dev
npm run jsp:dev
```

`npm run dev`는 외부 패키지를 다운로드하지 않고 Node 내장 모듈만 사용합니다. 기본 주소는 `http://127.0.0.1:4173/`입니다.

`npm run jsp:dev`는 embedded Tomcat으로 JSP 송신기를 실행합니다. 기본 주소는 `http://127.0.0.1:8080/file-qr-sender.jsp`입니다. 로컬 테스트용 허용 디렉터리는 `jsp-test-files`이며, 서버 시작 시 `sample.txt`가 자동 생성됩니다.

## 브라우저 조건

- Android Chrome 권장
- 카메라 스캔은 HTTPS 또는 Chrome 로컬 테스트 환경 권장
- 디코더에서 누락 조각이 표시되면 폰 화면의 재전송 입력값을 보고 폐쇄망 PC의 JSP에 직접 입력합니다.
- 디코더는 100개 단위 수신 구간을 표시하고, 현재 수신 상태를 IndexedDB에 임시 저장합니다.

## 폐쇄망 JSP

JSP 아티팩트는 [artifacts/file-qr-sender.jsp](artifacts/file-qr-sender.jsp)에 있습니다.

폐쇄망 WAS에 ZXing core jar가 있어야 합니다.

```java
com.google.zxing:core
```

JSP는 서버 내 파일 절대 경로를 입력받아 파일 bytes를 Base45로 인코딩하고 QR 프레임으로 나눕니다. 출력은 `FILE:V2` 고정입니다.

전송 모드는 전체 전송, 100개 구간 전송, 누락 조각만 재전송을 지원합니다.

## 개인정보 처리

디코더는 정적 HTML/JS/CSS만 사용합니다. QR 수신, 조각 병합, 파일 다운로드 생성은 브라우저 안에서 처리하며 서버로 파일 내용을 전송하지 않습니다.
