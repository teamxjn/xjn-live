const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  nickname: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['viewer', 'streamer', 'admin'],
    default: 'viewer'
  },
  streamKey: {
    type: String,
    unique: true,
    sparse: true
  },
  profileImage: {
    type: String,
    default: '/images/default-profile.png'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date
  }
});

// 비밀번호 해싱
userSchema.pre('save', async function(next) {
  // 비밀번호가 수정되었을 때만 해싱
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// 스트리머인 경우 고유한 스트림 키 생성
userSchema.pre('save', function(next) {
  if (this.isNew && this.role === 'streamer' && !this.streamKey) {
    // 랜덤 스트림 키 생성
    this.streamKey = require('crypto').randomBytes(16).toString('hex');
  }
  next();
});

// 비밀번호 확인 메서드
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// 사용자 인증용 안전한 정보만 반환
userSchema.methods.toAuthJSON = function() {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    nickname: this.nickname,
    role: this.role,
    profileImage: this.profileImage
  };
};

const User = mongoose.model('User', userSchema);

module.exports = User;
