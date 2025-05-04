const express = require('express');
const cors = require('cors');
const path = require('path');
const NodeMediaServer = require('node-media-server');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const User = require('./models/User');

// Express 앱 설정
const app = express();
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// HTTP 서버 생성
const server = http.createServer(app);

// MongoDB 연결
mongoose.connect('mongodb://localhost:27017/livestream', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB 연결 성공'))
.catch(err => console.error('MongoDB 연결 오류:', err));

// 세션 설정
const sessionMiddleware = session({
  secret: 'your-secret-key', // 실제 환경에서는 환경 변수로 관리
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: 'mongodb://localhost:27017/livestream',
    collectionName: 'sessions'
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 24시간
  }
});

app.use(sessionMiddleware);

// Passport 초기화
app.use(passport.initialize());
app.use(passport.session());

// Passport 설정 불러오기
require('./config/passport')(passport);

// Socket.io 설정
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000',
    credentials: true
  }
});

// Socket.io에 세션 미들웨어 연결
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

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
  auth: {
    api: true,
    api_user: 'admin', // API 사용자 이름
    api_pass: 'admin' // API 비밀번호 (실제 환경에서는 환경 변수로 관리)
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

// 스트림 인증
nms.on('prePublish', async (id, StreamPath, args) => {
  console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  
  try {
    // 스트림 키 확인
    const streamKey = StreamPath.split('/')[2];
    
    // 스트림 키로 사용자 찾기
    const user = await User.findOne({ streamKey });
    
    if (!user || (user.role !== 'streamer' && user.role !== 'admin')) {
      const session = nms.getSession(id);
      session.reject();
      return;
    }
    
    // 스트림 시작 알림을 클라이언트에 전송
    io.emit('streamStart', { 
      streamPath: StreamPath,
      streamer: {
        username: user.username,
        nickname: user.nickname
      }
    });
  } catch (error) {
    console.error('스트림 인증 오류:', error);
    // 오류 발생 시 스트림 거부
    const session = nms.getSession(id);
    session.reject();
  }
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  
  // 스트림 종료 알림을 클라이언트에 전송
  io.emit('streamEnd', { streamPath: StreamPath });
});

// nms 인스턴스를 앱에 저장하여 라우터에서 접근 가능하게 함
app.set('nms', nms);

// 스트림별 시청자 관리
const streamViewers = new Map();

// Socket.io 이벤트 핸들러
io.on('connection', (socket) => {
  console.log('사용자 연결됨:', socket.id);
  
  // 사용자 정보
  let user = null;
  if (socket.request.session.passport && socket.request.session.passport.user) {
    user = {
      id: socket.request.session.passport.user,
      authenticated: true
    };
  } else {
    user = {
      id: socket.id,
      authenticated: false
    };
  }
  
  // 현재 시청 중인 스트림
  let currentStream = null;
  
  // 스트림 시청 시작
  socket.on('watchStream', async (data) => {
    const { streamPath } = data;
    
    // 이전 스트림에서 나가기
    if (currentStream) {
      leaveStream(currentStream);
    }
    
    // 새 스트림 참가
    currentStream = streamPath;
    joinStream(currentStream);
    
    // 해당 스트림의 채팅방 구독
    socket.join(`stream:${streamPath}`);
  });
  
  // 채팅 메시지 처리
  socket.on('chatMessage', async (message) => {
    if (!currentStream) return;
    
    let username = '익명';
    let isAuthenticated = false;
    
    // 인증된 사용자인 경우 정보 가져오기
    if (user.authenticated) {
      try {
        const userInfo = await User.findById(user.id).select('username nickname');
        if (userInfo) {
          username = userInfo.nickname || userInfo.username;
          isAuthenticated = true;
        }
      } catch (error) {
        console.error('사용자 정보 조회 오류:', error);
      }
    } else if (message.username) {
      username = message.username;
    }
    
    const chatMessage = {
      id: socket.id,
      username,
      content: message.content,
      time: new Date().toLocaleTimeString(),
      isAuthenticated
    };
    
    // 같은 스트림을 시청하는 모든 사용자에게 메시지 전송
    io.to(`stream:${currentStream}`).emit('chatMessage', chatMessage);
  });
  
  // 연결 종료
  socket.on('disconnect', () => {
    console.log('사용자 연결 해제:', socket.id);
    
    // 시청 중인 스트림이 있으면 나가기
    if (currentStream) {
      leaveStream(currentStream);
    }
  });
  
  // 스트림 참가 함수
  function joinStream(streamPath) {
    if (!streamViewers.has(streamPath)) {
      streamViewers.set(streamPath, new Set());
    }
    
    streamViewers.get(streamPath).add(socket.id);
    
    // 시청자 수 업데이트
    const viewerCount = streamViewers.get(streamPath).size;
    io.to(`stream:${streamPath}`).emit('viewerCount', { count: viewerCount });
  }
  
  // 스트림 나가기 함수
  function leaveStream(streamPath) {
    if (streamViewers.has(streamPath)) {
      streamViewers.get(streamPath).delete(socket.id);
      
      // 시청자 수 업데이트
      const viewerCount = streamViewers.get(streamPath).size;
      io.to(`stream:${streamPath}`).emit('viewerCount', { count: viewerCount });
      
      // 시청자가 없으면 Map에서 제거
      if (viewerCount === 0) {
        streamViewers.delete(streamPath);
      }
    }
    
    // 채팅방 나가기
    socket.leave(`stream:${streamPath}`);
  }
});

// 라우트 설정
app.use('/api/auth', require('./routes/auth'));
app.use('/api/streams', require('./routes/streams'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 처리
app.use((req, res) => {
  res.status(404).json({ message: '페이지를 찾을 수 없습니다.' });
});

// 오류 처리
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: '서버 오류가 발생했습니다.' });
});

// 서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Express 서버가 포트 ${PORT}에서 실행 중입니다.`);
});

// Node Media Server 시작
nms.run();
