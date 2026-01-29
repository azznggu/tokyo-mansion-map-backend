import * as cheerio from 'cheerio';
import axios from 'axios';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { Mansion, StationAccess } from '../types';

// SUUMO 신축맨션 목록 페이지 URL
const SUUMO_BASE_URL = 'https://suumo.jp';
const SUUMO_TOKYO_NEW_MANSION = '/ms/shinchiku/tokyo/';

interface ScrapeResult {
  mansions: Partial<Mansion>[];
  nextPageUrl: string | null;
}

interface MansionBasicInfo {
  name: string;
  price: string;
  access: string;
  sourceUrl: string;
  thumbnailUrl: string;
}

// 가격 문자열 파싱 (예: "5,980万円" -> 5980, "1億7380万円" -> 17380)
const parsePrice = (priceStr: string): number => {
  if (!priceStr) return 0;

  const okuMatch = priceStr.match(/([0-9,]+)億/);
  const manMatch = priceStr.match(/([0-9,]+)万/);

  let total = 0;

  if (okuMatch) {
    total += parseInt(okuMatch[1].replace(/,/g, ''), 10) * 10000;
  }

  if (manMatch) {
    total += parseInt(manMatch[1].replace(/,/g, ''), 10);
  }

  return total;
};

// 교통 정보 파싱 (예: "都営大江戸線/勝どき 徒歩15分")
const parseStationAccess = (accessStr: string): StationAccess[] => {
  const stations: StationAccess[] = [];

  // 패턴: "노선/역명 徒歩N分" 또는 "노선「역명」駅 徒歩N分"
  const patterns = [
    /(.+?)\/(.+?)\s+徒歩(\d+)分/g,
    /(.+?)\s*[「『](.+?)[」』]駅\s*徒歩(\d+)分/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(accessStr)) !== null) {
      stations.push({
        lineName: match[1].trim(),
        stationName: match[2].trim(),
        walkMinutes: parseInt(match[3], 10),
      });
    }
  }

  return stations;
};

