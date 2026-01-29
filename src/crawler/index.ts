import { crawlSuumoMansions } from './suumoScraper';
import { saveMansionsToDB } from '../services/database';
import * as fs from 'fs';
import * as path from 'path';

// 환경 변수 로드 (dotenv가 설치되어 있으면 사용)
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config();
} catch (error) {
  // dotenv가 설치되지 않은 경우 무시 (환경 변수는 시스템에서 직접 설정 가능)
  console.warn('dotenv 패키지가 설치되지 않았습니다. 환경 변수를 시스템에서 직접 설정하세요.');
}

const OUTPUT_PATH = path.join(__dirname, '../data/crawledMansions.json');

async function main() {
  console.log('🚀 Starting SUUMO crawler...');
  console.log('⚠️  NOTE: 크롤링 전 SUUMO 이용약관 및 robots.txt를 확인하세요.\n');

  const maxPages = process.env.CRAWL_MAX_PAGES ? parseInt(process.env.CRAWL_MAX_PAGES) : 3;
  const saveToDB = process.env.SAVE_TO_DB !== 'false'; // 기본값: true

  try {
    // 크롤링 실행
    console.log(`📡 크롤링 시작 (최대 ${maxPages}페이지)...`);
    const mansions = await crawlSuumoMansions(maxPages);

    console.log(`\n✅ 크롤링 완료: ${mansions.length}개의 맨션 데이터 수집`);

    // JSON 파일로 저장 (백업용)
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(mansions, null, 2), 'utf-8');
    console.log(`💾 JSON 파일 저장 완료: ${OUTPUT_PATH}`);

    // Supabase에 저장
    if (saveToDB) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.warn('\n⚠️  Supabase 환경 변수가 설정되지 않았습니다.');
        console.warn('   JSON 파일만 저장되었습니다.');
        console.warn('   Supabase에 저장하려면 backend/.env 파일에 다음을 설정하세요:');
        console.warn('   SUPABASE_URL=https://your-project.supabase.co');
        console.warn('   SUPABASE_ANON_KEY=your-anon-key-here');
      } else {
        console.log('\n💾 Supabase에 데이터 저장 중...');
        const result = await saveMansionsToDB(mansions, (current, total) => {
          const percent = ((current / total) * 100).toFixed(1);
          process.stdout.write(`\r   진행률: ${current}/${total} (${percent}%)`);
        });
        console.log('\n');

        console.log(`✅ 저장 완료:`);
        console.log(`   성공: ${result.success}개`);
        console.log(`   실패: ${result.failed}개`);

        if (result.errors.length > 0) {
          console.log(`\n❌ 오류 발생:`);
          result.errors.slice(0, 5).forEach((error) => console.log(`   - ${error}`));
          if (result.errors.length > 5) {
            console.log(`   ... 외 ${result.errors.length - 5}개 오류`);
          }
        }
      }
    } else {
      console.log('\n⏭️  Supabase 저장 건너뜀 (SAVE_TO_DB=false)');
    }

    // 샘플 출력
    if (mansions.length > 0) {
      console.log('\n📋 샘플 데이터:');
      console.log(JSON.stringify(mansions[0], null, 2));
    }
  } catch (error) {
    console.error('\n❌ 크롤러 오류:', error);
    process.exit(1);
  }
}

main();

export { crawlSuumoMansions };
