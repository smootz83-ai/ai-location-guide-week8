const DEFAULT_POSITION = { lat: 37.566826, lng: 126.978657 };
const state = {
  map: null,
  location: null,
  locationReady: false,
  placesService: null,
  radius: 1000,
  markers: [],
  myMarker: null,
  circle: null,
  infoWindow: null,
  places: []
};

const $ = (selector) => document.querySelector(selector);
const statusEl = $("#status");
const statusTextEl = $("#status-text");
const listEl = $("#places-list");

function distanceText(meters) {
  if (!Number.isFinite(meters)) return "";
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

function setStatus(message, type = "success") {
  statusTextEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function clearMarkers() {
  state.markers.forEach(({ marker }) => marker.setMap(null));
  state.markers = [];
  state.infoWindow?.close();
}

function cafeMarkerImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52">
    <path fill="#a26638" stroke="#fff" stroke-width="2" d="M22 1C10.4 1 1 10.1 1 21.3 1 36.1 22 51 22 51s21-14.9 21-29.7C43 10.1 33.6 1 22 1z"/>
    <path fill="#fff" d="M13 15h16v3h2.4a4.6 4.6 0 010 9.2H29A7 7 0 0122 33h-2a7 7 0 01-7-7V15zm16 6v3.2h2.4a1.6 1.6 0 000-3.2H29z"/>
  </svg>`;
  const source = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  return new kakao.maps.MarkerImage(
    source,
    new kakao.maps.Size(44, 52),
    { offset: new kakao.maps.Point(22, 52) }
  );
}

function drawSearchArea() {
  state.circle?.setMap(null);
  if (!state.map || state.radius === 0) return;
  state.circle = new kakao.maps.Circle({
    center: new kakao.maps.LatLng(state.location.lat, state.location.lng),
    radius: state.radius,
    strokeWeight: 2,
    strokeColor: "#a26638",
    strokeOpacity: .75,
    strokeStyle: "dashed",
    fillColor: "#d9b38c",
    fillOpacity: .14
  });
  state.circle.setMap(state.map);
}

function selectPlace(index) {
  const place = state.places[index];
  const markerEntry = state.markers[index];
  if (!place || !markerEntry) return;

  const position = new kakao.maps.LatLng(place.lat, place.lng);
  state.map.panTo(position);
  state.markers.forEach((entry, i) => entry.marker.setZIndex(i === index ? 20 : 1));
  document.querySelectorAll(".place-card").forEach((card, i) => card.classList.toggle("active", i === index));

  const content = document.createElement("div");
  content.style.cssText = "padding:11px 14px;max-width:240px;font:13px/1.45 sans-serif;color:#29241f";
  const strong = document.createElement("strong");
  strong.textContent = `☕ ${place.name}`;
  const detail = document.createElement("div");
  detail.style.cssText = "margin-top:3px;color:#756b61";
  detail.textContent = `${place.category} · ${distanceText(place.distance)}`;
  content.append(strong, detail);
  state.infoWindow.setContent(content);
  state.infoWindow.open(state.map, markerEntry.marker);
}

function showEmpty() {
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.textContent = "검색 결과가 없습니다. 반경을 넓혀보세요.";
  listEl.append(empty);
}

function renderResults() {
  clearMarkers();
  listEl.replaceChildren();
  $("#result-count").textContent = `${state.places.length}곳`;
  if (!state.places.length) return showEmpty();

  const bounds = new kakao.maps.LatLngBounds();
  const markerImage = cafeMarkerImage();
  state.places.forEach((place, index) => {
    const position = new kakao.maps.LatLng(place.lat, place.lng);
    const marker = new kakao.maps.Marker({ map: state.map, position, image: markerImage });
    kakao.maps.event.addListener(marker, "click", () => selectPlace(index));
    state.markers.push({ marker });
    bounds.extend(position);

    const card = document.createElement("button");
    card.type = "button";
    card.className = "place-card";
    card.addEventListener("click", () => selectPlace(index));

    const icon = document.createElement("span");
    icon.className = "place-icon";
    icon.textContent = "☕";
    const body = document.createElement("span");
    const name = document.createElement("span");
    name.className = "place-name";
    name.textContent = place.name;
    const meta = document.createElement("span");
    meta.className = "place-meta";
    meta.textContent = `${place.category} · ${place.address} · ${distanceText(place.distance)}`;
    body.append(name, meta);
    card.append(icon, body);
    listEl.append(card);
  });

  if (state.radius === 0 && state.places.length > 1) {
    state.map.setBounds(bounds, 60, 60, 60, 60);
  }
}

function findNearbyCafes(query) {
  return new Promise((resolve, reject) => {
    const collected = [];
    const location = new kakao.maps.LatLng(state.location.lat, state.location.lng);
    const options = {
      location,
      radius: state.radius,
      sort: kakao.maps.services.SortBy.DISTANCE,
      size: 15
    };

    const callback = (data, status, pagination) => {
      if (status === kakao.maps.services.Status.ZERO_RESULT) {
        resolve([]);
        return;
      }
      if (status !== kakao.maps.services.Status.OK) {
        reject(new Error("카카오 장소 검색에 실패했습니다."));
        return;
      }

      data.forEach((place) => {
        if (collected.length >= 20) return;
        collected.push({
          name: place.place_name,
          category: place.category_name.split(" > ").pop() || "카페",
          address: place.road_address_name || place.address_name || "주소 정보 없음",
          lat: Number(place.y),
          lng: Number(place.x),
          distance: Number(place.distance)
        });
      });

      if (collected.length < 20 && pagination.hasNextPage) {
        pagination.nextPage();
      } else {
        resolve(collected.slice(0, 20));
      }
    };

    if (query) {
      state.placesService.keywordSearch(query, callback, {
        ...options,
        category_group_code: "CE7"
      });
    } else {
      state.placesService.categorySearch("CE7", callback, options);
    }
  });
}

async function searchCafes() {
  const query = $("#search-input").value.trim();
  const button = $("#search-button");
  if (!state.locationReady || !state.location) {
    setStatus("현재 위치를 확인한 뒤 검색할 수 있습니다. 브라우저의 위치 권한을 허용해 주세요.", "error");
    return;
  }
  button.disabled = true;
  setStatus("카페 데이터를 불러오는 중입니다.", "loading");

  try {
    if (state.radius === 0) {
      const params = new URLSearchParams({
        lat: state.location.lat,
        lng: state.location.lng,
        radius: 0,
        query
      });
      const response = await fetch(`/api/cafes?${params}`);
      if (!response.ok) throw new Error("검색 정보를 가져오지 못했습니다.");
      const data = await response.json();
      state.places = Array.isArray(data.cafes) ? data.cafes.slice(0, 20) : [];
    } else {
      state.places = await findNearbyCafes(query);
    }
    renderResults();
    setStatus(
      state.places.length
        ? `${state.places.length}개의 카페를 찾았습니다. 목록이나 지도 마커를 눌러보세요.`
        : "검색 결과가 없습니다. 반경을 넓혀보세요.",
      state.places.length ? "success" : "error"
    );
  } catch (error) {
    state.places = [];
    renderResults();
    setStatus("카페 정보를 불러오지 못했습니다. 잠시 후 다시 검색해 주세요.", "error");
  } finally {
    button.disabled = false;
  }
}

function setLocation(location, allowed) {
  if (!allowed) {
    state.location = null;
    state.locationReady = false;
    state.places = [];
    renderResults();
    setStatus("현재 위치를 확인할 수 없습니다. 브라우저 설정에서 위치 권한을 허용한 뒤 새로고침해 주세요.", "error");
    return;
  }

  state.location = location;
  state.locationReady = true;
  const position = new kakao.maps.LatLng(location.lat, location.lng);
  state.map.setCenter(position);
  state.myMarker?.setMap(null);
  state.myMarker = new kakao.maps.Marker({ map: state.map, position, zIndex: 30 });
  drawSearchArea();
  setStatus(`현재 위치를 확인했습니다. 정확도 약 ${Math.round(location.accuracy)}m`, "success");
  searchCafes();
}

function initMap() {
  state.map = new kakao.maps.Map($("#map"), {
    center: new kakao.maps.LatLng(DEFAULT_POSITION.lat, DEFAULT_POSITION.lng),
    level: 5
  });
  state.infoWindow = new kakao.maps.InfoWindow({ removable: true });
  state.placesService = new kakao.maps.services.Places();

  if (!navigator.geolocation) return setLocation(null, false);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => setLocation({
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy
    }, true),
    () => setLocation(null, false),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function startAppWhenServicesReady() {
  let attempts = 0;
  const waitForServices = () => {
    if (kakao.maps.services?.Places) {
      initMap();
      return;
    }
    attempts += 1;
    if (attempts <= 100) {
      window.setTimeout(waitForServices, 50);
      return;
    }
    setStatus("카페 검색 기능을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.", "error");
  };
  waitForServices();
}

$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  searchCafes();
});

document.querySelectorAll(".radius-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".radius-chip").forEach((item) => item.classList.remove("active"));
    chip.classList.add("active");
    state.radius = Number(chip.dataset.radius);
    drawSearchArea();
    if (state.radius > 0 && state.location) {
      state.map.setCenter(new kakao.maps.LatLng(state.location.lat, state.location.lng));
      state.map.setLevel(state.radius === 1000 ? 5 : state.radius === 3000 ? 7 : 8);
    }
    searchCafes();
  });
});

if (window.kakao?.maps) {
  kakao.maps.load(startAppWhenServicesReady);
} else {
  setStatus("지도를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.", "error");
}
