// frontend/src/App.jsx - Fixed WebSocket Connection

import React, { useState, useEffect, useCallback } from 'react';

// Hooks
const useWebSocket = (onMessage) => {
  const wsRef = React.useRef(null);
  const myIdRef = React.useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');

  const connectWebSocket = useCallback(() => {
    console.log('Connecting to WebSocket server...');
    setConnectionStatus('Connecting...');
    
    // More robust URL construction
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    
    // Try different port configurations based on environment
    let wsUrl;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      wsUrl = `${protocol}//${hostname}:8888`;
    } else {
      // For production or network access, try the same port as the web server first
      wsUrl = `${protocol}//${hostname}:8888`;
    }
    
    console.log('Connecting to:', wsUrl);
    
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    ws.onopen = () => {
      console.log('Connected to signaling server');
      reconnectAttempts = 0;
      setIsConnected(true);
      setConnectionStatus('Connected');
    };
    
    ws.onclose = (event) => {
      console.log('Disconnected from signaling server:', event.code, event.reason);
      setIsConnected(false);
      setConnectionStatus('Disconnected');
      myIdRef.current = null;
      
      // Only attempt reconnection if it wasn't a clean close and we haven't exceeded attempts
      if (!event.wasClean && reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = Math.min(2000 * Math.pow(2, reconnectAttempts - 1), 10000); // Exponential backoff
        setConnectionStatus(`Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
        console.log(`Reconnecting in ${delay}ms... Attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
        
        setTimeout(() => {
          if (wsRef.current === ws) { // Only reconnect if this is still the current connection
            connectWebSocket();
          }
        }, delay);
      } else if (reconnectAttempts >= maxReconnectAttempts) {
        setConnectionStatus('Connection failed - Please refresh');
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('Connection error');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        
        if (message.type === 'client-id') {
          myIdRef.current = message.clientId;
          setIsConnected(true);
          setConnectionStatus('Connected');
          console.log('Received client ID:', message.clientId);
        }
        
        onMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error, 'Raw data:', event.data);
      }
    };

    // Connection timeout
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        console.log('Connection timeout');
        ws.close();
        setConnectionStatus('Connection timeout');
      }
    }, 10000); // 10 second timeout

    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log('Connected to signaling server');
      reconnectAttempts = 0;
      setIsConnected(true);
      setConnectionStatus('Connected');
    };
  }, [onMessage]);

  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('Sending message:', message);
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('WebSocket not ready, message not sent:', message);
      return false;
    }
  }, []);

  const disconnect = useCallback((roomId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (roomId && myIdRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'leave-room',
          room: roomId,
          from: myIdRef.current
        }));
      }
      wsRef.current.close(1000, 'User disconnected'); // Clean close
    }
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
      }
    };
  }, [connectWebSocket]);

  return {
    wsRef,
    myIdRef,
    isConnected,
    connectionStatus,
    sendMessage,
    disconnect,
    reconnect: connectWebSocket
  };
};

// WebRTC Configuration
const createRTCConfiguration = () => ({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
});

// Utility functions
const generateRoomId = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
};

