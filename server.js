const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// public 폴더의 정적 파일을 서빙합니다
app.use(express.static(path.join(__dirname, 'public')));

// [공공데이터포털 연동용 API 엔드포인트]
// 백엔드 서버에서 공공데이터 API를 대신 호출해 프론트엔드 CORS 에러 방지 및 API 키 보호
app.get('/api/places', async (req, res) => {
  const apiKey = process.env.PUBLIC_DATA_API_KEY;

  if (apiKey) {
    try {
      // 공공데이터 API 호출 예시 코드
      // const response = await fetch(`https://apis.data.go.kr/...&serviceKey=${apiKey}`);
      // const data = await response.json();
      // res.json(data);
    } catch (error) {
      console.error('공공데이터 연동 에러:', error);
      res.status(500).json({ error: '데이터를 불러오는 중 오류가 발생했습니다.' });
    }
  } else {
    // 기본장소 (목업) 데이터 반환
    res.json([
      {
        name: "서울시청",
        desc: "서울특별시의 행정 업무를 총괄하는 시청 건물이며, 넓은 잔디광장인 서울광장이 앞에 있습니다.",
        lat: 37.566826,
        lng: 126.9786567,
        icon: "🏛️"
      },
      {
        name: "강남역",
        desc: "대한민국 교통의 허브이자 트렌디한 패션, 맛집, 엔터테인먼트가 모여있는 활기찬 상권입니다.",
        lat: 37.497942,
        lng: 127.027621,
        icon: "🚇"
      },
      {
        name: "홍대입구역",
        desc: "젊은이들의 거리로 버스킹 공연, 예술적 감각의 카페, 개성 있는 쇼핑숍들이 가득한 문화 예술의 중심지입니다.",
        lat: 37.557527,
        lng: 126.9244669,
        icon: "🎨"
      }
    ]);
  }
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 실행 중입니다: http://localhost:${PORT}`);
});

