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

// 가격 문자열 파싱 (예: "5,980万円" -> 5980, "1億7380万円" -> 17380, "6億円" -> 60000)
const parsePrice = (priceStr: string): number => {
  if (!priceStr) return 0;
  
  // 億円 처리 (예: "1億7380万円" -> 17380)
  const okuMatch = priceStr.match(/([0-9,]+)億/);
  const manMatch = priceStr.match(/([0-9,]+)万円/);
  
  let oku = 0;
  let man = 0;
  
  if (okuMatch) {
    oku = parseInt(okuMatch[1].replace(/,/g, ''), 10) * 10000;
  }
  
  if (manMatch) {
    man = parseInt(manMatch[1].replace(/,/g, ''), 10);
  }
  
  // 億円만 있는 경우 (예: "6億円")
  if (oku > 0 && man === 0 && priceStr.includes('億円')) {
    return oku;
  }
  
  // 万円만 있는 경우
  if (oku === 0 && man > 0) {
    return man;
  }
  
  // 둘 다 있는 경우
  if (oku > 0 && man > 0) {
    return oku + man;
  }
  
  // 일반 숫자만 있는 경우
  const numMatch = priceStr.match(/([0-9,]+)/);
  if (numMatch) {
    return parseInt(numMatch[1].replace(/,/g, ''), 10);
  }
  
  return 0;
};

// 면적 문자열 파싱 (예: "65.32m²" -> 65.32)
const parseArea = (areaStr: string): number => {
  const match = areaStr.match(/([0-9.]+)/);
  if (match) {
    return parseFloat(match[1]);
  }
  return 0;
};

// 도보 시간 파싱 (예: "徒歩5分" -> 5)
const parseWalkMinutes = (walkStr: string): number => {
  const match = walkStr.match(/徒歩(\d+)分/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
};

// 교통 정보 파싱
const parseStationAccess = (accessStr: string): StationAccess[] => {
  const stations: StationAccess[] = [];
  // 예: "東京メトロ銀座線 「銀座」駅 徒歩3分"
  const pattern = /(.+?)\s*[「『](.+?)[」』]駅\s*徒歩(\d+)分/g;
  let match;
  while ((match = pattern.exec(accessStr)) !== null) {
    stations.push({
      lineName: match[1].trim(),
      stationName: match[2].trim(),
      walkMinutes: parseInt(match[3], 10),
    });
  }
  return stations;
};

// 맨션 ID 생성
const generateId = (name: string, address: string): string => {
  const str = `${name}-${address}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

// Puppeteer를 사용하여 페이지 로드 (JavaScript 실행 후 HTML 가져오기)
const loadPageWithPuppeteer = async (url: string): Promise<string> => {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    // 로컬 환경에서는 시스템 Chrome 사용, 서버 환경에서는 chromium 사용
    const isLocal = process.env.NODE_ENV !== 'production' && !process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    if (isLocal) {
      // 로컬: 여러 Chrome 경로 시도
      const possibleChromePaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
        '/usr/bin/google-chrome', // Linux
        '/usr/bin/chromium-browser', // Linux
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', // Windows
      ].filter(Boolean) as string[];
      
      let browserLaunched = false;
      let lastError: Error | null = null;
      
      for (const chromePath of possibleChromePaths) {
        try {
          browser = await puppeteer.launch({
            headless: true,
            executablePath: chromePath,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
          });
          browserLaunched = true;
          console.log(`  Chrome 경로 사용: ${chromePath}`);
          break;
        } catch (error: any) {
          lastError = error;
          continue;
        }
      }
      
      if (!browserLaunched) {
        // executablePath 없이 시도 (시스템 PATH에서 찾기)
        try {
          browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
          });
          browserLaunched = true;
          console.log(`  시스템 PATH에서 Chrome 찾음`);
        } catch (error: any) {
          lastError = error;
        }
      }
      
      if (!browserLaunched) {
        throw new Error(`Chrome을 찾을 수 없습니다. PUPPETEER_EXECUTABLE_PATH 환경 변수를 설정하거나 Chrome을 설치하세요. 마지막 오류: ${lastError?.message}`);
      }
    } else {
      // 서버: Chromium 사용
      const headlessValue = chromium.headless === 'chrome-headless-shell' ? true : (chromium.headless === true);
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: headlessValue,
      });
    }

    if (!browser) {
      throw new Error('브라우저를 시작할 수 없습니다.');
    }

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log(`  Puppeteer로 페이지 로드 중: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // 추가 대기 (동적 콘텐츠 로드 대기)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const html = await page.content();
    await browser.close();
    
    return html;
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    throw error;
  }
};

