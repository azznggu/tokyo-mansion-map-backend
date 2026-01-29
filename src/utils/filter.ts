import { Mansion, SearchFilter, MapBounds } from '../types';

export const filterMansions = (
  mansions: Mansion[],
  filter: SearchFilter,
  bounds?: MapBounds
): Mansion[] => {
  return mansions.filter((mansion) => {
    // 가격 필터
    if (filter.priceMin !== undefined && mansion.priceMax < filter.priceMin) {
      return false;
    }
    if (filter.priceMax !== undefined && mansion.priceMin > filter.priceMax) {
      return false;
    }

    // 면적 필터
    if (filter.areaMin !== undefined && mansion.areaMax < filter.areaMin) {
      return false;
    }
    if (filter.areaMax !== undefined && mansion.areaMin > filter.areaMax) {
      return false;
    }

    // 방 타입 필터
    if (filter.layoutTypes && filter.layoutTypes.length > 0) {
      const hasMatchingLayout = mansion.layoutTypes.some((type) =>
        filter.layoutTypes!.includes(type)
      );
      if (!hasMatchingLayout) {
        return false;
      }
    }

    // 역 도보 시간 필터
    if (filter.walkMinutesMax !== undefined) {
      const hasNearStation = mansion.stations.some(
        (station) => station.walkMinutes <= filter.walkMinutesMax!
      );
      if (!hasNearStation) {
        return false;
      }
    }

    // 구 필터
    if (filter.ward) {
      if (!mansion.addressJa.includes(filter.ward)) {
        return false;
      }
    }

    // 지도 영역 필터
    if (bounds) {
      if (
        mansion.latitude < bounds.swLat ||
        mansion.latitude > bounds.neLat ||
        mansion.longitude < bounds.swLng ||
        mansion.longitude > bounds.neLng
      ) {
        return false;
      }
    }

    return true;
  });
};

export const paginateMansions = (
  mansions: Mansion[],
  page: number,
  pageSize: number
): { data: Mansion[]; total: number; hasMore: boolean } => {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const data = mansions.slice(start, end);

  return {
    data,
    total: mansions.length,
    hasMore: end < mansions.length,
  };
};
