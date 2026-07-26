require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));

function distanceInMeters(lat1, lng1, lat2, lng2) {
  const toRad = (value) => value * Math.PI / 180;
  const earth = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const localTemplates = [
  ["스타벅스 리저브", "커피전문점", .0018, .0015],
  ["블루보틀 커피", "커피전문점", -.0022, .0028],
  ["어반 베이커리 카페", "베이커리·카페", .0031, -.0021],
  ["테라스 디저트 카페", "디저트·카페", -.0015, -.0035],
  ["컴포즈커피", "커피전문점", .0042, .0019],
  ["이디야커피", "커피전문점", .015, .012],
  ["폴바셋", "커피전문점", -.018, -.014],
  ["로스터리 카페", "로스터리", .021, -.018],
  ["전망 좋은 북카페", "북카페", .035, .028],
  ["포레스트 베이커리", "베이커리·카페", -.038, .031]
];

const nationwideTemplates = [
  ["강남 스타벅스 카페", "커피전문점", "서울특별시 강남구 강남대로 390", 37.497942, 127.027621],
  ["홍대 로스터리 카페", "로스터리", "서울특별시 마포구 어울마당로 120", 37.557527, 126.924466],
  ["부산 해운대 오션뷰 카페", "커피전문점", "부산광역시 해운대구 해운대해변로 264", 35.1587, 129.1604],
  ["제주 애월 감성 카페", "커피전문점", "제주특별자치도 제주시 애월읍 애월로 11", 33.465, 126.319],
  ["대전 성심 베이커리 카페", "베이커리·카페", "대전광역시 중구 중앙로", 36.3287, 127.4273]
];

function mockCafes(lat, lng, radius, query) {
  const nationwide = radius === 0;
  const list = nationwide
    ? nationwideTemplates.map(([name, category, address, itemLat, itemLng]) => ({ name, category, address, lat: itemLat, lng: itemLng }))
    : localTemplates.map(([name, category, dLat, dLng]) => ({
        name, category, address: "현재 위치 주변", lat: lat + dLat, lng: lng + dLng
      }));

  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  return list
    .map((item) => ({ ...item, distance: distanceInMeters(lat, lng, item.lat, item.lng) }))
    .filter((item) => nationwide || item.distance <= radius)
    .filter((item) => !normalized || `${item.name} ${item.category} ${item.address}`.toLocaleLowerCase("ko-KR").includes(normalized))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, nationwide ? 8 : 12);
}

async function publicDataCafes(apiKey, lat, lng, radius, query) {
  if (radius === 0) return [];
  const key = apiKey.includes("%") ? apiKey : encodeURIComponent(apiKey);
  const url = new URL("https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius");
  url.search = new URLSearchParams({
    serviceKey: key, pageNo: "1", numOfRows: "100", radius: String(radius),
    cx: String(lng), cy: String(lat), indsLclsCd: "I2", type: "json"
  }).toString();
  // URLSearchParams가 인증키의 %를 다시 인코딩하지 않도록 복원합니다.
  const response = await fetch(url.toString().replace(encodeURIComponent(key), key), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) throw new Error(`공공데이터 API ${response.status}`);
  const data = await response.json();
  const items = data?.body?.items || data?.response?.body?.items || [];
  const q = query.trim().toLocaleLowerCase("ko-KR");
  return items.map((item) => {
    const itemLat = Number(item.lat);
    const itemLng = Number(item.lon);
    return {
      name: item.bizesNm || "이름 없는 카페",
      category: item.indsSclsNm || item.indsMclsNm || "카페",
      address: item.rdnmAdr || item.lnoAdr || "주소 정보 없음",
      lat: itemLat,
      lng: itemLng,
      distance: distanceInMeters(lat, lng, itemLat, itemLng)
    };
  }).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
    .filter((item) => item.distance <= radius)
    .filter((item) => !q || `${item.name} ${item.category} ${item.address}`.toLocaleLowerCase("ko-KR").includes(q))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 20);
}

app.get("/api/cafes", async (req, res) => {
  const lat = Number(req.query.lat) || 37.566826;
  const lng = Number(req.query.lng) || 126.978657;
  const radius = [0, 1000, 3000, 5000].includes(Number(req.query.radius)) ? Number(req.query.radius) : 1000;
  const query = String(req.query.query || "").slice(0, 80);
  let cafes = [];

  if (process.env.PUBLIC_DATA_API_KEY && radius > 0) {
    try {
      cafes = await publicDataCafes(process.env.PUBLIC_DATA_API_KEY, lat, lng, radius, query);
    } catch (error) {
      console.warn("공공데이터 조회 실패, 샘플 데이터 사용:", error.message);
    }
  }
  if (!cafes.length) cafes = mockCafes(lat, lng, radius, query);
  res.json({ cafes });
});

app.listen(PORT, () => {
  console.log(`카페 위치 안내 서버: http://localhost:${PORT}`);
});
