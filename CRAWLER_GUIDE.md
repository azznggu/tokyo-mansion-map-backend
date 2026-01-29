# 크롤러 사용 가이드

## 🚀 빠른 시작

### 1. 환경 변수 설정

`backend/.env` 파일에 Supabase 정보를 설정하세요:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### 2. 패키지 설치

```bash
cd backend
npm install
```

### 3. 크롤러 실행

```bash
npm run crawl
```

## ⚙️ 환경 변수 옵션

`.env` 파일에 다음 옵션을 추가할 수 있습니다:

```bash
# 크롤링할 최대 페이지 수 (기본값: 3)
CRAWL_MAX_PAGES=5

# Supabase에 저장 여부 (기본값: true)
# false로 설정하면 JSON 파일만 저장됩니다
SAVE_TO_DB=true
```

## 📊 크롤러 동작 방식

1. **크롤링**: SUUMO 웹사이트에서 신축맨션 정보 수집
2. **지오코딩**: 주소를 좌표로 변환 (OpenStreetMap Nominatim 사용)
3. **JSON 저장**: 백업용으로 `backend/src/data/crawledMansions.json`에 저장
4. **DB 저장**: Supabase 데이터베이스에 저장
   - 중복 체크: `source_url`로 기존 데이터 확인
   - 기존 데이터가 있으면 업데이트, 없으면 새로 삽입

## ⚠️ 주의사항

### 1. SUUMO 이용약관 준수

크롤링 전에 SUUMO의 이용약관 및 robots.txt를 확인하세요:
- https://suumo.jp/robots.txt
- 과도한 요청은 IP 차단될 수 있습니다
- 크롤러는 요청 사이에 2초 딜레이를 두고 있습니다

### 2. Rate Limiting

- 페이지 크롤링: 페이지당 2초 대기
- 지오코딩: 요청당 1초 대기
- DB 저장: 요청당 0.1초 대기

### 3. 지오코딩 API 제한

OpenStreetMap Nominatim API는 다음과 같은 제한이 있습니다:
- 초당 1회 요청 권장
- 과도한 요청 시 일시적으로 차단될 수 있습니다

## 🔍 문제 해결

### "Supabase 환경 변수가 설정되지 않았습니다"

- `backend/.env` 파일에 `SUPABASE_URL`과 `SUPABASE_ANON_KEY`를 설정하세요
- 또는 `SAVE_TO_DB=false`로 설정하여 JSON 파일만 저장할 수 있습니다

### "Error inserting mansion"

- Supabase 테이블이 생성되었는지 확인하세요
- `DATABASE_SETUP.md`를 참고하여 테이블을 생성하세요
- Supabase 인증 정보가 올바른지 확인하세요

### 지오코딩 실패

- 일부 주소는 지오코딩이 실패할 수 있습니다
- 좌표가 0인 경우 수동으로 수정해야 할 수 있습니다

## 📝 데이터 확인

### Supabase에서 확인

1. Supabase 대시보드에서 **Table Editor**로 이동
2. `mansions` 테이블에서 데이터 확인
3. `station_accesses` 테이블에서 역 접근 정보 확인

### JSON 파일에서 확인

```bash
cat backend/src/data/crawledMansions.json
```

## 🔄 데이터 업데이트

크롤러는 `source_url`을 기준으로 중복을 체크합니다:
- 같은 `source_url`이 있으면 기존 데이터를 업데이트
- 없으면 새로 삽입

따라서 같은 크롤러를 여러 번 실행해도 중복 데이터가 생성되지 않습니다.

## 📈 크롤링 성능

- **페이지당 약 30-60초** 소요 (페이지당 맨션 수와 지오코딩 시간에 따라 다름)
- **3페이지 크롤링**: 약 2-3분 소요
- **5페이지 크롤링**: 약 4-6분 소요

## 🛠️ 고급 사용법

### 특정 페이지만 크롤링

크롤러 코드를 수정하여 특정 URL부터 시작할 수 있습니다:

```typescript
// src/crawler/index.ts 수정
const mansions = await crawlSuumoMansions(3, 'https://suumo.jp/ms/shinchiku/tokyo/?page=2');
```

### 크롤링 결과 필터링

크롤링 후 데이터를 필터링하려면 `src/crawler/index.ts`를 수정하세요.