// Components
const ConnectionStatus = ({ isConnected, connectionStatus, myId, onReconnect }) => (
  <div className="flex items-center justify-center gap-4 mb-4">
    <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
      isConnected 
        ? 'bg-green-100 text-green-800 border border-green-200' 
        : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
    }`}>
      <div className={`w-2 h-2 rounded-full mr-2 ${
        isConnected ? 'bg-green-500' : 'bg-yellow-500'
      }`}></div>
      {connectionStatus}
      {myId && (
        <span className="ml-2 text-xs opacity-75">• ID: {myId}</span>
      )}
    </div>
    {!isConnected && (
      <button
        onClick={onReconnect}
        className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
      >
        Retry Connection
      </button>
    )}
  </div>
);

const ConnectionDebugInfo = ({ isConnected, connectionStatus }) => (
  <div className="bg-gray-100 border rounded-lg p-4 text-sm text-gray-700 mb-4">
    <h4 className="font-semibold mb-2">Connection Debug Info:</h4>
    <div>Status: <span className="font-mono">{connectionStatus}</span></div>
    <div>Protocol: <span className="font-mono">{window.location.protocol}</span></div>
    <div>Hostname: <span className="font-mono">{window.location.hostname}</span></div>
    <div>WebSocket URL: <span className="font-mono">
      {window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//{window.location.hostname}:8888
    </span></div>
    <div className="mt-2 text-xs text-gray-500">
      If connection fails, ensure the backend server is running on port 8888
    </div>
  </div>
);

const RoomControls = ({ roomId, setRoomId, joinRoom, isConnected }) => {
  const handleGenerateRoomId = () => {
    const newRoomId = generateRoomId();
    setRoomId(newRoomId);
  };

  const handleCopyRoomId = async () => {
    if (roomId) {
      const success = await copyToClipboard(roomId);
      if (success) {
        console.log('Room ID copied to clipboard');
      }
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h3 className="text-xl font-semibold mb-4 text-gray-800">Join or Create Room</h3>
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Enter Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value.toUpperCase())}
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black bg-white"
          onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
        />
        <button
          onClick={handleGenerateRoomId}
          className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          title="Generate Random Room ID"
        >
          🎲
        </button>
        {roomId && (
          <button
            onClick={handleCopyRoomId}
            className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            title="Copy Room ID"
          >
            📋
          </button>
        )}
      </div>
      <button
        onClick={joinRoom}
        disabled={!roomId.trim() || !isConnected}
        className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {isConnected ? 'Join Room' : 'Connecting to server...'}
      </button>
    </div>
  );
};

const CameraTest = ({ testCamera, cameraError, localVideoRef, isVideoOn, isAudioOn, localStreamRef }) => (
  <div className="bg-white rounded-xl shadow-lg p-6">
    <h3 className="text-xl font-semibold mb-4 text-gray-800">Camera & Audio Test</h3>
    <button
      onClick={testCamera}
      className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium mb-4"
    >
      Test Camera & Microphone
    </button>
    
    {cameraError && (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-4">
        <strong>Error:</strong> {cameraError}
      </div>
    )}
    
    <div className="relative">
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="w-full max-w-md h-64 bg-black rounded-lg object-cover mx-auto"
        style={{ transform: 'scaleX(-1)' }}
      />
      <div className="absolute bottom-3 left-3 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-sm">
        Camera Test
      </div>
      {!isVideoOn && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 text-white rounded-lg">
          <div className="text-center">
            <div className="text-2xl mb-2">📹</div>
            <div>Click "Test Camera" above</div>
          </div>
        </div>
      )}
    </div>
    
    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
      <div className={`p-3 rounded-lg ${isVideoOn ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
        <div className="font-medium">Camera</div>
        <div>{isVideoOn ? '✓ Working' : '○ Not active'}</div>
      </div>
      <div className={`p-3 rounded-lg ${isAudioOn && localStreamRef.current ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
        <div className="font-medium">Microphone</div>
        <div>{isAudioOn && localStreamRef.current ? '✓ Working' : '○ Not active'}</div>
      </div>
    </div>
  </div>
);

const ConnectingScreen = ({ roomId, localVideoRef }) => (
  <div className="max-w-md mx-auto text-center">
    <div className="bg-white rounded-xl shadow-lg p-8">
      <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
      <h3 className="text-xl font-semibold text-gray-800 mb-2">Connecting to room...</h3>
      <p className="text-gray-600">Room ID: {roomId}</p>
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-48 bg-black rounded-lg object-cover mt-4"
        style={{ transform: 'scaleX(-1)' }}
      />
    </div>
  </div>
);

const ControlButtons = ({ isVideoOn, isAudioOn, toggleCamera, toggleAudio, leaveRoom }) => (
  <div className="flex justify-center gap-4 mb-6">
    <button
      onClick={toggleCamera}
      className={`px-6 py-3 rounded-lg font-medium transition-colors ${
        isVideoOn 
          ? 'bg-gray-600 hover:bg-gray-700 text-white' 
          : 'bg-red-600 hover:bg-red-700 text-white'
      }`}
    >
      📹 {isVideoOn ? 'Camera On' : 'Camera Off'}
    </button>
    
    <button
      onClick={toggleAudio}
      className={`px-6 py-3 rounded-lg font-medium transition-colors ${
        isAudioOn 
          ? 'bg-gray-600 hover:bg-gray-700 text-white' 
          : 'bg-red-600 hover:bg-red-700 text-white'
      }`}
    >
      🎤 {isAudioOn ? 'Mic On' : 'Mic Off'}
    </button>
    
    <button
      onClick={leaveRoom}
      className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium"
    >
      Leave Room
    </button>
  </div>
);

const VideoGrid = ({ localVideoRef, isVideoOn, myId, remoteUsers, remoteStreamsRef, roomId }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    {/* Local video */}
    <div className="relative bg-black rounded-xl overflow-hidden shadow-lg">
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-64 object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
      <div className="absolute bottom-3 left-3 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-sm">
        You ({myId})
      </div>
      {!isVideoOn && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 text-white">
          <div className="text-center">
            <div className="text-3xl mb-2">📹</div>
            <div>Camera Off</div>
          </div>
        </div>
      )}
    </div>
    
    {/* Remote videos */}
    {remoteUsers.map(userId => (
      <div key={userId} className="relative bg-black rounded-xl overflow-hidden shadow-lg">
        <video
          autoPlay
          playsInline
          className="w-full h-64 object-cover"
          ref={(videoElement) => {
            if (videoElement && remoteStreamsRef.current[userId]) {
              videoElement.srcObject = remoteStreamsRef.current[userId];
              console.log('Set remote video stream for user:', userId);
            }
          }}
        />
        <div className="absolute bottom-3 left-3 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-sm">
          User {userId}
        </div>
      </div>
    ))}
    
    {/* Waiting placeholder */}
    {remoteUsers.length === 0 && (
      <div className="bg-gray-800 rounded-xl flex items-center justify-center text-white h-64 shadow-lg">
        <div className="text-center">
          <div className="text-2xl mb-3">👥</div>
          <div className="text-lg mb-2">Waiting for others...</div>
          <div className="text-sm text-gray-400">Share room ID: <strong>{roomId}</strong></div>
          <div className="text-xs text-gray-500 mt-2">Your ID: {myId}</div>
        </div>
      </div>
    )}
  </div>
);

// Main App Component
export default function App() {
  // State
  const [roomId, setRoomId] = useState('');
  const [inCall, setInCall] = useState(false);
  const [callStage, setCallStage] = useState('idle');
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  
  // Media state
  const localVideoRef = React.useRef(null);
  const localStreamRef = React.useRef(null);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [cameraError, setCameraError] = useState(null);
  
  // WebRTC state
  const peerConnectionsRef = React.useRef({});
  const remoteStreamsRef = React.useRef({});
  const [remoteUsers, setRemoteUsers] = useState([]);

  // Media functions
  const setVideoSource = useCallback(async (stream) => {
    return new Promise((resolve, reject) => {
      if (!localVideoRef.current || !stream) {
        reject(new Error('Video element or stream not available'));
        return;
      }

      const video = localVideoRef.current;
      video.srcObject = stream;
      
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
      };
      
      const onLoadedMetadata = () => {
        console.log('Video metadata loaded');
      };
      
      const onCanPlay = async () => {
        try {
          video.muted = true;
          await video.play();
          setIsVideoOn(true);
          cleanup();
          resolve();
        } catch (playError) {
          cleanup();
          reject(playError);
        }
      };
      
      const onError = (e) => {
        cleanup();
        reject(new Error('Video element error'));
      };
      
      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('error', onError);
      
      setTimeout(() => {
        cleanup();
        reject(new Error('Video load timeout'));
      }, 10000);
    });
  }, []);

  const initVideo = useCallback(async () => {
    try {
      if (localStreamRef.current && localStreamRef.current.active) {
        await setVideoSource(localStreamRef.current);
        return localStreamRef.current;
      }

      const constraints = {
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = true;
        setIsVideoOn(true);
      }
      if (audioTrack) {
        audioTrack.enabled = true;
        setIsAudioOn(true);
      }
      
      await setVideoSource(stream);
      return stream;
      
    } catch (err) {
      console.error('Failed to get media devices:', err);
      throw err;
    }
  }, [setVideoSource]);

  const testCamera = useCallback(async () => {
    try {
      setCameraError(null);
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = true;
        setIsVideoOn(true);
      }
      if (audioTrack) {
        audioTrack.enabled = true;
        setIsAudioOn(true);
      }
      
      await setVideoSource(stream);
      
    } catch (err) {
      console.error('Camera test failed:', err);
      setCameraError(err.message);
      setIsVideoOn(false);
    }
  }, [setVideoSource]);

  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
      }
    }
  }, []);

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioOn(audioTrack.enabled);
      }
    }
  }, []);

  // WebRTC functions
  const initPeerConnection = useCallback((userId) => {
    const pc = new RTCPeerConnection(createRTCConfiguration());
    peerConnectionsRef.current[userId] = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.ontrack = (event) => {
      remoteStreamsRef.current[userId] = event.streams[0];
      setRemoteUsers(prev => {
        if (!prev.includes(userId)) {
          return [...prev, userId];
        }
        return prev;
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && websocket.wsRef.current) {
        websocket.sendMessage({
          type: 'ice-candidate',
          target: userId,
          candidate: event.candidate,
          from: websocket.myIdRef.current,
          room: roomId
        });
      }
    };

    return pc;
  }, [roomId]);

  const createOffer = useCallback(async (peerId) => {
    const pc = initPeerConnection(peerId);
    
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      websocket.sendMessage({
        type: 'offer',
        target: peerId,
        from: websocket.myIdRef.current,
        sdp: offer,
        room: roomId
      });
    } catch (error) {
      console.error('Error creating offer for', peerId, ':', error);
    }
  }, [initPeerConnection, roomId]);

  // Signaling message handler
  const handleSignalingMessage = useCallback(async (message) => {
    try {
      const { type, from, candidate, sdp, peers, peerId } = message;
      console.log('Handling signaling message:', type, 'from:', from);

      switch (type) {
        case 'joined':
          console.log('Joined room successfully, existing peers:', peers);
          for (const existingPeerId of peers) {
            if (existingPeerId !== websocket.myIdRef.current) {
              await createOffer(existingPeerId);
            }
          }
          break;

      case 'peer-left':
        if (peerConnectionsRef.current[peerId]) {
          peerConnectionsRef.current[peerId].close();
          delete peerConnectionsRef.current[peerId];
          delete remoteStreamsRef.current[peerId];
          setRemoteUsers(prev => prev.filter(id => id !== peerId));
        }
        break;

      case 'offer':
        let pc = peerConnectionsRef.current[from];
        if (!pc) {
          pc = initPeerConnection(from);
        }
        
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          websocket.sendMessage({
            type: 'answer',
            target: from,
            from: websocket.myIdRef.current,
            sdp: answer,
            room: roomId
          });
        } catch (error) {
          console.error('Error handling offer:', error);
        }
        break;

      case 'answer':
        const answerPc = peerConnectionsRef.current[from];
        if (answerPc) {
          try {
            await answerPc.setRemoteDescription(new RTCSessionDescription(sdp));
          } catch (error) {
            console.error('Error handling answer:', error);
          }
        }
        break;

      case 'ice-candidate':
        const candidatePc = peerConnectionsRef.current[from];
        if (candidatePc && candidate) {
          try {
            await candidatePc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (error) {
            console.error('Error adding ICE candidate:', error);
          }
        }
        break;
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  }, []);

  // WebSocket connection
  const websocket = useWebSocket(handleSignalingMessage);

  // Room functions
  const joinRoom = useCallback(async () => {
    try {
      if (!roomId.trim()) {
        alert('Please enter a room ID');
        return;
      }

      if (!websocket.isConnected || !websocket.myIdRef.current) {
        alert('Not connected to server. Please check your connection and try again.');
        return;
      }

      console.log('Attempting to join room:', roomId);
      setCallStage('connecting');
      setCameraError(null);

      // Initialize video first
      try {
        await initVideo();
        console.log('Video initialized successfully');
      } catch (videoError) {
        console.error('Video initialization failed:', videoError);
        setCameraError(videoError.message);
        setCallStage('idle');
        return;
      }

      // Send join message
      const success = websocket.sendMessage({
        type: 'join-room',
        room: roomId,
        from: websocket.myIdRef.current
      });

      if (success) {
        console.log('Join room message sent successfully');
        setCallStage('in-call');
        setInCall(true);
      } else {
        throw new Error('Failed to send join room message');
      }
    } catch (err) {
      console.error('Error joining room:', err);
      alert('Failed to join room: ' + err.message);
      setCallStage('idle');
    }
  }, [roomId, websocket, initVideo]);

  const leaveRoom = useCallback(() => {
    console.log('Leaving room...');
    
    // Close all peer connections
    Object.keys(peerConnectionsRef.current).forEach(userId => {
      const pc = peerConnectionsRef.current[userId];
      if (pc) {
        pc.close();
      }
      delete peerConnectionsRef.current[userId];
      delete remoteStreamsRef.current[userId];
    });

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    }

    setIsVideoOn(false);
    setIsAudioOn(true);
    setInCall(false);
    setCallStage('idle');
    setRemoteUsers([]);

    websocket.sendMessage({
      type: 'leave-room',
      room: roomId,
      from: websocket.myIdRef.current
    });
  }, [roomId, websocket]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (inCall) {
        leaveRoom();
      }
    };
  }, [inCall, leaveRoom]);

    return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Video Chat Room</h1>
          <ConnectionStatus 
            isConnected={websocket.isConnected}
            connectionStatus={websocket.connectionStatus}
            myId={websocket.myIdRef.current}
            onReconnect={websocket.reconnect}
          />
          
          {/* Debug toggle button */}
          <button
            onClick={() => setShowDebugInfo(!showDebugInfo)}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            {showDebugInfo ? 'Hide' : 'Show'} Debug Info
          </button>
          
          {showDebugInfo && (
            <ConnectionDebugInfo 
              isConnected={websocket.isConnected}
              connectionStatus={websocket.connectionStatus}
            />
          )}
        </header>

        {/* Pre-call interface */}
        {callStage === 'idle' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <RoomControls
              roomId={roomId}
              setRoomId={setRoomId}
              joinRoom={joinRoom}
              isConnected={websocket.isConnected}
            />
            <CameraTest
              testCamera={testCamera}
              cameraError={cameraError}
              localVideoRef={localVideoRef}
              isVideoOn={isVideoOn}
              isAudioOn={isAudioOn}
              localStreamRef={localStreamRef}
            />
          </div>
        )}

        {/* Connecting screen */}
        {callStage === 'connecting' && (
          <ConnectingScreen roomId={roomId} localVideoRef={localVideoRef} />
        )}

        {/* In-call interface */}
        {callStage === 'in-call' && inCall && (
          <div className="space-y-6">
            <ControlButtons
              isVideoOn={isVideoOn}
              isAudioOn={isAudioOn}
              toggleCamera={toggleCamera}
              toggleAudio={toggleAudio}
              leaveRoom={leaveRoom}
            />
            
            <div className="text-center text-gray-600 mb-4 bg-white rounded-lg p-4 shadow">
              <div className="font-medium">Room: {roomId}</div>
              <div className="text-sm">Connected users: {remoteUsers.length + 1}</div>
            </div>
            
            <VideoGrid
              localVideoRef={localVideoRef}
              isVideoOn={isVideoOn}
              myId={websocket.myIdRef.current}
              remoteUsers={remoteUsers}
              remoteStreamsRef={remoteStreamsRef}
              roomId={roomId}
            />
          </div>
        )}
      </div>
    </div>
  );
}