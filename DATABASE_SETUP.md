# Supabase 데이터베이스 테이블 생성 가이드

## 🚀 빠른 시작 (3단계)

### 1단계: Supabase 대시보드 열기

1. [Supabase](https://supabase.com)에 로그인
2. 프로젝트 선택
3. 왼쪽 메뉴에서 **SQL Editor** 클릭

### 2단계: 스키마 파일 복사

`backend/database/schema.sql` 파일을 열어서 **전체 내용**을 복사하세요.

### 3단계: SQL 실행

1. Supabase SQL Editor에서 **New query** 버튼 클릭
2. 복사한 SQL을 붙여넣기
3. **RUN** 버튼 클릭 (또는 `Cmd/Ctrl + Enter`)

## ✅ 확인

테이블이 생성되었는지 확인:

1. 왼쪽 메뉴에서 **Table Editor** 클릭
2. 다음 테이블들이 보이는지 확인:
   - `mansions` - 맨션 정보 테이블
   - `station_accesses` - 역 접근 정보 테이블

**참고:** `spatial_ref_sys`, `geometry_columns` 등의 PostGIS 시스템 테이블도 보일 수 있습니다. 이들은 PostGIS 확장 프로그램이 자동으로 생성하는 테이블이므로 무시해도 됩니다.

## ⚠️ PostGIS 확장 프로그램

PostGIS가 자동으로 활성화되지 않는 경우:

1. **Database** > **Extensions** 메뉴로 이동
2. `postgis` 검색
3. **Enable** 버튼 클릭

또는 SQL Editor에서 다음 명령 실행:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

## 📝 다음 단계

테이블이 생성되면:

1. 환경 변수 설정 (`backend/.env`):
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   ```

2. 데이터 수집 및 저장 (크롤러 실행 또는 수동 입력)

## 🆘 문제 해결

### "relation already exists" 오류
- 테이블이 이미 존재합니다. 정상입니다.

### PostGIS 관련 오류
- Extensions 메뉴에서 PostGIS를 활성화하세요.

### 권한 오류
- Supabase 프로젝트의 소유자인지 확인하세요.

### `spatial_ref_sys` 테이블 RLS 경고
- 이 경고는 **무시해도 됩니다**
- `spatial_ref_sys`는 PostGIS 시스템 테이블로, RLS를 활성화할 필요가 없습니다
- 경고 팝업을 닫기만 하면 됩니다