export const scrapeSuumoListPage = async (url: string): Promise<ScrapeResult> => {
  const mansions: Partial<Mansion>[] = [];

  try {
    let html: string;
    
    // 먼저 Puppeteer로 시도 (JavaScript 동적 로드 필요)
    try {
      html = await loadPageWithPuppeteer(url);
      console.log(`  Puppeteer로 페이지 로드 완료. HTML 길이: ${html.length} bytes`);
    } catch (puppeteerError: any) {
      console.warn(`  Puppeteer 실패, axios로 시도: ${puppeteerError.message}`);
      // Puppeteer 실패 시 axios로 폴백
      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        },
        timeout: 30000,
      });
      html = response.data;
      console.log(`  Axios로 페이지 로드 완료. HTML 길이: ${html.length} bytes`);
    }

    const $ = cheerio.load(html);

    // 디버깅: 페이지 구조 확인
    console.log(`  페이지 로드 완료. HTML 길이: ${html.length} bytes`);
    
    // SUUMO 실제 구조에 맞는 선택자 시도
    // 실제로는 .propertybox-object가 맨션 카드 컨테이너
    let selectors = [
      '.propertybox-object',             // 실제 SUUMO 구조
      '.cassettebox',                    // 대안 선택자
      '.propertyitem',                  // 대안 선택자
      'article.propertybox-object',      // 더 구체적
      '[class*="propertybox"]',          // propertybox 포함
    ];

    let foundElements = 0;
    let selectorUsed = '';

    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        foundElements = elements.length;
        selectorUsed = selector;
        console.log(`  선택자 "${selector}"로 ${foundElements}개 요소 발견`);
        
        // 첫 번째 요소의 HTML 구조 확인 (디버깅)
        if (foundElements > 0) {
          const firstElement = $(elements[0]);
          const htmlSample = firstElement.html()?.substring(0, 300) || '';
          console.log(`  첫 번째 요소 HTML 샘플: ${htmlSample}...`);
          console.log(`  첫 번째 요소 텍스트: ${firstElement.text().substring(0, 200)}...`);
        }
        break;
      }
    }

    if (foundElements === 0) {
      console.warn('  ⚠️  맨션 목록 요소를 찾을 수 없습니다.');
      console.warn('  페이지 구조를 확인하세요.');
      
      // 페이지의 주요 클래스명 찾기
      const allClasses: string[] = [];
      $('[class]').each((_, el) => {
        const classes = $(el).attr('class')?.split(/\s+/) || [];
        allClasses.push(...classes);
      });
      const uniqueClasses = [...new Set(allClasses)].filter(c => 
        c.includes('cassette') || 
        c.includes('property') || 
        c.includes('item') ||
        c.includes('mansion') ||
        c.includes('bukken') ||
        c.includes('ms-') ||
        c.includes('search')
      );
      console.warn(`  발견된 관련 클래스명: ${uniqueClasses.slice(0, 20).join(', ')}`);
      
      // HTML 샘플 저장 (디버깅용)
      const bodyHTML = $('body').html()?.substring(0, 2000) || '';
      console.warn(`  Body HTML 샘플 (처음 2000자):`);
      console.warn(`  ${bodyHTML}...`);
      
      // 링크가 있는 요소 찾기 (맨션 상세 페이지 링크)
      const linksWithMs = $('a[href*="/ms/"]');
      console.warn(`  /ms/ 링크 발견: ${linksWithMs.length}개`);
      if (linksWithMs.length > 0) {
        const firstLink = linksWithMs.first();
        const parentElement = firstLink.parent().parent();
        console.warn(`  첫 번째 링크의 부모 요소 클래스: ${parentElement.attr('class') || '(없음)'}`);
        console.warn(`  첫 번째 링크의 부모 요소 HTML 샘플: ${parentElement.html()?.substring(0, 500) || '(없음)'}`);
      }
      
      return { mansions: [], nextPageUrl: null };
    }

    // SUUMO의 물건 목록 선택자 (실제 구조에 따라 수정 필요)
    $(selectorUsed).each((_, element) => {
      try {
        const $el = $(element);

        // SUUMO 실제 구조: .propertybox-object 내부 구조
        // - .propertybox-title (제목/가격)
        // - .propertybox-body 또는 다른 요소들 (주소, 면적 등)
        
        // 전체 텍스트에서 정보 추출
        const allText = $el.text();
        
        // 제목과 링크 찾기
        // propertybox-object 내부의 링크 찾기
        const linkElement = $el.find('a[href*="/ms/"]').first();
        const sourceUrl = linkElement.attr('href') || '';
        
        // 이름 추출 - propertybox-object의 구조 분석
        // 실제 구조: propertybox-object > propertybox-body > propertybox-title 또는 직접 링크
        let nameJa = '';
        
        // 방법 1: 링크 텍스트에서 추출
        if (linkElement.length > 0) {
          nameJa = linkElement.text().trim();
        }
        
        // 방법 2: propertybox-title에서 추출 (가격이 아닌 부분)
        if (!nameJa || nameJa.length < 3) {
          const titleText = $el.find('.propertybox-title').text().trim();
          // titleText에서 가격 부분 제거하고 나머지를 이름으로
          const titleWithoutPrice = titleText.replace(/[0-9,]+[億万円台～～-]+/g, '').trim();
          if (titleWithoutPrice.length > 3) {
            nameJa = titleWithoutPrice;
          }
        }
        
        // 방법 3: 전체 텍스트에서 "NEW"로 시작하는 부분 찾기
        if (!nameJa || nameJa.length < 3) {
          const newMatch = allText.match(/NEW\s*([^\n\r\s]+(?:\s+[^\n\r\s]+)*)/);
          if (newMatch && newMatch[1]) {
            nameJa = newMatch[1].trim();
          }
        }
        
        // 방법 4: propertybox-object의 첫 번째 의미있는 텍스트 라인
        if (!nameJa || nameJa.length < 3) {
          const htmlContent = $el.html() || '';
          // HTML에서 텍스트만 추출 (태그 제거)
          const textLines = allText.split(/\n/).map(l => l.trim()).filter(l => 
            l.length > 5 && 
            !l.match(/[0-9,]+[億万円]/) && 
            !l.includes('所在地') &&
            !l.includes('交通')
          );
          if (textLines.length > 0) {
            nameJa = textLines[0];
          }
        }
        
        // 이름 정리
        nameJa = nameJa
          .replace(/^NEW\s*/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        // propertybox-title에서 가격 정보 추출
        const titleElement = $el.find('.propertybox-title').first();
        const titleText = titleElement.text().trim();
        
        // 가격 - propertybox-title에서 추출 (이미 titleText에 있음)
        const priceText = titleText || '';
        
        // 주소 - propertybox-object 내부에서 찾기
        let addressJa = '';
        // propertybox-body 또는 다른 요소에서 주소 찾기
        $el.find('[class*="area"], [class*="address"], [class*="所在地"]').each((_, item) => {
          const itemText = $(item).text();
          if (itemText.includes('東京都') || itemText.includes('区') || itemText.includes('市')) {
            addressJa = itemText.trim();
            return false; // break
          }
        });
        // 전체 텍스트에서 주소 패턴 찾기
        if (!addressJa) {
          const addressMatch = allText.match(/東京都[^\s]+/);
          if (addressMatch) {
            addressJa = addressMatch[0];
          }
        }
        
        // 면적 - m² 패턴 찾기
        let areaText = '';
        $el.find('[class*="menseki"], [class*="area"]').each((_, item) => {
          const itemText = $(item).text();
          if (itemText.includes('m²') || itemText.includes('㎡')) {
            areaText = itemText;
            return false; // break
          }
        });
        if (!areaText) {
          const areaMatch = allText.match(/[0-9.]+m²|[0-9.]+㎡/);
          if (areaMatch) {
            areaText = areaMatch[0];
          }
        }
        
        // 방 타입 - 1LDK, 2LDK 등 패턴 찾기
        let layoutText = '';
        $el.find('[class*="madori"], [class*="layout"]').each((_, item) => {
          const itemText = $(item).text();
          if (/[0-9]+[RLDK]/.test(itemText)) {
            layoutText = itemText;
            return false; // break
          }
        });
        if (!layoutText) {
          const layoutMatch = allText.match(/[0-9]+[RLDK]+/g);
          if (layoutMatch) {
            layoutText = layoutMatch.join('・');
          }
        }
        
        // 교통 정보 - 駅, 徒歩 패턴 찾기
        let accessText = '';
        $el.find('[class*="traffic"], [class*="access"]').each((_, item) => {
          const itemText = $(item).text();
          if (itemText.includes('駅') || itemText.includes('徒歩')) {
            accessText = itemText;
            return false; // break
          }
        });
        if (!accessText) {
          const accessMatch = allText.match(/[^\s]+線[^\s]*駅[^\s]*徒歩[0-9]+分/g);
          if (accessMatch) {
            accessText = accessMatch.join(' / ');
          }
        }
        
        // 완공 예정 - 年, 月 패턴 찾기
        let completionText = '';
        $el.find('[class*="shunkou"], [class*="completion"]').each((_, item) => {
          const itemText = $(item).text();
          if (itemText.includes('年') && itemText.includes('月')) {
            completionText = itemText;
            return false; // break
          }
        });
        if (!completionText) {
          const completionMatch = allText.match(/[0-9]{4}年[0-9]{1,2}月/);
          if (completionMatch) {
            completionText = completionMatch[0];
          }
        }
        
        // 총 세대수 - 戸 패턴 찾기
        let totalUnitsText = '';
        $el.find('[class*="souko"], [class*="units"]').each((_, item) => {
          const itemText = $(item).text();
          if (itemText.includes('戸')) {
            totalUnitsText = itemText;
            return false; // break
          }
        });
        if (!totalUnitsText) {
          const unitsMatch = allText.match(/([0-9,]+)戸/);
          if (unitsMatch) {
            totalUnitsText = unitsMatch[0];
          }
        }
        
        // 썸네일 이미지
        const thumbnailUrl = 
          $el.find('[class*="image"] img').first().attr('src') ||
          $el.find('img').first().attr('src') ||
          '';
        
        // sourceUrl이 상대 경로인 경우 절대 경로로 변환
        const fullSourceUrl = sourceUrl 
          ? (sourceUrl.startsWith('http') ? sourceUrl : `${SUUMO_BASE_URL}${sourceUrl}`)
          : '';

        // 가격 범위 파싱 (億円, 万円 모두 처리)
        // "1億7380万円", "6億円", "6780万円～8990万円" 등 다양한 형식 지원
        let priceValues: number[] = [];
        
        // 億円 + 万円 조합 (예: "1億7380万円")
        const okuManMatch = priceText.match(/([0-9,]+)億([0-9,]+)万円/);
        if (okuManMatch) {
          const oku = parseInt(okuManMatch[1].replace(/,/g, ''), 10) * 10000;
          const man = parseInt(okuManMatch[2].replace(/,/g, ''), 10);
          priceValues.push(oku + man);
        }
        
        // 億円만 (예: "6億円")
        const okuOnlyMatches = priceText.match(/([0-9,]+)億円/g);
        if (okuOnlyMatches) {
          okuOnlyMatches.forEach(match => {
            const oku = parseInt(match.replace(/億円/g, '').replace(/,/g, ''), 10) * 10000;
            priceValues.push(oku);
          });
        }
        
        // 万円만 (예: "6780万円", "6780万円～8990万円")
        const manMatches = priceText.match(/([0-9,]+)万円/g);
        if (manMatches) {
          manMatches.forEach(match => {
            const man = parseInt(match.replace(/万円/g, '').replace(/,/g, ''), 10);
            priceValues.push(man);
          });
        }
        
        // 범위 표시가 있는 경우 (예: "6780万円～8990万円")
        if (priceValues.length === 0) {
          // parsePrice 함수 사용 (이미 億円, 万円 처리 가능)
          const singlePrice = parsePrice(priceText);
          if (singlePrice > 0) {
            priceValues.push(singlePrice);
          }
        }
        
        const priceMin = priceValues.length > 0 ? Math.min(...priceValues) : 0;
        const priceMax = priceValues.length > 0 ? Math.max(...priceValues) : priceMin;
        
        // 가격 단위 결정
        const priceUnit: '万円' | '億円' = priceMax >= 10000 ? '億円' : '万円';

        // 면적 범위 파싱
        const areas = areaText.match(/([0-9.]+)m²/g) || [];
        const areaValues = areas.map(parseArea);
        const areaMin = Math.min(...areaValues) || 0;
        const areaMax = Math.max(...areaValues) || areaMin;

        // 방 타입 파싱
        const layoutTypes = layoutText.match(/\d+[LKDR]+|\dR/g) || [];

        // 총 세대수 파싱
        const totalUnitsMatch = totalUnitsText.match(/(\d+)戸/);
        const totalUnits = totalUnitsMatch ? parseInt(totalUnitsMatch[1], 10) : 0;

        // 교통 정보 파싱
        const stations = parseStationAccess(accessText);

        // 디버깅: 파싱된 데이터 확인 (처음 3개만)
        if (mansions.length < 3) {
          console.log(`  샘플 데이터 파싱 (${mansions.length + 1}번째):`);
          console.log(`    이름: ${nameJa || '(없음)'}`);
          console.log(`    주소: ${addressJa || '(없음)'}`);
          console.log(`    가격: ${priceText || '(없음)'}`);
          console.log(`    면적: ${areaText || '(없음)'}`);
          console.log(`    링크: ${sourceUrl || '(없음)'}`);
          
          // 데이터가 없으면 HTML 구조 확인
          if (!nameJa && !addressJa && mansions.length === 0) {
            console.log(`    전체 텍스트 샘플: ${$el.text().substring(0, 200)}...`);
            console.log(`    클래스명: ${$el.attr('class') || '(없음)'}`);
          }
        }

        if (nameJa && addressJa) {
          mansions.push({
            id: generateId(nameJa, addressJa),
            name: nameJa,
            nameJa,
            address: addressJa,
            addressJa,
            latitude: 0, // 추후 지오코딩 필요
            longitude: 0,
            priceMin,
            priceMax,
            priceUnit,
            areaMin,
            areaMax,
            layoutTypes: [...new Set(layoutTypes)],
            totalUnits,
            floors: 0,
            completion: completionText,
            developer: '',
            stations,
            thumbnailUrl: thumbnailUrl || '',
            imageUrls: [],
            sourceUrl: sourceUrl ? `${SUUMO_BASE_URL}${sourceUrl}` : '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('Error parsing mansion element:', err);
      }
    });

    console.log(`  파싱 완료: ${mansions.length}개 맨션 발견`);

    // 다음 페이지 URL 파싱
    const nextPageLink = 
      $('.pager .pager-next a').attr('href') ||
      $('[class*="pager"] [class*="next"] a').attr('href') ||
      $('a[href*="page="]').last().attr('href') ||
      null;
    const nextPageUrl = nextPageLink ? `${SUUMO_BASE_URL}${nextPageLink}` : null;

    return { mansions, nextPageUrl };
  } catch (error) {
    console.error('Error scraping SUUMO:', error);
    return { mansions: [], nextPageUrl: null };
  }
};

// 지오코딩 (주소 -> 좌표 변환)
export const geocodeAddress = async (
  address: string
): Promise<{ lat: number; lng: number } | null> => {
  try {
    // 일본 주소용 지오코딩 API 사용 (예: Yahoo! Japan Local Search API)
    // 무료 대안으로 OpenStreetMap Nominatim 사용 가능
    const encodedAddress = encodeURIComponent(address);
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`,
      {
        headers: {
          'User-Agent': 'TokyoMansionSearchApp/1.0',
        },
      }
    );

    if (response.data && response.data.length > 0) {
      return {
        lat: parseFloat(response.data[0].lat),
        lng: parseFloat(response.data[0].lon),
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
};

// 전체 크롤링 프로세스
export const crawlSuumoMansions = async (
  maxPages: number = 5
): Promise<Mansion[]> => {
  const allMansions: Partial<Mansion>[] = [];
  let currentUrl: string | null = `${SUUMO_BASE_URL}${SUUMO_TOKYO_NEW_MANSION}`;
  let pageCount = 0;

  while (currentUrl && pageCount < maxPages) {
    console.log(`Scraping page ${pageCount + 1}: ${currentUrl}`);
    const { mansions, nextPageUrl } = await scrapeSuumoListPage(currentUrl);
    allMansions.push(...mansions);
    currentUrl = nextPageUrl;
    pageCount++;

    // Rate limiting - 요청 사이에 딜레이
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // 지오코딩 수행
  console.log('Geocoding addresses...');
  for (const mansion of allMansions) {
    if (mansion.addressJa && (!mansion.latitude || !mansion.longitude)) {
      const coords = await geocodeAddress(mansion.addressJa);
      if (coords) {
        mansion.latitude = coords.lat;
        mansion.longitude = coords.lng;
      }
      // Rate limiting for geocoding
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return allMansions as Mansion[];
};
