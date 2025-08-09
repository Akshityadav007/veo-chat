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

// ... (rest of your components remain the same)
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

// ... (include all your other components here - CameraTest, ConnectingScreen, ControlButtons, VideoGrid)

// Main App Component with improved error handling
export default function App() {
  // ... (all your existing state)
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

  // ... (all your existing functions)

  // Signaling message handler with better error handling
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

        // ... (rest of your message handling)
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  }, []);

  // WebSocket connection with reconnection capability
  const websocket = useWebSocket(handleSignalingMessage);

  // Improved room join with better error handling
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

  // ... (rest of your component logic)

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
            {/* Include your CameraTest component here */}
          </div>
        )}

        {/* Rest of your UI states */}
      </div>
    </div>
  );
}