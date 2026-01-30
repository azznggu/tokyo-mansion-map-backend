import { Handler, HandlerEvent } from '@netlify/functions';
import { mockMansions } from '../../src/data';
import { filterMansions } from '../../src/utils';
import { SearchFilter, MapBounds } from '../../src/types';
import { fetchMansionsInBoundsFromDB } from '../../src/services/database';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const parseQueryParams = (event: HandlerEvent): { filter: SearchFilter; bounds: MapBounds } => {
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

  const bounds: MapBounds = {
    neLat: Number(params.neLat) || 36.0,
    neLng: Number(params.neLng) || 140.0,
    swLat: Number(params.swLat) || 35.5,
    swLng: Number(params.swLng) || 139.5,
  };

  return { filter, bounds };
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
    const { filter, bounds } = parseQueryParams(event);

    // Supabase에서 데이터 가져오기 시도
    let filteredMansions;

    try {
      filteredMansions = await fetchMansionsInBoundsFromDB(filter, bounds);
    } catch (dbError) {
      console.warn('Failed to fetch from database, using mock data:', dbError);
      // 데이터베이스 연결 실패 시 목업 데이터 사용
      filteredMansions = filterMansions(mockMansions, filter, bounds);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: filteredMansions }),
    };
  } catch (error) {
    console.error('Error fetching mansions in bounds:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
