import { Handler, HandlerEvent } from '@netlify/functions';
import { mockMansions } from '../../src/data';
import { filterMansions, paginateMansions } from '../../src/utils';
import { SearchFilter, MapBounds, MansionListResponse } from '../../src/types';
import { fetchMansionsFromDB } from '../../src/services/database';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const parseQueryParams = (event: HandlerEvent): { filter: SearchFilter; bounds?: MapBounds; page: number; pageSize: number } => {
  const params = event.queryStringParameters || {};

  const filter: SearchFilter = {};

  if (params.priceMin) filter.priceMin = Number(params.priceMin);
  if (params.priceMax) filter.priceMax = Number(params.priceMax);
  if (params.areaMin) filter.areaMin = Number(params.areaMin);
  if (params.areaMax) filter.areaMax = Number(params.areaMax);
  if (params.walkMinutesMax) filter.walkMinutesMax = Number(params.walkMinutesMax);
  if (params.ward) filter.ward = params.ward;
  if (params.layoutTypes) {
    filter.layoutTypes = params.layoutTypes.split(',');
  }
  if (params.totalUnitsMin) filter.totalUnitsMin = Number(params.totalUnitsMin);
  if (params.totalUnitsMax) filter.totalUnitsMax = Number(params.totalUnitsMax);

  let bounds: MapBounds | undefined;
  if (params.neLat && params.neLng && params.swLat && params.swLng) {
    bounds = {
      neLat: Number(params.neLat),
      neLng: Number(params.neLng),
      swLat: Number(params.swLat),
      swLng: Number(params.swLng),
    };
  }

  const page = params.page ? Number(params.page) : 1;
  const pageSize = params.pageSize ? Number(params.pageSize) : 20;

  return { filter, bounds, page, pageSize };
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

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { filter, bounds, page, pageSize } = parseQueryParams(event);

    // Supabase에서 데이터 가져오기 시도
    let mansions;
    let total = 0;

    try {
      const result = await fetchMansionsFromDB(filter, bounds, page, pageSize);
      mansions = result.mansions;
      total = result.total;
    } catch (dbError) {
      console.warn('Failed to fetch from database, using mock data:', dbError);
      // 데이터베이스 연결 실패 시 목업 데이터 사용
      const filteredMansions = filterMansions(mockMansions, filter, bounds);
      const paginated = paginateMansions(filteredMansions, page, pageSize);
      mansions = paginated.data;
      total = paginated.total;
    }

    const hasMore = page * pageSize < total;

    const response: MansionListResponse = {
      data: mansions,
      total,
      page,
      pageSize,
      hasMore,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error fetching mansions:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
