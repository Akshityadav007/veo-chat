// frontend/src/App.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';

/* ============================
   useWebSocket hook (stable)
   - keeps onMessage in a ref so we don't recreate connect function
   ============================ */
const useWebSocket = (onMessage) => {
  const wsRef = useRef(null);
  const myIdRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const connectWebSocket = useCallback(() => {
    console.log('Connecting to WebSocket server...');
    setConnectionStatus('Connecting...');

    // use same-origin /ws so Vite proxy (or server) can map to backend
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
    console.log('Connecting to (proxied):', wsUrl);

    // close previous if any
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) {}
      wsRef.current = null;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let connectionTimeout = null;

    const safeSetDisconnected = (reason) => {
      setIsConnected(false);
      setConnectionStatus('Disconnected');
      myIdRef.current = null;
      console.log('WS disconnected:', reason);
    };

    ws.onopen = () => {
      if (connectionTimeout) { clearTimeout(connectionTimeout); connectionTimeout = null; }
      reconnectAttempts = 0;
      setIsConnected(true);
      setConnectionStatus('Connected');
      console.log('WebSocket open');
    };

    ws.onmessage = (event) => {
      // verbose frame logging (helpful while debugging)
      console.log('WS frame raw:', event.data);
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'client-id') {
          myIdRef.current = message.clientId;
          setIsConnected(true);
          setConnectionStatus('Connected');
          console.log('Received client ID:', message.clientId);
        }
        if (onMessageRef.current) onMessageRef.current(message);
      } catch (err) {
        console.error('Invalid WS message:', err, event.data);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setConnectionStatus('Connection error');
    };

    ws.onclose = (event) => {
      safeSetDisconnected(`code=${event.code} reason=${event.reason} wasClean=${event.wasClean}`);
      // reconnect logic (backoff)
      if (!event.wasClean && reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = Math.min(2000 * Math.pow(2, reconnectAttempts - 1), 10000);
        setConnectionStatus(`Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
        console.log(`Reconnecting in ${delay}ms`);
        setTimeout(() => {
          if (!wsRef.current || wsRef.current === ws) {
            connectWebSocket();
          }
        }, delay);
      } else if (reconnectAttempts >= maxReconnectAttempts) {
        setConnectionStatus('Connection failed - Please refresh');
      }
    };

    // connection timeout (10s)
    connectionTimeout = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        console.warn('WebSocket connection timed out');
        try { ws.close(); } catch (e) {}
        setConnectionStatus('Connection timeout');
      }
    }, 10000);

    return () => {
      if (connectionTimeout) clearTimeout(connectionTimeout);
    };
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        try { wsRef.current.close(1000, 'Component unmounted'); } catch (e) {}
      }
    };
  }, [connectWebSocket]);

  const sendMessage = useCallback((message) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('WS not open. Message not sent:', message);
      return false;
    }
  }, []);

  const disconnect = useCallback((roomId) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (roomId && myIdRef.current) {
        ws.send(JSON.stringify({ type: 'leave-room', room: roomId, from: myIdRef.current }));
      }
      try { ws.close(1000, 'User disconnected'); } catch (e) {}
    }
  }, []);

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

/* ==============
   WebRTC utils & UI components (Tailwind kept)
   ============== */

const createRTCConfiguration = () => ({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
});

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const copyToClipboard = async (text) => {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (err) { console.error('Clipboard failed:', err); return false; }
};

const ConnectionStatus = ({ isConnected, connectionStatus, myId, onReconnect }) => (
  <div className="flex items-center justify-center gap-4 mb-4">
    <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
      isConnected ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
    }`}>
      <div className={`w-2 h-2 rounded-full mr-2 ${ isConnected ? 'bg-green-500' : 'bg-yellow-500' }`} />
      {connectionStatus}
      {myId && <span className="ml-2 text-xs opacity-75">• ID: {myId}</span>}
    </div>
    {!isConnected && (
      <button onClick={onReconnect} className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
        Retry Connection
      </button>
    )}
  </div>
);

const RoomControls = ({ roomId, setRoomId, joinRoom, isConnected, callStage }) => {
  const handleGenerateRoomId = () => setRoomId(generateRoomId());
  const handleCopyRoomId = async () => { if (roomId) { const s = await copyToClipboard(roomId); if (s) console.log('Copied'); } };
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
        <button onClick={handleGenerateRoomId} className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors" title="Generate Random Room ID">🎲</button>
        {roomId && <button onClick={handleCopyRoomId} className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors" title="Copy Room ID">📋</button>}
      </div>
      <button
        onClick={joinRoom}
        disabled={!roomId.trim() || !isConnected || callStage !== 'idle'}
        className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {isConnected ? (callStage === 'idle' ? 'Join Room' : (callStage === 'connecting' ? 'Connecting...' : 'In Call')) : 'Connecting to server...'}
      </button>
    </div>
  );
};

const CameraTest = ({ testCamera, cameraError, localVideoRef, isVideoOn, isAudioOn, localStreamRef }) => (
  <div className="bg-white rounded-xl shadow-lg p-6">
    <h3 className="text-xl font-semibold mb-4 text-gray-800">Camera & Audio Test</h3>
    <button onClick={testCamera} className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium mb-4">Test Camera & Microphone</button>
    {cameraError && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-4"><strong>Error:</strong> {cameraError}</div>}
    <div className="relative">
      <video ref={localVideoRef} autoPlay playsInline muted className="w-full max-w-md h-64 bg-black rounded-lg object-cover mx-auto" style={{ transform: 'scaleX(-1)' }} />
      <div className="absolute bottom-3 left-3 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-sm">Camera Test</div>
      {!isVideoOn && <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 text-white rounded-lg"><div className="text-center"><div className="text-2xl mb-2">📹</div><div>Click "Test Camera" above</div></div></div>}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
      <div className={`p-3 rounded-lg ${isVideoOn ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}><div className="font-medium">Camera</div><div>{isVideoOn ? '✓ Working' : '○ Not active'}</div></div>
      <div className={`p-3 rounded-lg ${isAudioOn && localStreamRef.current ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}><div className="font-medium">Microphone</div><div>{isAudioOn && localStreamRef.current ? '✓ Working' : '○ Not active'}</div></div>
    </div>
  </div>
);

const ConnectingScreen = ({ roomId, localVideoRef }) => (
  <div className="max-w-md mx-auto text-center">
    <div className="bg-white rounded-xl shadow-lg p-8">
      <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
      <h3 className="text-xl font-semibold text-gray-800 mb-2">Connecting to room...</h3>
      <p className="text-gray-600">Room ID: {roomId}</p>
      <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-48 bg-black rounded-lg object-cover mt-4" style={{ transform: 'scaleX(-1)' }} />
    </div>
  </div>
);

const ControlButtons = ({ isVideoOn, isAudioOn, toggleCamera, toggleAudio, leaveRoom }) => (
  <div className="flex justify-center gap-4 mb-6">
    <button onClick={toggleCamera} className={`px-6 py-3 rounded-lg font-medium transition-colors ${isVideoOn ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}>📹 {isVideoOn ? 'Camera On' : 'Camera Off'}</button>
    <button onClick={toggleAudio} className={`px-6 py-3 rounded-lg font-medium transition-colors ${isAudioOn ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}>🎤 {isAudioOn ? 'Mic On' : 'Mic Off'}</button>
    <button onClick={leaveRoom} className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium">Leave Room</button>
  </div>
);

const VideoGrid = ({ localVideoRef, isVideoOn, myId, remoteUsers, remoteStreamsRef, roomId }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    <div className="relative bg-black rounded-xl overflow-hidden shadow-lg">
      <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-64 object-cover" style={{ transform: 'scaleX(-1)' }} />
      <div className="absolute bottom-3 left-3 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-sm">You ({myId})</div>
      {!isVideoOn && <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 text-white"><div className="text-center"><div className="text-3xl mb-2">📹</div><div>Camera Off</div></div></div>}
    </div>

    {remoteUsers.map(userId => (
      <div key={userId} className="relative bg-black rounded-xl overflow-hidden shadow-lg">
        <video autoPlay playsInline className="w-full h-64 object-cover" ref={(el) => { if (el && remoteStreamsRef.current[userId]) el.srcObject = remoteStreamsRef.current[userId]; }} />
        <div className="absolute bottom-3 left-3 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-sm">User {userId}</div>
      </div>
    ))}

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

/* ==========================
   FULL App component
   ========================== */
export default function App() {
  // app state
  const [roomId, setRoomId] = useState('');
  const [inCall, setInCall] = useState(false);
  const [callStage, setCallStage] = useState('idle'); // idle | connecting | in-call
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  // media refs/state
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [cameraError, setCameraError] = useState(null);

  // webRTC refs/state
  const peerConnectionsRef = useRef({});
  const remoteStreamsRef = useRef({});
  const [remoteUsers, setRemoteUsers] = useState([]);

  // join guard
  const joinInProgressRef = useRef(false);

  /* ---------- media helpers ---------- */
  const setVideoSource = useCallback(async (stream) => {
    return new Promise((resolve, reject) => {
      if (!localVideoRef.current || !stream) { reject(new Error('Video element or stream not available')); return; }
      const video = localVideoRef.current;
      video.srcObject = stream;

      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
      };

      const onLoadedMetadata = () => {/* no-op */};
      const onCanPlay = async () => {
        try { video.muted = true; await video.play(); setIsVideoOn(true); cleanup(); resolve(); }
        catch (playError) { cleanup(); reject(playError); }
      };
      const onError = () => { cleanup(); reject(new Error('Video element error')); };

      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('error', onError);

      setTimeout(() => { cleanup(); reject(new Error('Video load timeout')); }, 10000);
    });
  }, []);

  const initVideo = useCallback(async () => {
    try {
      if (localStreamRef.current && localStreamRef.current.active) { await setVideoSource(localStreamRef.current); return localStreamRef.current; }
      const constraints = {
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      if (videoTrack) { videoTrack.enabled = true; setIsVideoOn(true); }
      if (audioTrack) { audioTrack.enabled = true; setIsAudioOn(true); }
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
      if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      if (videoTrack) { videoTrack.enabled = true; setIsVideoOn(true); }
      if (audioTrack) { audioTrack.enabled = true; setIsAudioOn(true); }
      await setVideoSource(stream);
    } catch (err) {
      console.error('Camera test failed:', err);
      setCameraError(err.message || 'Camera error');
      setIsVideoOn(false);
    }
  }, [setVideoSource]);

  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const t = localStreamRef.current.getVideoTracks()[0];
      if (t) { t.enabled = !t.enabled; setIsVideoOn(t.enabled); }
    }
  }, []);

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const t = localStreamRef.current.getAudioTracks()[0];
      if (t) { t.enabled = !t.enabled; setIsAudioOn(t.enabled); }
    }
  }, []);

  /* ---------- signaling handler ---------- */
  const handleSignalingMessage = useCallback(async (message) => {
    try {
      const { type, from, sdp, candidate, peers, peerId } = message;
      switch (type) {
        case 'joined':
          // peers is array of ids
          for (const existing of peers) {
            if (existing && existing !== websocket.myIdRef.current) {
              await createOffer(existing);
            }
          }
          break;
        case 'peer-joined': {
          const newPeerId = peerId || from || message.peerId;
          if (newPeerId && newPeerId !== websocket.myIdRef.current) {
            console.log('peer-joined -> creating offer to:', newPeerId);
            await createOffer(newPeerId);
          }
          break;
        }
        case 'offer': {
          let pc = peerConnectionsRef.current[from];
          if (!pc) pc = initPeerConnection(from);
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          websocket.sendMessage({ type: 'answer', target: from, from: websocket.myIdRef.current, sdp: answer, room: roomId.trim().toUpperCase() });
          break;
        }
        case 'answer': {
          const pc = peerConnectionsRef.current[from];
          if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          break;
        }
        case 'ice-candidate': {
          const pc = peerConnectionsRef.current[from];
          if (pc && candidate) {
            try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.error(e); }
          }
          break;
        }
        case 'peer-left': {
          const id = peerId || from;
          if (peerConnectionsRef.current[id]) {
            peerConnectionsRef.current[id].close();
            delete peerConnectionsRef.current[id];
            delete remoteStreamsRef.current[id];
            setRemoteUsers(prev => prev.filter(x => x !== id));
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error('Error in signaling handler:', err);
    }
  }, []); // intentionally stable

  /* ---------- useWebSocket instance ---------- */
  const websocket = useWebSocket(handleSignalingMessage);

  /* ---------- WebRTC helpers (init/createOffer) ---------- */
  const initPeerConnection = useCallback((userId) => {
    const pc = new RTCPeerConnection(createRTCConfiguration());
    peerConnectionsRef.current[userId] = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
    }

    pc.ontrack = (event) => {
      remoteStreamsRef.current[userId] = event.streams[0];
      setRemoteUsers(prev => prev.includes(userId) ? prev : [...prev, userId]);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        websocket.sendMessage({ type: 'ice-candidate', target: userId, candidate: event.candidate, from: websocket.myIdRef.current, room: roomId.trim().toUpperCase() });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        if (peerConnectionsRef.current[userId]) {
          peerConnectionsRef.current[userId].close();
          delete peerConnectionsRef.current[userId];
        }
        delete remoteStreamsRef.current[userId];
        setRemoteUsers(prev => prev.filter(id => id !== userId));
      }
    };

    return pc;
  }, [roomId, websocket]);

  const createOffer = useCallback(async (peerId) => {
    const pc = initPeerConnection(peerId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      websocket.sendMessage({ type: 'offer', target: peerId, from: websocket.myIdRef.current, sdp: offer, room: roomId.trim().toUpperCase() });
    } catch (err) {
      console.error('createOffer error:', err);
    }
  }, [initPeerConnection, roomId, websocket]);

  /* ---------- Room functions ---------- */
  const joinRoom = useCallback(async () => {
    // guard double join
    if (joinInProgressRef.current) return;
    joinInProgressRef.current = true;

    try {
      const normalizedRoom = (roomId || '').trim().toUpperCase();
      if (!normalizedRoom) { alert('Please enter a room ID'); return; }
      if (!websocket.isConnected || !websocket.myIdRef.current) { alert('Not connected to server'); return; }

      setCallStage('connecting');
      setCameraError(null);

      try {
        await initVideo();
      } catch (err) {
        setCameraError(err.message || 'Camera init failed');
        setCallStage('idle');
        return;
      }

      const ok = websocket.sendMessage({ type: 'join-room', room: normalizedRoom, from: websocket.myIdRef.current });
      if (ok) { setCallStage('in-call'); setInCall(true); }
      else throw new Error('Failed to send join message');
    } catch (err) {
      console.error('joinRoom error:', err);
      alert('Failed to join room: ' + (err.message || err));
      setCallStage('idle');
    } finally {
      joinInProgressRef.current = false;
    }
  }, [roomId, websocket, initVideo]);

  const leaveRoom = useCallback(() => {
    const normalizedRoom = (roomId || '').trim().toUpperCase();
    // close peers
    Object.keys(peerConnectionsRef.current).forEach(id => {
      try { peerConnectionsRef.current[id].close(); } catch (e) {}
      delete peerConnectionsRef.current[id];
      delete remoteStreamsRef.current[id];
    });

    // stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    }

    setIsVideoOn(false);
    setIsAudioOn(true);
    setInCall(false);
    setCallStage('idle');
    setRemoteUsers([]);

    if (normalizedRoom && websocket.myIdRef.current) {
      websocket.sendMessage({ type: 'leave-room', room: normalizedRoom, from: websocket.myIdRef.current });
    } else {
      // ensure socket closed if no room
      // websocket.disconnect() // don't forcibly close socket here; keep connection for reuse
    }
  }, [roomId, websocket]);

  // send leave-room on unload to avoid orphaned rooms
  useEffect(() => {
    const onUnload = () => {
      try {
        const normalizedRoom = (roomId || '').trim().toUpperCase();
        if (normalizedRoom && websocket.myIdRef.current) {
          websocket.sendMessage({ type: 'leave-room', room: normalizedRoom, from: websocket.myIdRef.current });
        }
      } catch (e) { /* best effort */ }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [roomId, websocket]);

  // cleanup on component unmount
  useEffect(() => {
    return () => {
      if (inCall) leaveRoom();
    };
  }, [inCall, leaveRoom]);

  /* ============================
     Render
     ============================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Video Chat Room</h1>
          <ConnectionStatus isConnected={websocket.isConnected} connectionStatus={websocket.connectionStatus} myId={websocket.myIdRef.current} onReconnect={websocket.reconnect} />
          <button onClick={() => setShowDebugInfo(s => !s)} className="text-sm text-gray-500 hover:text-gray-700 underline">{showDebugInfo ? 'Hide' : 'Show'} Debug Info</button>
          {showDebugInfo && <div className="mt-4 text-sm text-gray-600">WS: {window.location.protocol === 'https:' ? 'wss' : 'ws'}://{window.location.hostname}/ws</div>}
        </header>

        {callStage === 'idle' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <RoomControls roomId={roomId} setRoomId={setRoomId} joinRoom={joinRoom} isConnected={websocket.isConnected} callStage={callStage} />
            <CameraTest testCamera={testCamera} cameraError={cameraError} localVideoRef={localVideoRef} isVideoOn={isVideoOn} isAudioOn={isAudioOn} localStreamRef={localStreamRef} />
          </div>
        )}

        {callStage === 'connecting' && <ConnectingScreen roomId={roomId} localVideoRef={localVideoRef} />}

        {callStage === 'in-call' && inCall && (
          <div className="space-y-6">
            <ControlButtons isVideoOn={isVideoOn} isAudioOn={isAudioOn} toggleCamera={toggleCamera} toggleAudio={toggleAudio} leaveRoom={leaveRoom} />
            <div className="text-center text-gray-600 mb-4 bg-white rounded-lg p-4 shadow">
              <div className="font-medium">Room: {roomId.trim().toUpperCase()}</div>
              <div className="text-sm">Connected users: {remoteUsers.length + 1}</div>
            </div>
            <VideoGrid localVideoRef={localVideoRef} isVideoOn={isVideoOn} myId={websocket.myIdRef.current} remoteUsers={remoteUsers} remoteStreamsRef={remoteStreamsRef} roomId={roomId} />
          </div>
        )}
      </div>
    </div>
  );
}
