// 도쿄 23구 목록
const TOKYO_WARDS = [
  '千代田区',
  '中央区',
  '港区',
  '新宿区',
  '文京区',
  '台東区',
  '墨田区',
  '江東区',
  '品川区',
  '目黒区',
  '大田区',
  '世田谷区',
  '渋谷区',
  '中野区',
  '杉並区',
  '豊島区',
  '北区',
  '荒川区',
  '板橋区',
  '練馬区',
  '足立区',
  '葛飾区',
  '江戸川区',
];

/**
 * 일본 주소 문자열에서 도쿄 23구 정보를 추출
 * @param addressJa 일본어 주소 문자열 (예: "東京都渋谷区道玄坂1丁目")
 * @returns 구 이름 (예: "渋谷区") 또는 null
 */
export const extractWardFromAddress = (addressJa: string): string | null => {
  if (!addressJa) return null;

  // 도쿄 23구 중 하나가 주소에 포함되어 있는지 확인
  for (const ward of TOKYO_WARDS) {
    if (addressJa.includes(ward)) {
      return ward;
    }
  }

  return null;
};
