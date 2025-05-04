const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');

// 사용자 등록
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, nickname, role } = req.body;
    
    // 필수 필드 확인
    if (!username || !email || !password || !nickname) {
      return res.status(400).json({ message: '모든 필드를 입력해주세요.' });
    }
    
    // 사용자 이름 중복 확인
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: '이미 사용 중인 사용자 이름입니다.' });
    }
    
    // 이메일 중복 확인
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: '이미 사용 중인 이메일입니다.' });
    }
    
    // 새 사용자 생성
    const user = new User({
      username,
      email,
      password,
      nickname,
      role: role || 'viewer' // 기본값은 시청자
    });
    
    await user.save();
    
    // 자동 로그인
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ message: '로그인 중 오류가 발생했습니다.' });
      }
      return res.status(201).json({ user: user.toAuthJSON() });
    });
  } catch (error) {
    console.error('사용자 등록 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 로그인
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
    
    if (!user) {
      return res.status(401).json({ message: info.message });
    }
    
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ message: '로그인 중 오류가 발생했습니다.' });
      }
      
      return res.json({ user: user.toAuthJSON() });
    });
  })(req, res, next);
});

// 로그아웃
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ message: '로그아웃 중 오류가 발생했습니다.' });
    }
    res.json({ message: '로그아웃되었습니다.' });
  });
});

// 현재 사용자 정보
router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }
  
  res.json({ user: req.user.toAuthJSON() });
});

// 스트리머인 경우 스트림 키 가져오기
router.get('/streamkey', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }
  
  if (req.user.role !== 'streamer' && req.user.role !== 'admin') {
    return res.status(403).json({ message: '스트리머 권한이 필요합니다.' });
  }
  
  res.json({ streamKey: req.user.streamKey });
});

// 스트림 키 재생성
router.post('/reset-streamkey', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }
  
  if (req.user.role !== 'streamer' && req.user.role !== 'admin') {
    return res.status(403).json({ message: '스트리머 권한이 필요합니다.' });
  }
  
  try {
    req.user.streamKey = require('crypto').randomBytes(16).toString('hex');
    await req.user.save();
    
    res.json({ streamKey: req.user.streamKey });
  } catch (error) {
    console.error('스트림 키 재생성 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
