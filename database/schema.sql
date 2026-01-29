-- Tokyo New Mansion Database Schema
-- Designed for Supabase (PostgreSQL)

-- Enable PostGIS extension for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- 맨션 테이블
CREATE TABLE IF NOT EXISTS mansions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 기본 정보
    name VARCHAR(255) NOT NULL,
    name_ja VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    address_ja VARCHAR(500) NOT NULL,

    -- 위치 정보 (PostGIS)
    location GEOGRAPHY(POINT, 4326),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- 가격 정보
    price_min INTEGER NOT NULL DEFAULT 0,
    price_max INTEGER NOT NULL DEFAULT 0,
    price_unit VARCHAR(10) DEFAULT '万円',

    -- 면적 정보
    area_min DECIMAL(8, 2) NOT NULL DEFAULT 0,
    area_max DECIMAL(8, 2) NOT NULL DEFAULT 0,

    -- 방 타입
    layout_types TEXT[] DEFAULT '{}',

    -- 건물 정보
    total_units INTEGER DEFAULT 0,
    floors INTEGER DEFAULT 0,
    completion VARCHAR(50),
    developer VARCHAR(255),

    -- 이미지
    thumbnail_url TEXT,
    image_urls TEXT[] DEFAULT '{}',

    -- 소스 정보
    source_url TEXT,
    source_site VARCHAR(50) DEFAULT 'suumo',

    -- 메타 정보
    ward VARCHAR(50), -- 구 정보 (검색 최적화)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 역 접근 정보 테이블
CREATE TABLE IF NOT EXISTS station_accesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mansion_id UUID NOT NULL REFERENCES mansions(id) ON DELETE CASCADE,
    line_name VARCHAR(100) NOT NULL,
    station_name VARCHAR(100) NOT NULL,
    walk_minutes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_mansions_location ON mansions USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_mansions_price ON mansions (price_min, price_max);
CREATE INDEX IF NOT EXISTS idx_mansions_area ON mansions (area_min, area_max);
CREATE INDEX IF NOT EXISTS idx_mansions_ward ON mansions (ward);
CREATE INDEX IF NOT EXISTS idx_mansions_is_active ON mansions (is_active);
CREATE INDEX IF NOT EXISTS idx_mansions_created_at ON mansions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_station_accesses_mansion_id ON station_accesses (mansion_id);
CREATE INDEX IF NOT EXISTS idx_station_accesses_walk_minutes ON station_accesses (walk_minutes);

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_mansions_updated_at
    BEFORE UPDATE ON mansions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 위치 정보 자동 설정 트리거
CREATE OR REPLACE FUNCTION set_mansion_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_mansions_location
    BEFORE INSERT OR UPDATE ON mansions
    FOR EACH ROW
    EXECUTE FUNCTION set_mansion_location();

-- RLS (Row Level Security) 설정 (Supabase용)
ALTER TABLE mansions ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_accesses ENABLE ROW LEVEL SECURITY;

-- 공개 읽기 정책
CREATE POLICY "Allow public read access" ON mansions
    FOR SELECT USING (is_active = true);

CREATE POLICY "Allow public read access" ON station_accesses
    FOR SELECT USING (true);

-- 지역 내 맨션 검색 함수
CREATE OR REPLACE FUNCTION get_mansions_in_bounds(
    ne_lat DECIMAL,
    ne_lng DECIMAL,
    sw_lat DECIMAL,
    sw_lng DECIMAL,
    price_min_filter INTEGER DEFAULT NULL,
    price_max_filter INTEGER DEFAULT NULL,
    area_min_filter DECIMAL DEFAULT NULL,
    area_max_filter DECIMAL DEFAULT NULL,
    layout_filter TEXT[] DEFAULT NULL,
    ward_filter VARCHAR DEFAULT NULL,
    walk_max_filter INTEGER DEFAULT NULL,
    page_num INTEGER DEFAULT 1,
    page_size INTEGER DEFAULT 20
)
RETURNS TABLE (
    mansion_id UUID,
    name VARCHAR,
    name_ja VARCHAR,
    address_ja VARCHAR,
    latitude DECIMAL,
    longitude DECIMAL,
    price_min INTEGER,
    price_max INTEGER,
    price_unit VARCHAR,
    area_min DECIMAL,
    area_max DECIMAL,
    layout_types TEXT[],
    total_units INTEGER,
    floors INTEGER,
    completion VARCHAR,
    developer VARCHAR,
    thumbnail_url TEXT,
    source_url TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id as mansion_id,
        m.name,
        m.name_ja,
        m.address_ja,
        m.latitude,
        m.longitude,
        m.price_min,
        m.price_max,
        m.price_unit,
        m.area_min,
        m.area_max,
        m.layout_types,
        m.total_units,
        m.floors,
        m.completion,
        m.developer,
        m.thumbnail_url,
        m.source_url
    FROM mansions m
    WHERE m.is_active = true
        AND m.latitude BETWEEN sw_lat AND ne_lat
        AND m.longitude BETWEEN sw_lng AND ne_lng
        AND (price_min_filter IS NULL OR m.price_max >= price_min_filter)
        AND (price_max_filter IS NULL OR m.price_min <= price_max_filter)
        AND (area_min_filter IS NULL OR m.area_max >= area_min_filter)
        AND (area_max_filter IS NULL OR m.area_min <= area_max_filter)
        AND (layout_filter IS NULL OR m.layout_types && layout_filter)
        AND (ward_filter IS NULL OR m.ward = ward_filter)
        AND (walk_max_filter IS NULL OR EXISTS (
            SELECT 1 FROM station_accesses sa
            WHERE sa.mansion_id = m.id AND sa.walk_minutes <= walk_max_filter
        ))
    ORDER BY m.created_at DESC
    LIMIT page_size
    OFFSET (page_num - 1) * page_size;
END;
$$;

-- 맨션 상세 조회 함수 (교통 정보 포함)
CREATE OR REPLACE FUNCTION get_mansion_detail(mansion_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'id', m.id,
        'name', m.name,
        'nameJa', m.name_ja,
        'address', m.address,
        'addressJa', m.address_ja,
        'latitude', m.latitude,
        'longitude', m.longitude,
        'priceMin', m.price_min,
        'priceMax', m.price_max,
        'priceUnit', m.price_unit,
        'areaMin', m.area_min,
        'areaMax', m.area_max,
        'layoutTypes', m.layout_types,
        'totalUnits', m.total_units,
        'floors', m.floors,
        'completion', m.completion,
        'developer', m.developer,
        'thumbnailUrl', m.thumbnail_url,
        'imageUrls', m.image_urls,
        'sourceUrl', m.source_url,
        'stations', (
            SELECT json_agg(json_build_object(
                'lineName', sa.line_name,
                'stationName', sa.station_name,
                'walkMinutes', sa.walk_minutes
            ))
            FROM station_accesses sa
            WHERE sa.mansion_id = m.id
        ),
        'createdAt', m.created_at,
        'updatedAt', m.updated_at
    ) INTO result
    FROM mansions m
    WHERE m.id = mansion_uuid AND m.is_active = true;

    RETURN result;
END;
$$;
