# 문제 해결 가이드

## TypeScript 컴파일 오류

### "Property 'walk_minutes' does not exist" 오류

이 오류가 계속 발생하는 경우, TypeScript 캐시를 클리어하세요:

```bash
cd backend

# TypeScript 캐시 삭제
rm -rf node_modules/.cache
rm -rf dist

# 다시 빌드
npm run build

# 또는 크롤러 실행
npm run crawl
```

또는 `ts-node` 캐시를 클리어:

```bash
rm -rf node_modules/.ts-node
npm run crawl
```

## Supabase 테이블 경고

### `spatial_ref_sys` 테이블 RLS 경고

**이 경고는 무시해도 됩니다!**

`spatial_ref_sys`는 PostGIS 확장 프로그램이 자동으로 생성하는 **시스템 테이블**입니다:
- PostGIS의 공간 참조 시스템 정보를 저장
- 애플리케이션에서 직접 사용하지 않음
- RLS를 활성화할 필요가 없음

**해결 방법:**
1. 경고 팝업을 닫기만 하면 됩니다
2. 또는 Supabase 대시보드에서 이 테이블을 숨길 수 있습니다 (Table Editor에서 필터링)

### 다른 시스템 테이블들

다음 테이블들도 PostGIS 시스템 테이블이므로 RLS를 활성화할 필요가 없습니다:
- `spatial_ref_sys`
- `geometry_columns`
- `geography_columns`

## 일반적인 문제

### 1. 환경 변수가 로드되지 않음

**증상:** `Supabase credentials are not configured` 오류

**해결:**
- `backend/.env` 파일이 존재하는지 확인
- 환경 변수 이름이 정확한지 확인 (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
- `.env` 파일이 `.gitignore`에 포함되어 있는지 확인 (보안)

### 2. Supabase 연결 실패

**증상:** `Error fetching mansions from database` 오류

**해결:**
- Supabase 프로젝트가 활성화되어 있는지 확인
- `SUPABASE_URL`과 `SUPABASE_ANON_KEY`가 올바른지 확인
- Supabase 대시보드에서 API 키 확인 (Settings > API)

### 3. 테이블이 존재하지 않음

**증상:** `relation "mansions" does not exist` 오류

**해결:**
- `DATABASE_SETUP.md`를 참고하여 테이블 생성
- SQL Editor에서 `schema.sql` 실행

### 4. 크롤러가 너무 느림

**원인:**
- 지오코딩 API 제한
- 네트워크 지연

**해결:**
- `CRAWL_MAX_PAGES` 환경 변수로 페이지 수 제한
- 또는 지오코딩 단계를 건너뛰고 나중에 수동으로 좌표 입력

## 디버깅 팁

### 로그 확인

크롤러 실행 시 상세한 로그가 출력됩니다:
- 크롤링 진행 상황
- 지오코딩 결과
- 데이터베이스 저장 결과

### Supabase 로그 확인

1. Supabase 대시보드 > Logs
2. API 요청 및 오류 확인

### TypeScript 타입 체크

```bash
npm run build
```

빌드가 성공하면 타입 오류가 없는 것입니다.
