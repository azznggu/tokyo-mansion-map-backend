# Supabase 데이터베이스 설정 가이드

## 방법 1: Supabase 대시보드에서 직접 실행 (권장)

1. [Supabase](https://supabase.com)에 로그인하고 프로젝트를 선택합니다.

2. 왼쪽 메뉴에서 **SQL Editor**를 클릭합니다.

3. **New query** 버튼을 클릭합니다.

4. `backend/database/schema.sql` 파일의 전체 내용을 복사합니다.

5. SQL Editor에 붙여넣고 **RUN** 버튼을 클릭합니다.

6. 성공 메시지가 표시되면 완료입니다!

## 방법 2: Supabase CLI 사용

```bash
# Supabase CLI 설치 (아직 설치하지 않은 경우)
npm install -g supabase

# Supabase에 로그인
supabase login

# 프로젝트 연결
supabase link --project-ref your-project-ref

# 스키마 실행
supabase db push --file database/schema.sql
```

## PostGIS 확장 프로그램 활성화

PostGIS 확장 프로그램이 자동으로 활성화되지 않는 경우:

1. Supabase 대시보드에서 **Database** > **Extensions**로 이동합니다.
2. **postgis**를 검색하고 활성화합니다.

또는 SQL Editor에서 다음 명령을 실행합니다:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

## 확인

테이블이 생성되었는지 확인하려면:

1. Supabase 대시보드에서 **Table Editor**로 이동합니다.
2. `mansions`와 `station_accesses` 테이블이 보이는지 확인합니다.
