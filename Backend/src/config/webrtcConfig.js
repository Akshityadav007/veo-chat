// config/webrtcConfig.js

const getWebRTCConfig = () => {
  return {
    iceServers: [
      // Google's public STUN servers
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      
      // If you have your own TURN server
      // {
      //   urls: 'turn:your-turn-server.com:3478',
      //   username: 'your-turn-username',
      //   credential: 'your-turn-password'
      // }
    ],
    iceCandidatePoolSize: 10
  };
};

// Endpoint to provide WebRTC config to clients
const express = require('express');
const router = express.Router();

router.get('/webrtc-config', (req, res) => {
  res.json(getWebRTCConfig());
});

module.exports = { getWebRTCConfig, router };