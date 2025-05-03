# 새 디렉토리 생성
mkdir live-streaming-website
cd live-streaming-website

# package.json 파일 생성
npm init -y

# 필요한 패키지 설치
npm install express socket.io node-media-server cors

# 기본 폴더 구조 생성
mkdir -p public/js
mkdir -p public/css
mkdir -p media/live
