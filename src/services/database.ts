import { createClient } from '@supabase/supabase-js';
import type { Mansion, StationAccess } from '../types';
import { extractWardFromAddress } from '../utils/ward';

// Supabase 클라이언트 초기화 (읽기 전용 - anon key)
const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase credentials are not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
};

// Supabase 관리자 클라이언트 초기화 (쓰기 작업 - service role key)
// RLS를 우회하여 크롤러에서 데이터를 저장할 때 사용
const getSupabaseAdminClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase admin credentials are not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

// 데이터베이스에서 맨션 데이터를 Mansion 타입으로 변환
const mapDbMansionToMansion = (dbMansion: any, stations: StationAccess[]): Mansion => {
  return {
    id: dbMansion.id,
    name: dbMansion.name || '',
    nameJa: dbMansion.name_ja || '',
    address: dbMansion.address || '',
    addressJa: dbMansion.address_ja || '',
    latitude: parseFloat(dbMansion.latitude) || 0,
    longitude: parseFloat(dbMansion.longitude) || 0,
    priceMin: dbMansion.price_min || 0,
    priceMax: dbMansion.price_max || 0,
    priceUnit: (dbMansion.price_unit as '万円' | '億円') || '万円',
    areaMin: parseFloat(dbMansion.area_min) || 0,
    areaMax: parseFloat(dbMansion.area_max) || 0,
    layoutTypes: dbMansion.layout_types || [],
    totalUnits: dbMansion.total_units || 0,
    floors: dbMansion.floors || 0,
    completion: dbMansion.completion || '',
    developer: dbMansion.developer || '',
    stations: stations,
    thumbnailUrl: dbMansion.thumbnail_url || '',
    imageUrls: dbMansion.image_urls || [],
    sourceUrl: dbMansion.source_url || '',
    createdAt: dbMansion.created_at || new Date().toISOString(),
    updatedAt: dbMansion.updated_at || new Date().toISOString(),
  };
};

// 맨션 목록 조회 (필터링 및 페이지네이션)
export const fetchMansionsFromDB = async (
  filter: {
    priceMin?: number;
    priceMax?: number;
    areaMin?: number;
    areaMax?: number;
    layoutTypes?: string[];
    walkMinutesMax?: number;
    ward?: string;
  },
  bounds?: {
    neLat: number;
    neLng: number;
    swLat: number;
    swLng: number;
  },
  page: number = 1,
  pageSize: number = 20
): Promise<{ mansions: Mansion[]; total: number }> => {
  try {
    const supabase = getSupabaseClient();

    // 기본 쿼리
    let query = supabase
      .from('mansions')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    // 가격 필터
    if (filter.priceMin !== undefined) {
      query = query.gte('price_max', filter.priceMin);
    }
    if (filter.priceMax !== undefined) {
      query = query.lte('price_min', filter.priceMax);
    }

    // 면적 필터
    if (filter.areaMin !== undefined) {
      query = query.gte('area_max', filter.areaMin);
    }
    if (filter.areaMax !== undefined) {
      query = query.lte('area_min', filter.areaMax);
    }

    // 방 타입 필터
    if (filter.layoutTypes && filter.layoutTypes.length > 0) {
      query = query.overlaps('layout_types', filter.layoutTypes);
    }

    // 구 필터
    if (filter.ward) {
      query = query.eq('ward', filter.ward);
    }

    // 지도 영역 필터
    if (bounds) {
      query = query
        .gte('latitude', bounds.swLat)
        .lte('latitude', bounds.neLat)
        .gte('longitude', bounds.swLng)
        .lte('longitude', bounds.neLng);
    }

    // 정렬 및 페이지네이션
    query = query
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data: mansions, error, count } = await query;

    if (error) {
      console.error('Error fetching mansions from database:', error);
      throw error;
    }

    if (!mansions || mansions.length === 0) {
      return { mansions: [], total: count || 0 };
    }

    // 역 접근 정보 조회
    const mansionIds = mansions.map((m) => m.id);
    const { data: stationAccesses, error: stationsError } = await supabase
      .from('station_accesses')
      .select('*')
      .in('mansion_id', mansionIds);

    if (stationsError) {
      console.error('Error fetching station accesses:', stationsError);
    }

    // 역 접근 정보를 맨션별로 그룹화
    const stationsByMansionId = new Map<string, StationAccess[]>();
    if (stationAccesses) {
      stationAccesses.forEach((sa) => {
        if (!stationsByMansionId.has(sa.mansion_id)) {
          stationsByMansionId.set(sa.mansion_id, []);
        }
        stationsByMansionId.get(sa.mansion_id)!.push({
          lineName: sa.line_name,
          stationName: sa.station_name,
          walkMinutes: sa.walk_minutes,
        });
      });
    }

    // 역 도보 시간 필터 적용
    let filteredMansions = mansions;
    if (filter.walkMinutesMax !== undefined) {
      filteredMansions = mansions.filter((mansion) => {
        const stations = stationsByMansionId.get(mansion.id) || [];
        return stations.some((s) => s.walkMinutes <= filter.walkMinutesMax!);
      });
    }

    // Mansion 타입으로 변환
    const mappedMansions = filteredMansions.map((mansion) => {
      const stations = stationsByMansionId.get(mansion.id) || [];
      return mapDbMansionToMansion(mansion, stations);
    });

    return {
      mansions: mappedMansions,
      total: count || 0,
    };
  } catch (error) {
    console.error('Error in fetchMansionsFromDB:', error);
    throw error;
  }
};

