const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// public 폴더의 정적 파일을 서빙합니다
app.use(express.static(path.join(__dirname, 'public')));

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 실행 중입니다: http://localhost:${PORT}`);
});
