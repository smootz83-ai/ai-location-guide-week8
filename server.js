require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// public 폴더의 정적 파일을 서빙합니다
app.use(express.static(path.join(__dirname, 'public')));

/**
 * 위도/경도 두 지점 간 거리(미터단위) 계산 함수 (Haversine 공식)
 */
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // 지구 반지름 (m)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * 소상공인시장진흥공단 상가(상권)정보 API에서 반경 내 카페 조회를 처리하는 함수
 */
async function fetchCafesFromPublicData(apiKey, centerLat, centerLng, radiusMeters = 1000) {
  const encodedKey = apiKey.includes('%') ? apiKey : encodeURIComponent(apiKey);
  
  // 소상공인 반경내 상가업소 조회 API 및 업종별 조회 API 주소 후보군
  const endpoints = [
    `http://apis.data.go.kr/B553077/api/open/sdg/storeListInRadius?serviceKey=${encodedKey}&pageNo=1&numOfRows=20&radius=${radiusMeters}&cx=${centerLng}&cy=${centerLat}&indsLclsCd=I2&type=json`,
    `http://apis.data.go.kr/B553077/storeListInRadius/storeListInRadius?serviceKey=${encodedKey}&pageNo=1&numOfRows=20&radius=${radiusMeters}&cx=${centerLng}&cy=${centerLat}&indsLclsCd=I2&type=json`,
    `http://apis.data.go.kr/B553077/api/open/sdg/storeListInUpjong?serviceKey=${encodedKey}&pageNo=1&numOfRows=20&indsLclsCd=I2&type=json`
  ];

  let lastError = null;

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        lastError = new Error(`API 응답: ${text.trim().slice(0, 120)}`);
        continue;
      }

      const items = data?.body?.items || data?.response?.body?.items;
      if (items && Array.isArray(items) && items.length > 0) {
        // 1km(radiusMeters) 내에 위치한 카페만 필터링
        const filtered = items.map((item, index) => {
          const name = item.bizesNm || item.bnoNm || `카페 ${index + 1}`;
          const category = item.indsSclsNm || item.indsMclsNm || item.indsLclsNm || '커피/카페';
          const address = item.rdnmAdr || item.lnoAdr || '주소 정보 없음';
          const lat = parseFloat(item.lat || item.y || centerLat);
          const lng = parseFloat(item.lon || item.lng || item.x || centerLng);
          const distance = getDistanceInMeters(centerLat, centerLng, lat, lng);

          return {
            name: name,
            category: category,
            address: address,
            lat: lat,
            lng: lng,
            distance: distance,
            desc: `[${category}] ${address} (내 위치에서 ${distance}m)`,
            icon: "☕"
          };
        }).filter(item => item.distance <= radiusMeters);

        if (filtered.length > 0) {
          return filtered.slice(0, 10);
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('공공데이터포털 동기화 대기 중이거나 유효하지 않은 키입니다.');
}

// 1. 1km 반경 카페 데이터 조회 API 엔드포인트
app.get('/api/cafes', async (req, res) => {
  const apiKey = process.env.PUBLIC_DATA_API_KEY;
  const userLat = parseFloat(req.query.lat) || 37.566826;
  const userLng = parseFloat(req.query.lng) || 126.9786567;
  const radius = parseInt(req.query.radius) || 1000;

  if (!apiKey || apiKey.trim() === '' || apiKey.includes('여기에_공공데이터포털')) {
    return res.json({
      isRealData: false,
      message: ".env 파일에 PUBLIC_DATA_API_KEY를 설정하시면 실제 공공데이터 API 데이터로 자동 전환됩니다.",
      cafes: getMockCafesNearby(userLat, userLng, radius)
    });
  }

  try {
    const cafes = await fetchCafesFromPublicData(apiKey, userLat, userLng, radius);
    res.json({
      isRealData: true,
      message: `공공데이터포털 상가정보 API에서 내 위치 기준 1km 반경 내 카페 ${cafes.length}개를 불러왔습니다.`,
      cafes: cafes
    });
  } catch (error) {
    console.error('공공데이터 API 호출 오류:', error.message);
    // 키 동기화 대기 시간 동안 내 위치 기준 1km 반경 샘플 데이터 제공
    res.json({
      isRealData: false,
      error: error.message,
      message: "공공데이터포털 키 동기화 진행 중입니다. 내 위치 기준 1km 주변 카페를 안전하게 표시합니다.",
      cafes: getMockCafesNearby(userLat, userLng, radius)
    });
  }
});

// 호환성 유지용 /api/places
app.get('/api/places', async (req, res) => {
  const userLat = parseFloat(req.query.lat) || 37.566826;
  const userLng = parseFloat(req.query.lng) || 126.9786567;
  res.json(getMockCafesNearby(userLat, userLng, 1000));
});

/**
 * 사용자의 위도/경도(centerLat, centerLng)를 기준으로 1km 이내의 카페 5개 샘플 생성
 */
function getMockCafesNearby(centerLat, centerLng, radiusMeters = 1000) {
  // 1km 반경 내(약 100m ~ 700m 이격) 5개 카페 위치 계산
  const mockTemplates = [
    { name: "스타벅스 리저브점", category: "커피전문점/카페", icon: "☕", dLat: 0.0018, dLng: 0.0015 },
    { name: "블루보틀 로스터리", category: "커피전문점/카페", icon: "☕", dLat: -0.0022, dLng: 0.0028 },
    { name: "아우어 베이커리 카페", category: "제과제빵/카페", icon: "🥐", dLat: 0.0031, dLng: -0.0021 },
    { name: "투썸플레이스 디저트 카페", category: "커피/디저트", icon: "🍰", dLat: -0.0015, dLng: -0.0035 },
    { name: "컴포즈 커피", category: "커피전문점/카페", icon: "☕", dLat: 0.0042, dLng: 0.0019 }
  ];

  return mockTemplates.map((item, idx) => {
    const lat = centerLat + item.dLat;
    const lng = centerLng + item.dLng;
    const distance = getDistanceInMeters(centerLat, centerLng, lat, lng);
    
    return {
      name: item.name,
      category: item.category,
      address: `내 위치 주변 ${distance}m 지점`,
      lat: lat,
      lng: lng,
      distance: distance,
      desc: `[${item.category}] 내 위치 기준 ${distance}m 거리 (1km 반경 내)`,
      icon: item.icon
    };
  }).filter(item => item.distance <= radiusMeters);
}

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 실행 중입니다: http://localhost:${PORT}`);
});
