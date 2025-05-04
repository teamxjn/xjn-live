const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/User');

module.exports = function(passport) {
  // 사용자 이름과 비밀번호로 인증하는 전략
  passport.use(new LocalStrategy(
    {
      usernameField: 'username',
      passwordField: 'password'
    },
    async (username, password, done) => {
      try {
        // 사용자 찾기
        const user = await User.findOne({ username });
        
        // 사용자가 없는 경우
        if (!user) {
          return done(null, false, { message: '사용자를 찾을 수 없습니다.' });
        }
        
        // 비밀번호 확인
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
          return done(null, false, { message: '비밀번호가 일치하지 않습니다.' });
        }
        
        // 로그인 시간 업데이트
        user.lastLogin = Date.now();
        await user.save();
        
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));
  
  // 사용자 ID 직렬화 (세션에 저장)
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });
  
  // 사용자 ID 역직렬화 (세션에서 사용자 복원)
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
};
