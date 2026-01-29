# 크롤러 디버깅 가이드

## 크롤링 결과가 0건인 경우

### 1. 디버깅 정보 확인

크롤러를 실행하면 다음과 같은 디버깅 정보가 출력됩니다:

```
📡 크롤링 시작 (최대 5페이지)...
Scraping page 1: https://suumo.jp/ms/shinchiku/tokyo/
  페이지 로드 완료. HTML 길이: XXXXX bytes
  선택자 ".cassettebox"로 X개 요소 발견
  파싱 완료: X개 맨션 발견
```

### 2. 가능한 원인

#### 원인 1: SUUMO 페이지 구조 변경
- SUUMO 웹사이트의 HTML 구조가 변경되었을 수 있습니다
- CSS 선택자가 더 이상 유효하지 않을 수 있습니다

**해결 방법:**
1. 브라우저에서 SUUMO 페이지 열기
2. 개발자 도구(F12)로 페이지 구조 확인
3. 실제 클래스명/선택자 확인
4. `suumoScraper.ts`의 선택자 수정

#### 원인 2: JavaScript 동적 로드
- SUUMO 페이지가 JavaScript로 동적으로 콘텐츠를 로드하는 경우
- `axios`로는 빈 HTML만 가져올 수 있습니다

**해결 방법:**
- Puppeteer를 사용하여 브라우저를 자동화해야 합니다
- `puppeteer-core` 패키지가 이미 설치되어 있으므로 구현 가능합니다

#### 원인 3: 접근 차단
- SUUMO가 봇 접근을 차단했을 수 있습니다
- User-Agent나 다른 헤더가 의심스러울 수 있습니다

**해결 방법:**
- User-Agent를 최신 브라우저로 업데이트
- 쿠키나 세션 관리 추가

### 3. 수동 확인 방법

#### 브라우저에서 확인

1. https://suumo.jp/ms/shinchiku/tokyo/ 접속
2. 개발자 도구 열기 (F12)
3. Elements 탭에서 맨션 목록 요소 확인
4. 클래스명이나 ID 확인

#### 크롤러 디버깅 모드

크롤러를 실행하면 HTML 샘플이 출력됩니다:
- 페이지 구조를 확인할 수 있습니다
- 어떤 선택자가 작동하는지 확인 가능

### 4. 임시 해결책: 목업 데이터 사용

크롤러가 작동하지 않는 경우, 목업 데이터를 사용할 수 있습니다:

```typescript
// src/crawler/index.ts에서
import { mockMansions } from '../data';

// 크롤링 대신 목업 데이터 사용
const mansions = mockMansions;
```

### 5. Puppeteer 구현 (고급)

JavaScript 동적 로드가 필요한 경우:

```typescript
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: await chromium.executablePath(),
});

const page = await browser.newPage();
await page.goto(url);
const html = await page.content();
// HTML 파싱...
```

### 6. SUUMO 이용약관 확인

크롤링 전에 반드시 확인:
- https://suumo.jp/ 이용약관
- https://suumo.jp/robots.txt

과도한 요청은 IP 차단될 수 있습니다.

## 다음 단계

1. 크롤러를 다시 실행하여 디버깅 정보 확인
2. 출력된 정보를 바탕으로 선택자 수정
3. 여전히 작동하지 않으면 Puppeteer 구현 고려
