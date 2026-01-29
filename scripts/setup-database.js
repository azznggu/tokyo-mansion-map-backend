/**
 * Supabase 데이터베이스 스키마 설정 스크립트
 * 
 * 사용법:
 * 1. backend/.env 파일에 SUPABASE_URL과 SUPABASE_ANON_KEY를 설정하세요
 * 2. node scripts/setup-database.js 실행
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 환경 변수가 설정되지 않았습니다.');
    console.error('backend/.env 파일에 다음을 설정하세요:');
    console.error('  SUPABASE_URL=https://your-project.supabase.co');
    console.error('  SUPABASE_ANON_KEY=your-anon-key-here');
    process.exit(1);
  }

  console.log('📡 Supabase에 연결 중...');
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 스키마 파일 읽기
  const schemaPath = path.join(__dirname, '../database/schema.sql');
  const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');

  console.log('📝 스키마 파일을 읽었습니다.');
  console.log('⚠️  Supabase SQL Editor에서 직접 실행하는 것을 권장합니다.');
  console.log('⚠️  이 스크립트는 Supabase REST API의 제한으로 인해 일부 기능이 작동하지 않을 수 있습니다.\n');

  // SQL을 세미콜론으로 분리 (간단한 파싱)
  const statements = schemaSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📊 ${statements.length}개의 SQL 문을 실행합니다...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    
    // 빈 문장이나 주석만 있는 경우 스킵
    if (!statement || statement.length < 10) {
      continue;
    }

    try {
      // Supabase는 직접 SQL 실행을 지원하지 않으므로
      // RPC 함수나 테이블 생성은 대시보드에서 해야 합니다
      console.log(`⚠️  문장 ${i + 1}/${statements.length}: Supabase 대시보드에서 직접 실행해야 합니다.`);
      console.log(`   ${statement.substring(0, 100)}...\n`);
    } catch (error) {
      console.error(`❌ 문장 ${i + 1} 실행 실패:`, error.message);
      errorCount++;
    }
  }

  console.log('\n✅ 스크립트 실행 완료');
  console.log(`   성공: ${successCount}, 실패: ${errorCount}`);
  console.log('\n💡 권장 사항: Supabase 대시보드의 SQL Editor에서 schema.sql 파일을 직접 실행하세요.');
}

setupDatabase().catch(console.error);
