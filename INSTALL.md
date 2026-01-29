# 패키지 설치 가이드

## 문제 해결

크롤러 실행 시 `Cannot find module 'dotenv'` 오류가 발생하는 경우:

### 해결 방법

터미널에서 다음 명령을 실행하세요:

```bash
cd backend
npm install
```

이 명령은 `package.json`에 정의된 모든 패키지를 설치합니다.

### 설치 후 확인

설치가 완료되면 다음 파일들이 생성됩니다:
- `backend/node_modules/` 디렉토리
- `backend/package-lock.json` 파일

### 대안: 환경 변수 직접 설정

`dotenv` 패키지 없이도 환경 변수를 직접 설정할 수 있습니다:

**macOS/Linux:**
```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your-anon-key-here
npm run crawl
```

**Windows (PowerShell):**
```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY="your-anon-key-here"
npm run crawl
```

**Windows (CMD):**
```cmd
set SUPABASE_URL=https://your-project.supabase.co
set SUPABASE_ANON_KEY=your-anon-key-here
npm run crawl
```

## 설치할 패키지 목록

- `@supabase/supabase-js`: Supabase 클라이언트
- `dotenv`: 환경 변수 로드
- `axios`: HTTP 요청
- `cheerio`: HTML 파싱
- 기타 의존성들

## 문제가 계속되는 경우

1. `node_modules` 디렉토리 삭제 후 재설치:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. npm 캐시 클리어:
   ```bash
   npm cache clean --force
   npm install
   ```

3. Node.js 버전 확인 (권장: v18 이상):
   ```bash
   node --version
   ```
