# Puppeteer 설정 가이드

## 문제: 크롤링 결과가 0건

SUUMO 페이지가 JavaScript로 동적으로 콘텐츠를 로드하기 때문에, Puppeteer를 사용하여 실제 브라우저로 페이지를 로드해야 합니다.

## 해결 방법

### 1. Chrome 설치 확인

Puppeteer는 Chrome 또는 Chromium이 필요합니다.

**macOS:**
- [Google Chrome](https://www.google.com/chrome/) 설치
- 기본 경로: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get install -y google-chrome-stable

# 또는 Chromium
sudo apt-get install -y chromium-browser
```

**Windows:**
- [Google Chrome](https://www.google.com/chrome/) 설치
- 기본 경로: `C:\Program Files\Google\Chrome\Application\chrome.exe`

### 2. 환경 변수 설정 (선택사항)

Chrome 경로를 수동으로 지정하려면:

```bash
# macOS
export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Linux
export PUPPETEER_EXECUTABLE_PATH="/usr/bin/google-chrome"

# Windows (PowerShell)
$env:PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
```

또는 `backend/.env` 파일에 추가:
```
PUPPETEER_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

### 3. 크롤러 실행

```bash
npm run crawl
```

## 문제 해결

### "Chrome을 찾을 수 없습니다" 오류

1. Chrome이 설치되어 있는지 확인
2. `PUPPETEER_EXECUTABLE_PATH` 환경 변수 설정
3. Chrome 경로가 올바른지 확인

### "executable doesn't exist" 오류

Chrome 경로가 잘못되었습니다. 올바른 경로를 확인하세요:

**macOS:**
```bash
ls -la "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

**Linux:**
```bash
which google-chrome
# 또는
which chromium-browser
```

### 성능 문제

Puppeteer는 브라우저를 실행하므로 상대적으로 느립니다:
- 페이지당 약 5-10초 소요
- 메모리 사용량 증가

이는 정상입니다. JavaScript로 동적 로드되는 페이지를 크롤링하는 데 필요한 비용입니다.

## 대안: API 사용

SUUMO에 공식 API가 있다면 API를 사용하는 것이 더 효율적입니다. 하지만 일반적으로 부동산 사이트는 API를 제공하지 않습니다.

## 참고

- Puppeteer는 실제 브라우저를 실행하므로 리소스를 많이 사용합니다
- 크롤링 시 SUUMO 이용약관을 준수하세요
- Rate limiting을 준수하여 서버에 부하를 주지 마세요