// 맨션 ID 생성
const generateId = (name: string, sourceUrl: string): string => {
  const str = `${name}-${sourceUrl}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

// 브라우저 인스턴스 생성 (재사용을 위해 분리)
let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

const getBrowser = async () => {
  if (browserInstance) return browserInstance;

  const isLocal = process.env.NODE_ENV !== 'production' && !process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isLocal) {
    const possibleChromePaths = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
    ].filter(Boolean) as string[];

    for (const chromePath of possibleChromePaths) {
      try {
        browserInstance = await puppeteer.launch({
          headless: true,
          executablePath: chromePath,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        console.log(`✓ Chrome 경로: ${chromePath}`);
        return browserInstance;
      } catch {
        continue;
      }
    }
    throw new Error('Chrome을 찾을 수 없습니다.');
  } else {
    const headlessValue = chromium.headless === 'chrome-headless-shell' ? true : (chromium.headless === true);
    browserInstance = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: headlessValue,
    });
    return browserInstance;
  }
};

const closeBrowser = async () => {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
};

// Puppeteer로 페이지 로드
const loadPageWithPuppeteer = async (url: string): Promise<string> => {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 1500));

    const html = await page.content();
    return html;
  } finally {
    await page.close();
  }
};

// 목록 페이지에서 기본 정보 추출
export const scrapeSuumoListPage = async (url: string): Promise<ScrapeResult> => {
  const mansionInfos: MansionBasicInfo[] = [];

  try {
    const html = await loadPageWithPuppeteer(url);
    const $ = cheerio.load(html);

    console.log(`  페이지 로드 완료. HTML: ${html.length} bytes`);

    // a.propertybox 선택자로 맨션 카드 찾기
    const propertyLinks = $('a.propertybox');
    console.log(`  a.propertybox 요소: ${propertyLinks.length}개`);

    propertyLinks.each((_, element) => {
      try {
        const $el = $(element);

        // 링크 URL
        const href = $el.attr('href') || '';
        if (!href || !href.includes('/ms/shinchiku/')) return;

        const sourceUrl = href.startsWith('http') ? href : `${SUUMO_BASE_URL}${href}`;

        // 맨션 이름 (.propertybox-title에서 추출)
        const titleEl = $el.find('.propertybox-title');
        let name = titleEl.text().trim();
        // NEW 라벨 제거
        name = name.replace(/^NEW\s*/i, '').trim();

        // 가격 (.propertybox-emphasize에서 추출)
        const price = $el.find('.propertybox-emphasize').text().trim();

        // 교통 정보 (.propertybox-desc에서 추출)
        const access = $el.find('.propertybox-desc').text().trim();

        // 썸네일 이미지
        const thumbnailUrl = $el.find('img').first().attr('src') || '';

        if (name && name.length > 2) {
          mansionInfos.push({
            name,
            price,
            access,
            sourceUrl,
            thumbnailUrl,
          });
        }
      } catch (err) {
        console.error('  요소 파싱 오류:', err);
      }
    });

    // 중복 제거 (같은 URL)
    const uniqueInfos = mansionInfos.filter((info, index, self) =>
      index === self.findIndex(t => t.sourceUrl === info.sourceUrl)
    );

    console.log(`  기본 정보 추출: ${uniqueInfos.length}개 (중복 제거 후)`);

    // 다음 페이지 URL
    const nextPageLink = $('a[href*="page="]').filter((_, el) => {
      return $(el).text().includes('次へ') || $(el).hasClass('pagination_set-next');
    }).first().attr('href');

    const nextPageUrl = nextPageLink ?
      (nextPageLink.startsWith('http') ? nextPageLink : `${SUUMO_BASE_URL}${nextPageLink}`) :
      null;

    // 상세 페이지에서 추가 정보 가져오기
    const mansions: Partial<Mansion>[] = [];

    for (let i = 0; i < uniqueInfos.length; i++) {
      const info = uniqueInfos[i];
      console.log(`  [${i + 1}/${uniqueInfos.length}] 상세 정보 크롤링: ${info.name}`);

      try {
        const detailData = await scrapeDetailPage(info.sourceUrl);

        // 가격 파싱
        const priceValue = parsePrice(info.price);
        const priceUnit: '万円' | '億円' = priceValue >= 10000 ? '億円' : '万円';

        // 교통 정보 파싱
        const stations = parseStationAccess(info.access);
        if (stations.length === 0 && detailData.access) {
          stations.push(...parseStationAccess(detailData.access));
        }

        // 주소가 없으면 역 정보로 대체 (지오코딩용)
        const address = detailData.address || `東京都 ${info.access.split('/')[1]?.split(' ')[0] || ''}`;

        mansions.push({
          id: generateId(info.name, info.sourceUrl),
          name: info.name,
          nameJa: info.name,
          address: address,
          addressJa: address,
          ward: detailData.ward || extractWard(address),
          latitude: 0,
          longitude: 0,
          priceMin: priceValue,
          priceMax: priceValue,
          priceUnit,
          areaMin: detailData.areaMin || 0,
          areaMax: detailData.areaMax || 0,
          layoutTypes: detailData.layoutTypes || [],
          totalUnits: detailData.totalUnits || 0,
          floors: detailData.floors || 0,
          completion: detailData.completion || '',
          developer: detailData.developer || '',
          stations,
          thumbnailUrl: info.thumbnailUrl,
          imageUrls: detailData.imageUrls || [],
          sourceUrl: info.sourceUrl,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err) {
        console.error(`  상세 페이지 오류 (${info.name}):`, err);
      }
    }

    return { mansions, nextPageUrl };
  } catch (error) {
    console.error('목록 페이지 스크래핑 오류:', error);
    return { mansions: [], nextPageUrl: null };
  }
};

// 구 이름 추출
const extractWard = (address: string): string => {
  const wardMatch = address.match(/(千代田|中央|港|新宿|文京|台東|墨田|江東|品川|目黒|大田|世田谷|渋谷|中野|杉並|豊島|北|荒川|板橋|練馬|足立|葛飾|江戸川)区/);
  return wardMatch ? `${wardMatch[1]}区` : '';
};

// 상세 페이지에서 추가 정보 추출
interface DetailData {
  address: string;
  ward: string;
  areaMin: number;
  areaMax: number;
  layoutTypes: string[];
  totalUnits: number;
  floors: number;
  completion: string;
  developer: string;
  access: string;
  imageUrls: string[];
}

const scrapeDetailPage = async (url: string): Promise<DetailData> => {
  const result: DetailData = {
    address: '',
    ward: '',
    areaMin: 0,
    areaMax: 0,
    layoutTypes: [],
    totalUnits: 0,
    floors: 0,
    completion: '',
    developer: '',
    access: '',
    imageUrls: [],
  };

  try {
    const html = await loadPageWithPuppeteer(url);
    const $ = cheerio.load(html);

    // GTM 스크립트에서 데이터 추출 시도 (가장 정확한 정보)
    const scriptContent = $('script').filter((_, el) => {
      return $(el).html()?.includes('gapSuumoPcForKr') || false;
    }).first().html() || '';

    if (scriptContent) {
      try {
        // gapSuumoPcForKr 객체 추출
        const match = scriptContent.match(/gapSuumoPcForKr\s*=\s*\[([\s\S]*?)\];/);
        if (match) {
          // JSON 파싱을 위한 정리
          let jsonStr = match[1].trim();
          // JavaScript 객체를 JSON으로 변환 (키에 따옴표 추가)
          jsonStr = jsonStr.replace(/(\w+)\s*:/g, '"$1":');
          jsonStr = jsonStr.replace(/'/g, '"');

          const data = JSON.parse(`[${jsonStr}]`)[0];

          if (data) {
            // 주소
            result.address = `東京都${data.todofukenNm || ''}${data.shikugunNm || ''}`;
            result.ward = data.shikugunNm || '';

            // 면적
            if (data.senyuMensekiDisp && data.senyuMensekiDisp[0]) {
              const areas = data.senyuMensekiDisp.map((a: string) => parseFloat(a) || 0).filter((a: number) => a > 0);
              result.areaMin = Math.min(...areas) || 0;
              result.areaMax = Math.max(...areas) || 0;
            }

            // 간취り
            if (data.madoriDisp) {
              result.layoutTypes = data.madoriDisp.filter((m: string) => m && m.length > 0);
            }

            // 총 세대수
            if (data.soKukakusuDisp) {
              result.totalUnits = parseInt(data.soKukakusuDisp, 10) || 0;
            }

            // 완공 예정
            if (data.kanseiDateDisp) {
              const year = data.kanseiDateDisp.substring(0, 4);
              const month = data.kanseiDateDisp.substring(4, 6);
              result.completion = `${year}年${parseInt(month, 10)}月`;
            }

            // 교통 정보
            if (data.ensenNm1 && data.ekiNm1) {
              result.access = `${data.ensenNm1}/${data.ekiNm1} 徒歩${data.tohoJikan1 || '?'}分`;
            }
          }
        }
      } catch (parseErr) {
        console.log('    GTM 데이터 파싱 실패, HTML에서 추출 시도');
      }
    }

    // HTML에서 직접 추출 (GTM 실패 시 또는 보완)
    if (!result.address) {
      // 소재지 찾기
      $('th, dt').each((_, el) => {
        const label = $(el).text().trim();
        if (label.includes('所在地') || label.includes('住所')) {
          const value = $(el).next('td, dd').text().trim();
          if (value.includes('東京都')) {
            result.address = value.split('\n')[0].trim();
            result.ward = extractWard(result.address);
          }
        }
      });
    }

    // 면적 (HTML)
    if (result.areaMin === 0) {
      const areaMatches = $('body').text().match(/([0-9.]+)\s*m²/g) || [];
      const areas = areaMatches.map(m => parseFloat(m) || 0).filter(a => a > 20 && a < 500);
      if (areas.length > 0) {
        result.areaMin = Math.min(...areas);
        result.areaMax = Math.max(...areas);
      }
    }

    // 간취り (HTML)
    if (result.layoutTypes.length === 0) {
      const layoutMatches = $('body').text().match(/[1-4][SLDK]+/g) || [];
      result.layoutTypes = [...new Set(layoutMatches)];
    }

    // 이미지 URL
    $('img[src*="suumo.com"]').each((_, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('bukken') && !src.includes('resize')) {
        result.imageUrls.push(src);
      }
    });

  } catch (error) {
    console.error('  상세 페이지 오류:', error);
  }

  return result;
};

// 지오코딩 (주소 -> 좌표 변환)
// Nominatim 사용 정책: 최대 1 request/second
export const geocodeAddress = async (
  address: string,
  retryCount: number = 0
): Promise<{ lat: number; lng: number } | null> => {
  try {
    // 주소 정규화: "東京都東京都" 같은 중복 제거
    let cleanAddress = address.replace(/東京都東京都/g, '東京都');

    const encodedAddress = encodeURIComponent(cleanAddress);
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1&countrycodes=jp`,
      {
        headers: {
          'User-Agent': 'TokyoMansionSearchApp/1.0 (mansion search project)',
        },
        timeout: 15000,
      }
    );

    if (response.data && response.data.length > 0) {
      return {
        lat: parseFloat(response.data[0].lat),
        lng: parseFloat(response.data[0].lon),
      };
    }
    return null;
  } catch (error: any) {
    // 503/429 에러시 재시도 (rate limiting)
    if ((error.response?.status === 503 || error.response?.status === 429) && retryCount < 3) {
      const waitTime = (retryCount + 1) * 5000; // 5초, 10초, 15초 대기
      console.log(`    ⏳ Rate limit 도달, ${waitTime / 1000}초 대기 후 재시도...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return geocodeAddress(address, retryCount + 1);
    }

    // 그 외 에러는 무시하고 null 반환 (DB 저장은 계속 진행)
    const statusCode = error.response?.status || 'unknown';
    console.log(`    지오코딩 실패 (status: ${statusCode})`);
    return null;
  }
};

// 전체 크롤링 프로세스
export const crawlSuumoMansions = async (
  maxPages: number = 3
): Promise<Mansion[]> => {
  const allMansions: Partial<Mansion>[] = [];
  let currentUrl: string | null = `${SUUMO_BASE_URL}${SUUMO_TOKYO_NEW_MANSION}`;
  let pageCount = 0;

  console.log('🚀 SUUMO 크롤링 시작...\n');

  try {
    while (currentUrl && pageCount < maxPages) {
      console.log(`\n📄 페이지 ${pageCount + 1}/${maxPages}: ${currentUrl}`);

      const { mansions, nextPageUrl } = await scrapeSuumoListPage(currentUrl);
      allMansions.push(...mansions);

      console.log(`  ✓ ${mansions.length}개 맨션 추출 (총 ${allMansions.length}개)`);

      currentUrl = nextPageUrl;
      pageCount++;

      if (currentUrl) {
        console.log('  ⏳ 다음 페이지 대기 중...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // 지오코딩 수행
    console.log('\n🌍 지오코딩 시작...');
    let geocodedCount = 0;

    for (const mansion of allMansions) {
      if (mansion.addressJa && (!mansion.latitude || mansion.latitude === 0)) {
        const coords = await geocodeAddress(mansion.addressJa);
        if (coords) {
          mansion.latitude = coords.lat;
          mansion.longitude = coords.lng;
          geocodedCount++;
          console.log(`  ✓ ${mansion.name}: (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
        } else {
          console.log(`  ✗ ${mansion.name}: 좌표 찾기 실패`);
        }
        // Nominatim rate limit: 1 request/second + 여유
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    console.log(`\n✅ 지오코딩 완료: ${geocodedCount}/${allMansions.length}개`);

  } finally {
    await closeBrowser();
  }

  return allMansions as Mansion[];
};