// 지도 영역 내 맨션 조회 (모든 결과)
export const fetchMansionsInBoundsFromDB = async (
  filter: {
    priceMin?: number;
    priceMax?: number;
    areaMin?: number;
    areaMax?: number;
    layoutTypes?: string[];
    walkMinutesMax?: number;
    ward?: string;
  },
  bounds: {
    neLat: number;
    neLng: number;
    swLat: number;
    swLng: number;
  }
): Promise<Mansion[]> => {
  try {
    const supabase = getSupabaseClient();

    // 기본 쿼리
    let query = supabase
      .from('mansions')
      .select('*')
      .eq('is_active', true)
      .gte('latitude', bounds.swLat)
      .lte('latitude', bounds.neLat)
      .gte('longitude', bounds.swLng)
      .lte('longitude', bounds.neLng);

    // 가격 필터
    if (filter.priceMin !== undefined) {
      query = query.gte('price_max', filter.priceMin);
    }
    if (filter.priceMax !== undefined) {
      query = query.lte('price_min', filter.priceMax);
    }

    // 면적 필터
    if (filter.areaMin !== undefined) {
      query = query.gte('area_max', filter.areaMin);
    }
    if (filter.areaMax !== undefined) {
      query = query.lte('area_min', filter.areaMax);
    }

    // 방 타입 필터
    if (filter.layoutTypes && filter.layoutTypes.length > 0) {
      query = query.overlaps('layout_types', filter.layoutTypes);
    }

    // 구 필터
    if (filter.ward) {
      query = query.eq('ward', filter.ward);
    }

    // 정렬
    query = query.order('created_at', { ascending: false });

    const { data: mansions, error } = await query;

    if (error) {
      console.error('Error fetching mansions in bounds from database:', error);
      throw error;
    }

    if (!mansions || mansions.length === 0) {
      return [];
    }

    // 역 접근 정보 조회
    const mansionIds = mansions.map((m) => m.id);
    const { data: stationAccesses, error: stationsError } = await supabase
      .from('station_accesses')
      .select('*')
      .in('mansion_id', mansionIds);

    if (stationsError) {
      console.error('Error fetching station accesses:', stationsError);
    }

    // 역 접근 정보를 맨션별로 그룹화
    const stationsByMansionId = new Map<string, StationAccess[]>();
    if (stationAccesses) {
      stationAccesses.forEach((sa) => {
        if (!stationsByMansionId.has(sa.mansion_id)) {
          stationsByMansionId.set(sa.mansion_id, []);
        }
        stationsByMansionId.get(sa.mansion_id)!.push({
          lineName: sa.line_name,
          stationName: sa.station_name,
          walkMinutes: sa.walk_minutes,
        });
      });
    }

    // 역 도보 시간 필터 적용
    let filteredMansions = mansions;
    if (filter.walkMinutesMax !== undefined) {
      filteredMansions = mansions.filter((mansion) => {
        const stations = stationsByMansionId.get(mansion.id) || [];
        return stations.some((s) => s.walkMinutes <= filter.walkMinutesMax!);
      });
    }

    // Mansion 타입으로 변환
    const mappedMansions = filteredMansions.map((mansion) => {
      const stations = stationsByMansionId.get(mansion.id) || [];
      return mapDbMansionToMansion(mansion, stations);
    });

    return mappedMansions;
  } catch (error) {
    console.error('Error in fetchMansionsInBoundsFromDB:', error);
    throw error;
  }
};

