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
 * 소상공인시장진흥공단 상가(상권)정보 API 조회를 처리하는 함수
 */
async function fetchCafesFromPublicData(apiKey, centerLat, centerLng, radiusMeters = 1000, query = '') {
  const encodedKey = apiKey.includes('%') ? apiKey : encodeURIComponent(apiKey);
  const isNationwide = radiusMeters === 0 || radiusMeters > 50000;
  
  // 소상공인 API 주소 후보군
  const endpoints = isNationwide
    ? [ `http://apis.data.go.kr/B553077/api/open/sdg/storeListInUpjong?serviceKey=${encodedKey}&pageNo=1&numOfRows=15&indsLclsCd=I2&type=json` ]
    : [
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
        let filtered = items.map((item, index) => {
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
            desc: `[${category}] ${address}${isNationwide ? '' : ` (거리: ${distance >= 1000 ? (distance/1000).toFixed(1)+'km' : distance+'m'})`}`,
            icon: "☕"
          };
        });

        // 반경 제한 적용 (전국 모드가 아닐 때)
        if (!isNationwide) {
          filtered = filtered.filter(item => item.distance <= radiusMeters);
        }

        // 검색어 입력 시 검색어 필터링
        if (query && query.trim() !== '') {
          const q = query.trim().toLowerCase();
          filtered = filtered.filter(item => 
            item.name.toLowerCase().includes(q) || 
            item.address.toLowerCase().includes(q) || 
            item.category.toLowerCase().includes(q)
          );
        }

        if (filtered.length > 0) {
          return filtered.slice(0, 12);
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('공공데이터포털 동기화 대기 중이거나 유효하지 않은 키입니다.');
}

// 1. 카페 데이터 조회 API 엔드포인트 (반경: 1000, 3000, 5000, 0(전국), 검색어: query)
app.get('/api/cafes', async (req, res) => {
  const apiKey = process.env.PUBLIC_DATA_API_KEY;
  const userLat = parseFloat(req.query.lat) || 37.566826;
  const userLng = parseFloat(req.query.lng) || 126.9786567;
  const radius = req.query.radius === 'all' || req.query.radius === '0' ? 0 : (parseInt(req.query.radius) || 1000);
  const query = req.query.query || '';

  if (!apiKey || apiKey.trim() === '' || apiKey.includes('여기에_공공데이터포털')) {
    return res.json({
      isRealData: false,
      message: ".env 파일에 PUBLIC_DATA_API_KEY를 설정하시면 실제 공공데이터 API 데이터로 자동 전환됩니다.",
      cafes: getMockCafesNearby(userLat, userLng, radius, query)
    });
  }

  try {
    const cafes = await fetchCafesFromPublicData(apiKey, userLat, userLng, radius, query);
    res.json({
      isRealData: true,
      message: `공공데이터포털 상가정보 API에서 검색 결과 ${cafes.length}개를 불러왔습니다.`,
      cafes: cafes
    });
  } catch (error) {
    console.error('공공데이터 API 호출 오류:', error.message);
    res.json({
      isRealData: false,
      error: error.message,
      message: "공공데이터포털 키 동기화 대기 중입니다. 안전한 테스트 카페 목록을 표시합니다.",
      cafes: getMockCafesNearby(userLat, userLng, radius, query)
    });
  }
});

// 호환성 유지용 /api/places
app.get('/api/places', async (req, res) => {
  const userLat = parseFloat(req.query.lat) || 37.566826;
  const userLng = parseFloat(req.query.lng) || 126.9786567;
  res.json(getMockCafesNearby(userLat, userLng, 1000, ''));
});

/**
 * 반경(1km, 3km, 5km, 전국) 및 검색어(query) 조건별 카페 목록 반환
 */
function getMockCafesNearby(centerLat, centerLng, radiusMeters = 1000, query = '') {
  const isNationwide = radiusMeters === 0;

  // 다양한 거리대별 풍부한 전국/반경 샘플 카페 템플릿
  const mockTemplates = [
    // 1km 이내
    { name: "스타벅스 리저브점", category: "커피전문점/카페", icon: "☕", dLat: 0.0018, dLng: 0.0015 },
    { name: "블루보틀 로스터리", category: "커피전문점/카페", icon: "☕", dLat: -0.0022, dLng: 0.0028 },
    { name: "아우어 베이커리 카페", category: "제과제빵/카페", icon: "🥐", dLat: 0.0031, dLng: -0.0021 },
    { name: "투썸플레이스 디저트 카페", category: "커피/디저트", icon: "🍰", dLat: -0.0015, dLng: -0.0035 },
    { name: "컴포즈 커피", category: "커피전문점/카페", icon: "☕", dLat: 0.0042, dLng: 0.0019 },

    // 1km ~ 3km 이내
    { name: "이디야 커피 3km점", category: "커피전문점/카페", icon: "☕", dLat: 0.0150, dLng: 0.0120 },
    { name: "할리스 커피 랜드마크점", category: "커피전문점/카페", icon: "☕", dLat: -0.0180, dLng: -0.0140 },
    { name: "폴바셋 드라이브스루", category: "커피전문점/카페", icon: "☕", dLat: 0.0210, dLng: -0.0180 },

    // 3km ~ 5km 이내
    { name: "드롭탑 뷰카페 5km점", category: "커피/디저트", icon: "🍰", dLat: 0.0350, dLng: 0.0280 },
    { name: "파스쿠찌 베이커리", category: "제과제빵/카페", icon: "🥐", dLat: -0.0380, dLng: 0.0310 },

    // 전국 주요 도심 카페 (전국 모드 전용)
    { name: "강남역 테라스 카페", category: "커피전문점/카페", icon: "☕", lat: 37.497942, lng: 127.027621, address: "서울특별시 강남구 강남대로 390" },
    { name: "홍대 버스킹 브런치 카페", category: "커피/디저트", icon: "🍰", lat: 37.557527, lng: 126.924466, address: "서울특별시 마포구 어울마당로 120" },
    { name: "부산 해운대 오션뷰 카페", category: "커피전문점/카페", icon: "☕", lat: 35.158700, lng: 129.160400, address: "부산광역시 해운대구 해운대해변로 264" },
    { name: "제주 애월 감성 카페", category: "커피전문점/카페", icon: "☕", lat: 33.465000, lng: 126.319000, address: "제주특별자치도 제주시 애월읍 애월로 11" }
  ];

  let list = mockTemplates.map((item, idx) => {
    let lat, lng, distance, address;
    if (item.lat && item.lng) {
      lat = item.lat;
      lng = item.lng;
      address = item.address;
      distance = getDistanceInMeters(centerLat, centerLng, lat, lng);
    } else {
      lat = centerLat + item.dLat;
      lng = centerLng + item.dLng;
      distance = getDistanceInMeters(centerLat, centerLng, lat, lng);
      address = `위치 지점 (${distance >= 1000 ? (distance/1000).toFixed(1)+'km' : distance+'m'})`;
    }

    const distText = distance >= 1000 ? `${(distance/1000).toFixed(1)}km` : `${distance}m`;

    return {
      name: item.name,
      category: item.category,
      address: address,
      lat: lat,
      lng: lng,
      distance: distance,
      desc: `[${item.category}] ${address} ${isNationwide ? '' : `(거리: 약 ${distText})`}`,
      icon: item.icon
    };
  });

  // 1. 반경 필터링 (전국 모드가 아닐 때)
  if (!isNationwide) {
    list = list.filter(item => item.distance <= radiusMeters);
  }

  // 2. 검색어 필터링
  if (query && query.trim() !== '') {
    const q = query.trim().toLowerCase();
    list = list.filter(item => 
      item.name.toLowerCase().includes(q) || 
      item.address.toLowerCase().includes(q) || 
      item.category.toLowerCase().includes(q)
    );
  }

  return list.slice(0, 10);
}

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 실행 중입니다: http://localhost:${PORT}`);
});
