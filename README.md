# Tokyo New Mansion Map - Backend

도쿄 신축맨션 검색 웹 애플리케이션의 백엔드 API입니다.

## 기술 스택

- **Node.js** + **TypeScript**
- **Netlify Functions** - Serverless 함수
- **Cheerio** + **Axios** - 웹 크롤링
- **Supabase** - PostgreSQL 데이터베이스 (권장)

## 프로젝트 구조

```
backend/
├── netlify/
│   └── functions/       # Netlify 서버리스 함수
│       ├── mansions.ts  # 맨션 목록 API
│       └── mansions-bounds.ts # 지도 영역 내 맨션 API
├── src/
│   ├── crawler/         # SUUMO 크롤러
│   ├── data/            # 목업 데이터
│   ├── types/           # TypeScript 타입 정의
│   └── utils/           # 유틸리티 함수
├── database/
│   └── schema.sql       # Supabase 데이터베이스 스키마
└── netlify.toml         # Netlify 설정
```

## API 엔드포인트

### GET `/mansions`

맨션 목록 조회

**Query Parameters:**
- `page` (number): 페이지 번호 (기본값: 1)
- `pageSize` (number): 페이지 크기 (기본값: 20)
- `priceMin` (number): 최소 가격 (만엔)
- `priceMax` (number): 최대 가격 (만엔)
- `areaMin` (number): 최소 면적 (m²)
- `areaMax` (number): 최대 면적 (m²)
- `layoutTypes` (string): 방 타입 (쉼표 구분)
- `walkMinutesMax` (number): 역 도보 최대 시간
- `ward` (string): 도쿄 구
- `neLat`, `neLng`, `swLat`, `swLng`: 지도 영역

### GET `/mansions-bounds`

지도 영역 내 맨션 조회 (모든 결과 반환)

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 추가하세요:

```bash
# Supabase 설정
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

**Supabase 인증 정보 확인 방법:**
1. [Supabase](https://supabase.com)에 로그인
2. 프로젝트 선택
3. Settings > API 메뉴로 이동
4. `Project URL`을 `SUPABASE_URL`에 복사
5. `anon public` 키를 `SUPABASE_ANON_KEY`에 복사

**참고:** 환경 변수가 설정되지 않은 경우, 목업 데이터를 사용합니다.

### 3. 로컬 개발 서버 실행

```bash
npm run dev
```

서버가 `http://localhost:8888`에서 실행됩니다.

## 크롤러 사용

**📖 자세한 가이드: [CRAWLER_GUIDE.md](./CRAWLER_GUIDE.md)**

### 빠른 시작

1. 환경 변수 설정 (`backend/.env`):
   ```bash
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   ```

2. 크롤러 실행:
   ```bash
   npm run crawl
   ```

크롤러는 자동으로:
- SUUMO에서 신축맨션 정보 크롤링
- 주소를 좌표로 변환 (지오코딩)
- JSON 파일로 백업 저장
- Supabase 데이터베이스에 저장

**⚠️ 주의**: SUUMO 이용약관 및 robots.txt를 확인하세요.

## 데이터베이스 설정 (Supabase)

### 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. 프로젝트가 생성될 때까지 대기 (약 2분 소요)

### 2. 데이터베이스 스키마 설정

**📖 자세한 가이드: [DATABASE_SETUP.md](./DATABASE_SETUP.md)**

간단한 방법:
1. Supabase 대시보드에서 **SQL Editor**로 이동
2. `database/schema.sql` 파일의 **전체 내용**을 복사
3. SQL Editor에 붙여넣고 **RUN** 버튼 클릭
4. 성공 메시지 확인 후 **Table Editor**에서 테이블 생성 확인

### 3. 데이터 수집

크롤러를 실행하여 데이터를 수집하고 데이터베이스에 저장하세요:

```bash
npm run crawl
```

**참고:** 크롤러는 현재 JSON 파일로 저장하도록 설정되어 있습니다. 데이터베이스에 직접 저장하려면 크롤러 코드를 수정해야 합니다.

### 4. 환경 변수 설정

`.env` 파일에 Supabase 연결 정보를 설정하세요 (위의 "환경 변수 설정" 섹션 참조).

## Netlify 배포

```bash
# Netlify CLI 설치 (전역)
npm install -g netlify-cli

# 배포
netlify deploy --prod
```

## 환경 변수 (Netlify)

Netlify 대시보드에서 다음 환경 변수를 설정하세요:

- `SUPABASE_URL`: Supabase 프로젝트 URL
- `SUPABASE_ANON_KEY`: Supabase 익명 키