// 맨션 데이터를 Supabase에 저장
// Service Role Key를 사용하여 RLS를 우회
export const saveMansionToDB = async (mansion: Partial<Mansion>): Promise<string | null> => {
  try {
    const supabase = getSupabaseAdminClient();

    // 구 정보 추출
    const ward = mansion.addressJa ? extractWardFromAddress(mansion.addressJa) : null;

    // 맨션 데이터 준비
    const mansionData = {
      name: mansion.name || '',
      name_ja: mansion.nameJa || '',
      address: mansion.address || '',
      address_ja: mansion.addressJa || '',
      latitude: mansion.latitude || 0,
      longitude: mansion.longitude || 0,
      price_min: mansion.priceMin || 0,
      price_max: mansion.priceMax || 0,
      price_unit: mansion.priceUnit || '万円',
      area_min: mansion.areaMin || 0,
      area_max: mansion.areaMax || 0,
      layout_types: mansion.layoutTypes || [],
      total_units: mansion.totalUnits || 0,
      floors: mansion.floors || 0,
      completion: mansion.completion || '',
      developer: mansion.developer || '',
      thumbnail_url: mansion.thumbnailUrl || '',
      image_urls: mansion.imageUrls || [],
      source_url: mansion.sourceUrl || '',
      source_site: 'suumo',
      ward: ward,
      is_active: true,
    };

    // 중복 체크: source_url로 기존 데이터 확인
    let existingMansion = null;
    if (mansion.sourceUrl) {
      const { data } = await supabase
        .from('mansions')
        .select('id')
        .eq('source_url', mansion.sourceUrl)
        .limit(1)
        .single();

      existingMansion = data;
    }

    let mansionId: string;

    if (existingMansion) {
      // 기존 데이터 업데이트
      const { data, error } = await supabase
        .from('mansions')
        .update(mansionData)
        .eq('id', existingMansion.id)
        .select('id')
        .single();

      if (error) {
        console.error('Error updating mansion:', error);
        throw error;
      }

      mansionId = data.id;

      // 기존 역 접근 정보 삭제
      await supabase.from('station_accesses').delete().eq('mansion_id', mansionId);
    } else {
      // 새 데이터 삽입
      const { data, error } = await supabase
        .from('mansions')
        .insert(mansionData)
        .select('id')
        .single();

      if (error) {
        console.error('Error inserting mansion:', error);
        throw error;
      }

      mansionId = data.id;
    }

    // 역 접근 정보 저장
    if (mansion.stations && mansion.stations.length > 0) {
      const stationAccesses = mansion.stations.map((station) => ({
        mansion_id: mansionId,
        line_name: station.lineName,
        station_name: station.stationName,
        walk_minutes: station.walkMinutes,
      }));

      const { error: stationsError } = await supabase
        .from('station_accesses')
        .insert(stationAccesses);

      if (stationsError) {
        console.error('Error inserting station accesses:', stationsError);
        // 역 접근 정보 저장 실패는 치명적이지 않으므로 계속 진행
      }
    }

    return mansionId;
  } catch (error) {
    console.error('Error in saveMansionToDB:', error);
    throw error;
  }
};

// 여러 맨션 데이터를 일괄 저장
export const saveMansionsToDB = async (
  mansions: Partial<Mansion>[],
  onProgress?: (current: number, total: number) => void
): Promise<{ success: number; failed: number; errors: string[] }> => {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < mansions.length; i++) {
    const mansion = mansions[i];
    try {
      await saveMansionToDB(mansion);
      success++;
      if (onProgress) {
        onProgress(i + 1, mansions.length);
      }
    } catch (error: any) {
      failed++;
      const errorMsg = `Failed to save mansion ${i + 1} (${mansion.nameJa || 'unknown'}): ${error.message}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }

    // Rate limiting: 요청 사이에 짧은 딜레이
    if (i < mansions.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return { success, failed, errors };
};
