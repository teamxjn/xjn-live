const express = require('express');
const router = express.Router();
const User = require('../models/User');

// 인증 확인 미들웨어
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: '로그인이 필요합니다.' });
};

// 스트리머 권한 확인 미들웨어
const isStreamer = (req, res, next) => {
  if (req.user.role === 'streamer' || req.user.role === 'admin') {
    return next();
  }
  res.status(403).json({ message: '스트리머 권한이 필요합니다.' });
};

// 스트리머 목록 가져오기
router.get('/streamers', async (req, res) => {
  try {
    const streamers = await User.find({ role: 'streamer' })
      .select('username nickname profileImage');
    
    res.json({ streamers });
  } catch (error) {
    console.error('스트리머 목록 조회 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 현재 활성 스트림 목록 (Node-Media-Server 인스턴스 필요)
router.get('/live', async (req, res) => {
  try {
    const nms = req.app.get('nms');
    const activeStreams = nms.getStreams();
    
    // 활성 스트림의 스트리머 정보 가져오기
    const streamsInfo = [];
    
    for (const appName in activeStreams) {
      for (const streamKey in activeStreams[appName]) {
        // 스트림 키로 스트리머 찾기
        const streamer = await User.findOne({ streamKey })
          .select('username nickname profileImage');
        
        if (streamer) {
          streamsInfo.push({
            username: streamer.username,
            nickname: streamer.nickname,
            profileImage: streamer.profileImage,
            streamPath: `/${appName}/${streamKey}`,
            viewers: activeStreams[appName][streamKey].viewers || 0
          });
        }
      }
    }
    
    res.json({ streams: streamsInfo });
  } catch (error) {
    console.error('활성 스트림 목록 조회 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 스트리머 정보 가져오기
router.get('/:username', async (req, res) => {
  try {
    const streamer = await User.findOne({ 
      username: req.params.username,
      role: 'streamer'
    }).select('username nickname profileImage');
    
    if (!streamer) {
      return res.status(404).json({ message: '스트리머를 찾을 수 없습니다.' });
    }
    
    res.json({ streamer });
  } catch (error) {
    console.error('스트리머 정보 조회 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 스트리머 정보 업데이트 (자신의 프로필만)
router.put('/profile', isAuthenticated, async (req, res) => {
  try {
    const { nickname, email } = req.body;
    
    // 필드 업데이트
    if (nickname) req.user.nickname = nickname;
    if (email) req.user.email = email;
    
    await req.user.save();
    
    res.json({ user: req.user.toAuthJSON() });
  } catch (error) {
    console.error('프로필 업데이트 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
