import { Handler } from '@netlify/functions';
import { crawlSuumoMansions } from '../../src/crawler/suumoScraper';
import { saveMansionsToDB } from '../../src/services/database';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

export const handler: Handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
    };
  }

  try {
    // 요청 파라미터 파싱
    let maxPages = 3;
    if (event.body) {
      try {
        const body = JSON.parse(event.body);
        if (body.maxPages && typeof body.maxPages === 'number') {
          maxPages = Math.min(body.maxPages, 10); // 최대 10페이지로 제한
        }
      } catch {
        // JSON 파싱 실패 시 기본값 사용
      }
    }

    console.log(`🚀 크롤링 시작 (최대 ${maxPages}페이지)...`);

    // 크롤링 실행
    const mansions = await crawlSuumoMansions(maxPages);

    console.log(`✅ 크롤링 완료: ${mansions.length}개 맨션 수집`);

    // DB에 저장
    console.log('💾 DB 저장 시작...');
    const saveResult = await saveMansionsToDB(mansions, (current, total) => {
      if (current % 10 === 0) {
        console.log(`   저장 진행: ${current}/${total}`);
      }
    });

    console.log(`✅ DB 저장 완료: 성공 ${saveResult.success}개, 실패 ${saveResult.failed}개`);

    // 지오코딩 성공률 계산
    const geocodedCount = mansions.filter(m => m.latitude && m.latitude !== 0).length;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '크롤링 완료',
        stats: {
          crawled: mansions.length,
          geocoded: geocodedCount,
          saved: saveResult.success,
          failed: saveResult.failed,
        },
        errors: saveResult.errors.slice(0, 5), // 처음 5개 에러만 반환
      }),
    };
  } catch (error: any) {
    console.error('크롤링 오류:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
};
