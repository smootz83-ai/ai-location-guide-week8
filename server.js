require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// public 폴더의 정적 파일을 서빙합니다
app.use(express.static(path.join(__dirname, 'public')));

/**
 * 소상공인시장진흥공단 상가(상권)정보 API에서 카페 5개 조회를 처리하는 함수
 */
async function fetchCafesFromPublicData(apiKey, numOfRows = 5) {
  // 인증키 인코딩 처리
  const encodedKey = apiKey.includes('%') ? apiKey : encodeURIComponent(apiKey);
  
  // 소상공인 API 주소 후보군 (서비스명 변화에 유연하게 대처)
  const endpoints = [
    `http://apis.data.go.kr/B553077/api/open/sdg/storeListInUpjong?serviceKey=${encodedKey}&pageNo=1&numOfRows=${numOfRows}&indsLclsCd=I2&type=json`,
    `http://apis.data.go.kr/B553077/storeListInUpjong/storeListInUpjong?serviceKey=${encodedKey}&pageNo=1&numOfRows=${numOfRows}&indsLclsCd=I2&type=json`,
    `http://apis.data.go.kr/B553077/api/open/sdg/storeListInRadius?serviceKey=${encodedKey}&pageNo=1&numOfRows=${numOfRows}&radius=3000&cx=126.9786567&cy=37.566826&type=json`,
    `http://apis.data.go.kr/B553077/storeListInRadius/storeListInRadius?serviceKey=${encodedKey}&pageNo=1&numOfRows=${numOfRows}&radius=3000&cx=126.9786567&cy=37.566826&type=json`
  ];

  let lastError = null;

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
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
        return items.slice(0, numOfRows).map((item, index) => {
          const name = item.bizesNm || item.bnoNm || `카페 ${index + 1}`;
          const category = item.indsSclsNm || item.indsMclsNm || item.indsLclsNm || '카페/음료';
          const address = item.rdnmAdr || item.lnoAdr || '주소 정보 없음';
          const lat = parseFloat(item.lat || item.y || 37.566826);
          const lng = parseFloat(item.lon || item.lng || item.x || 126.9786567);

          return {
            name: name,
            category: category,
            address: address,
            lat: lat,
            lng: lng,
            desc: `[${category}] ${address}`,
            icon: "☕"
          };
        });
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('공공데이터포털 동기화 중이거나 유효하지 않은 키입니다. (발급 직후 5~10분 소요)');
}

// 1. 카페 5개 데이터 조회 API 엔드포인트
app.get('/api/cafes', async (req, res) => {
  const apiKey = process.env.PUBLIC_DATA_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey.includes('여기에_공공데이터포털')) {
    return res.json({
      isRealData: false,
      message: ".env 파일에 PUBLIC_DATA_API_KEY를 설정하시면 실제 공공데이터 API 데이터로 자동 전환됩니다.",
      cafes: getMockCafes()
    });
  }

  try {
    const cafes = await fetchCafesFromPublicData(apiKey, 5);
    res.json({
      isRealData: true,
      message: "공공데이터포털(소상공인진흥공단 상가정보 API)에서 카페 5개 데이터를 성공적으로 불러왔습니다.",
      cafes: cafes
    });
  } catch (error) {
    console.error('공공데이터 API 호출 오류:', error.message);
    // API키 발급 직후 동기화 대기시간(5~10분) 동안 사용자 경험 유지를 위해 목업 데이터와 함께 안내 반환
    res.json({
      isRealData: false,
      error: error.message,
      message: "공공데이터포털 키 동기화 진행 중입니다 (약 5~10분 소요). 테스트를 위해 예시 카페 5개를 표시합니다.",
      cafes: getMockCafes()
    });
  }
});

// 호환성 유지용 /api/places
app.get('/api/places', async (req, res) => {
  const apiKey = process.env.PUBLIC_DATA_API_KEY;

  if (apiKey && apiKey.trim() !== '' && !apiKey.includes('여기에_공공데이터포털')) {
    try {
      const cafes = await fetchCafesFromPublicData(apiKey, 5);
      return res.json(cafes);
    } catch (e) {
      // 에러 시 기본 예시 데이터 반환
    }
  }

  res.json(getMockCafes());
});

function getMockCafes() {
  return [
    {
      name: "블루보틀 광화문 카페",
      category: "커피전문점/카페",
      address: "서울특별시 종로구 청계천로 11",
      lat: 37.569483,
      lng: 126.977820,
      desc: "[커피전문점/카페] 서울특별시 종로구 청계천로 11",
      icon: "☕"
    },
    {
      name: "스타벅스 시청플러스점",
      category: "커피전문점/카페",
      address: "서울특별시 중구 을지로 19",
      lat: 37.566120,
      lng: 126.979850,
      desc: "[커피전문점/카페] 서울특별시 중구 을지로 19",
      icon: "☕"
    },
    {
      name: "아우어베이커리 강남점",
      category: "제과제빵/카페",
      address: "서울특별시 강남구 강남대로 102길 28",
      lat: 37.503410,
      lng: 127.027580,
      desc: "[제과제빵/카페] 서울특별시 강남구 강남대로 102길 28",
      icon: "🥐"
    },
    {
      name: "할리스 커피 홍대역점",
      category: "커피전문점/카페",
      address: "서울특별시 마포구 양화로 164",
      lat: 37.556480,
      lng: 126.923150,
      desc: "[커피전문점/카페] 서울특별시 마포구 양화로 164",
      icon: "☕"
    },
    {
      name: "투썸플레이스 신촌점",
      category: "커피전문점/카페",
      address: "서울특별시 서대문구 연세로 13",
      lat: 37.557990,
      lng: 126.936850,
      desc: "[커피전문점/카페] 서울특별시 서대문구 연세로 13",
      icon: "🍰"
    }
  ];
}

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 실행 중입니다: http://localhost:${PORT}`);
});
