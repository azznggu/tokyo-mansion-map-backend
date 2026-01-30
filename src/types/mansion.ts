// 맨션 기본 정보 타입
export interface Mansion {
  id: string;
  name: string;
  nameJa: string;
  address: string;
  addressJa: string;
  ward?: string; // 도쿄 23구 중 하나
  latitude: number;
  longitude: number;

  // 가격 정보
  priceMin: number;
  priceMax: number;
  priceUnit: '万円' | '億円';

  // 면적 정보
  areaMin: number;
  areaMax: number;

  // 방 정보
  layoutTypes: string[];
  totalUnits: number;

  // 건물 정보
  floors: number;
  completion: string;
  developer: string;

  // 교통 정보
  stations: StationAccess[];

  // 이미지
  thumbnailUrl: string;
  imageUrls: string[];

  // 메타 정보
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface StationAccess {
  lineName: string;
  stationName: string;
  walkMinutes: number;
}

export interface SearchFilter {
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  layoutTypes?: string[];
  stations?: string[];
  walkMinutesMax?: number;
  ward?: string;
  completionYear?: number;
  totalUnitsMin?: number;
  totalUnitsMax?: number;
}

export interface MapBounds {
  neLat: number;
  neLng: number;
  swLat: number;
  swLng: number;
}

export interface MansionListResponse {
  data: Mansion[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
