const express = require('express');
const cors = require('cors');
const path = require('path');
const NodeMediaServer = require('node-media-server');
const http = require('http');
const socketIo = require('socket.io');

// Express 앱 설정
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// HTTP 서버 생성
const server = http.createServer(app);
const io = socketIo(server);

// RTMP/HLS 서버 설정
const nmsConfig = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*'
  },
  trans: {
    ffmpeg: '/usr/bin/ffmpeg', // 자신의 ffmpeg 경로로 수정
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        dash: true,
        dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
      }
    ]
  }
};

// Node Media Server 인스턴스 생성
const nms = new NodeMediaServer(nmsConfig);

// 스트리밍 시작/종료 이벤트 핸들러
nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  
  // 스트림 시작 알림을 클라이언트에 전송
  io.emit('streamStart', { streamPath: StreamPath });
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  
  // 스트림 종료 알림을 클라이언트에 전송
  io.emit('streamEnd', { streamPath: StreamPath });
});

// Socket.io 이벤트 핸들러
io.on('connection', (socket) => {
  console.log('사용자 연결됨:', socket.id);
  
  // 채팅 메시지 처리
  socket.on('chatMessage', (message) => {
    io.emit('chatMessage', message);
  });
  
  socket.on('disconnect', () => {
    console.log('사용자 연결 해제:', socket.id);
  });
});

// 라우트 설정
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/streams', (req, res) => {
  const activeStreams = nms.getStreams();
  res.json({ streams: activeStreams });
});

// 서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Express 서버가 포트 ${PORT}에서 실행 중입니다.`);
});

// Node Media Server 시작
nms.run();
