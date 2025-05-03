document.addEventListener('DOMContentLoaded', () => {
  // 요소 참조
  const videoPlayer = document.getElementById('video-player');
  const noStreamMessage = document.getElementById('no-stream-message');
  const chatMessages = document.getElementById('chat-messages');
  const messageInput = document.getElementById('message-input');
  const sendButton = document.getElementById('send-button');
  const usernameInput = document.getElementById('username');
  const streamStatus = document.getElementById('stream-status');
  const streamTitle = document.getElementById('stream-title');
  const viewersCount = document.getElementById('viewers-count');
  
  // 소켓 연결
  const socket = io();
  
  // 연결된 시청자 수
  let viewerCount = 0;
  
  // HLS 플레이어 초기화
  let hls;
  if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90
    });
  } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
    // iOS 및 Safari의 네이티브 HLS 지원 사용
    console.log('네이티브 HLS 지원 사용');
  } else {
    console.error('HLS를 지원하지 않는 브라우저입니다.');
  }

  // 스트림 URL 설정 함수
  function setupStream(streamPath) {
    const streamKey = streamPath.split('/')[2];
    const hlsUrl = `http://localhost:8000/live/${streamKey}/index.m3u8`;
    
    if (Hls.isSupported()) {
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoPlayer);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoPlayer.play()
          .catch(error => {
            console.error('자동 재생 실패:', error);
            // 자동 재생 정책으로 인한 오류 처리
          });
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch(data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('네트워크 오류, 복구 시도...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('미디어 오류, 복구 시도...');
              hls.recoverMediaError();
              break;
            default:
              // 복구할 수 없는 오류
              hls.destroy();
              break;
          }
        }
      });
    } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
      // iOS Safari
      videoPlayer.src = hlsUrl;
      videoPlayer.addEventListener('loadedmetadata', () => {
        videoPlayer.play();
      });
    }
  }
  
  // 스트림 시작 이벤트 처리
  socket.on('streamStart', (data) => {
    console.log('스트림 시작:', data);
    noStreamMessage.hidden = true;
    videoPlayer.hidden = false;
    setupStream(data.streamPath);
    
    // UI 업데이트
    streamStatus.textContent = '온라인';
    streamStatus.classList.add('online');
    streamTitle.textContent = `라이브 방송 (${data.streamPath.split('/')[2]})`;
    
    // 채팅 활성화
    messageInput.disabled = false;
    sendButton.disabled = false;
  });
  
  // 스트림 종료 이벤트 처리
  socket.on('streamEnd', (data) => {
    console.log('스트림 종료:', data);
    noStreamMessage.hidden = false;
    videoPlayer.hidden = true;
    
    if (hls) {
      hls.destroy();
    }
    
    // UI 업데이트
    streamStatus.textContent = '오프라인';
    streamStatus.classList.remove('online');
    streamTitle.textContent = '스트림 제목';
    
    // 채팅 비활성화
    messageInput.disabled = true;
    sendButton.disabled = true;
    
    // 메시지 추가
    addSystemMessage('방송이 종료되었습니다.');
  });
  
  // 시청자 수 업데이트
  socket.on('connect', () => {
    viewerCount++;
    updateViewerCount();
    addSystemMessage('채팅에 연결되었습니다.');
  });
  
  socket.on('disconnect', () => {
    viewerCount = Math.max(0, viewerCount - 1);
    updateViewerCount();
  });
  
  // 채팅 메시지 수신
  socket.on('chatMessage', (message) => {
    addChatMessage(message);
  });
  
  // 채팅 메시지 전송
  sendButton.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  
  function sendMessage() {
    const content = messageInput.value.trim();
    const username = usernameInput.value.trim() || '익명';
    
    if (content) {
      const message = {
        username,
        content,
        time: new Date().toLocaleTimeString()
      };
      
      socket.emit('chatMessage', message);
      messageInput.value = '';
    }
  }
  
  // 채팅 메시지 추가
  function addChatMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    
    messageElement.innerHTML = `
      <span class="username">${escapeHTML(message.username)}</span>
      <span class="time">${message.time}</span>
      <div class="content">${escapeHTML(message.content)}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // 시스템 메시지 추가
  function addSystemMessage(text) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'system');
    
    messageElement.innerHTML = `
      <span class="username">시스템</span>
      <span class="time">${new Date().toLocaleTimeString()}</span>
      <div class="content">${text}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // 시청자 수 업데이트
  function updateViewerCount() {
    viewersCount.textContent = `시청자: ${viewerCount}명`;
  }
  
  // HTML 이스케이프 함수
  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  // 페이지 로드 시 스트림 확인
  fetch('/streams')
    .then(response => response.json())
    .then(data => {
      const streams = data.streams;
      if (Object.keys(streams).length > 0) {
        // 활성 스트림이 있을 경우
        const streamPath = Object.keys(streams)[0];
        socket.emit('streamStart', { streamPath });
      }
    })
    .catch(error => {
      console.error('스트림 정보를 가져오는 중 오류 발생:', error);
    });
});
