// frontend/src/App.jsx


import { useEffect, useRef, useState } from 'react';

// Generate a simple unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

// Creates a new WebRTC peer connection with ICE servers
const createRTCConfiguration = () => ({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
});

export default function App() {
  // WebSocket state
  const wsRef = useRef(null);
  const myIdRef = useRef(null); // Will be set by server
  
  // Video states
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [cameraError, setCameraError] = useState(null);
  
  // Room states
  const [roomId, setRoomId] = useState('');
  const [inCall, setInCall] = useState(false);
  const [callStage, setCallStage] = useState('idle');
  const [isConnected, setIsConnected] = useState(false); 
  
  // Peer connections
  const peerConnectionsRef = useRef({});
  const remoteStreamsRef = useRef({});
  const [remoteUsers, setRemoteUsers] = useState([]);

  // Helper function to set video source with better error handling
  const setVideoSource = async (stream) => {
    return new Promise((resolve, reject) => {
      if (!localVideoRef.current || !stream) {
        reject(new Error('Video element or stream not available'));
        return;
      }

      const video = localVideoRef.current;
      console.log('Setting video source, stream tracks:', stream.getTracks().length);
      
      // Set the stream
      video.srcObject = stream;
      
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
      };
      
      const onLoadedMetadata = () => {
        console.log('Video metadata loaded, dimensions:', video.videoWidth, 'x', video.videoHeight);
      };
      
      const onCanPlay = async () => {
        console.log('Video can play, attempting to start...');
        try {
          // Ensure video is not paused
          video.muted = true; // Ensure it's muted for autoplay
          await video.play();
          console.log('Video started playing successfully');
          console.log('Video dimensions after play:', video.videoWidth, 'x', video.videoHeight);
          console.log('Video paused:', video.paused, 'ended:', video.ended);
          setIsVideoOn(true);
          cleanup();
          resolve();
        } catch (playError) {
          console.error('Video play failed:', playError);
          cleanup();
          reject(playError);
        }
      };
      
      const onError = (e) => {
        console.error('Video error:', e?.target?.error?.message || e);
        cleanup();
        reject(new Error('Video element error'));
      };
      
      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('error', onError);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        cleanup();
        reject(new Error('Video load timeout'));
      }, 10000);
    });
  };

  // Toggle camera on/off
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
        
        // Update all peer connections
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track === videoTrack);
          if (sender) {
            // The track is already added, just toggle enabled state
            console.log('Toggled video track:', videoTrack.enabled);
          }
        });
      }
    }
  };

  // Toggle microphone on/off
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioOn(audioTrack.enabled);
        
        // Update all peer connections
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track === audioTrack);
          if (sender) {
            console.log('Toggled audio track:', audioTrack.enabled);
          }
        });
      }
    }
  };

  // Test camera function
  const testCamera = async () => {
    try {
      setCameraError(null);
      console.log('=== TESTING CAMERA ===');
      
      // Stop any existing stream first
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      console.log('Camera test - Got stream:', stream);
      console.log('Camera test - Video tracks:', stream.getVideoTracks().length);
      console.log('Camera test - Audio tracks:', stream.getAudioTracks().length);
      console.log('Camera test - Stream active:', stream.active);
      
      localStreamRef.current = stream;
      
      // Set initial track states
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
    }
  };

  const requestPermissions = async () => {
    try {
      // First check if permissions are already granted
      const permissions = await navigator.mediaDevices.enumerateDevices();
      const hasVideoPermission = permissions.some(device => device.kind === 'videoinput' && device.label);
      const hasAudioPermission = permissions.some(device => device.kind === 'audioinput' && device.label);
      
      if (!hasVideoPermission || !hasAudioPermission) {
        console.log('Requesting permissions explicitly...');
        // This will trigger the permission prompt
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(track => track.stop()); // Stop the test stream
      }
      return true;
    } catch (err) {
      console.error('Permission request failed:', err);
      return false;
    }
  };

  // Initialize video stream - reuse existing stream if available
  const initVideo = async () => {
    try {
      // If we already have a working stream, just make sure it's displayed
      if (localStreamRef.current && localStreamRef.current.active) {
        console.log('Reusing existing stream...');
        await setVideoSource(localStreamRef.current);
        return localStreamRef.current;
      }

      console.log('Checking permissions...');
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) {
        throw new Error('Camera and microphone permissions are required');
      }

      console.log('Requesting media devices...');
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Got media stream:', stream.getTracks().map(t => `${t.kind}: ${t.label}`));
      console.log('Stream active:', stream.active);
      console.log('Video tracks:', stream.getVideoTracks().length);
      console.log('Audio tracks:', stream.getAudioTracks().length);
      
      if (!stream) {
        throw new Error('Failed to get media stream');
      }

      localStreamRef.current = stream;
      
      // Set initial track states
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
      alert('Camera access error: ' + err.message);
      throw err;
    }
  };

  // Initialize peer connection
  const initPeerConnection = (userId) => {
    console.log('Initializing peer connection for:', userId);
    const pc = new RTCPeerConnection(createRTCConfiguration());
    peerConnectionsRef.current[userId] = pc;

    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`Adding track ${track.kind} to peer connection for ${userId}`);
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle incoming remote stream
    pc.ontrack = (event) => {
      console.log('Received remote track from:', userId);
      remoteStreamsRef.current[userId] = event.streams[0];
      setRemoteUsers(prev => {
        if (!prev.includes(userId)) {
          return [...prev, userId];
        }
        return prev;
      });
    };

    // Send ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current) {
        console.log('Sending ICE candidate to:', userId);
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          target: userId,
          candidate: event.candidate,
          from: myIdRef.current,
          room: roomId
        }));
      }
    };

    // Log connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Peer connection state for ${userId}:`, pc.connectionState);
    };

    return pc;
  };

  // Create and send offer to a peer
  const createOffer = async (peerId) => {
    console.log('Creating offer for:', peerId);
    const pc = initPeerConnection(peerId);
    
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'offer',
          target: peerId,
          from: myIdRef.current,
          sdp: offer,
          room: roomId
        }));
        console.log('Sent offer to:', peerId);
      }
    } catch (error) {
      console.error('Error creating offer for', peerId, ':', error);
    }
  };

  // Handle incoming WebSocket messages
  const handleSignalingMessage = async (message) => {
    console.log('Received signaling message:', message.type, 'from:', message.from);
    const { type, from, candidate, sdp, peers, peerId, clientId } = message;

    switch (type) {
      case 'client-id':
        // Server assigned us an ID
        myIdRef.current = clientId;
        setIsConnected(true);
        console.log('Received client ID:', clientId);
        break;

      case 'joined':
        // We successfully joined the room, now create offers for existing peers
        console.log('Joined room with existing peers:', peers);
        for (const existingPeerId of peers) {
          if (existingPeerId !== myIdRef.current) {
            await createOffer(existingPeerId);
          }
        }
        break;

      case 'peer-joined':
        // A new peer joined, we don't need to do anything here
        // They will create offers for us
        console.log('Peer joined:', peerId);
        break;

      case 'peer-left':
        // Clean up peer connection
        console.log('Peer left:', peerId);
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
          
          if (wsRef.current) {
            wsRef.current.send(JSON.stringify({
              type: 'answer',
              target: from,
              from: myIdRef.current,
              sdp: answer,
              room: roomId
            }));
            console.log('Sent answer to:', from);
          }
        } catch (error) {
          console.error('Error handling offer from', from, ':', error);
        }
        break;

      case 'answer':
        const answerPc = peerConnectionsRef.current[from];
        if (answerPc) {
          try {
            await answerPc.setRemoteDescription(new RTCSessionDescription(sdp));
            console.log('Set remote description for answer from:', from);
          } catch (error) {
            console.error('Error handling answer from', from, ':', error);
          }
        }
        break;

      case 'ice-candidate':
        const candidatePc = peerConnectionsRef.current[from];
        if (candidatePc && candidate) {
          try {
            await candidatePc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('Added ICE candidate from:', from);
          } catch (error) {
            console.error('Error adding ICE candidate from', from, ':', error);
          }
        }
        break;

      default:
        console.log('Unknown message type:', type);
    }
  };

  // Connect to WebSocket server
  useEffect(() => {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    let reconnectTimeout;

    const connectWebSocket = () => {
      console.log('Connecting to WebSocket server...');
      
      // Simplified WebSocket URL logic
      let wsUrl = 'ws://localhost:8888';
      
      // If accessing from network (not localhost), use the network IP
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        // Replace with your computer's actual IP address
        const devServerIP = '192.168.68.106'; // Update this to match your computer's IP
        wsUrl = `ws://${devServerIP}:8888`;
      }
      
      console.log('Connecting to:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to signaling server');
        reconnectAttempts = 0;
        // Don't set isConnected here - wait for client-id message
      };
      
      ws.onclose = (event) => {
        console.log('Disconnected from signaling server:', event.code, event.reason);
        setIsConnected(false);
        myIdRef.current = null;
        
        // Clean up on disconnect
        if (inCall) {
          setInCall(false);
          setCallStage('idle');
          setRemoteUsers([]);
        }
        
        if (reconnectAttempts < maxReconnectAttempts && !event.wasClean) {
          reconnectAttempts++;
          console.log(`Reconnecting... Attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
          reconnectTimeout = setTimeout(connectWebSocket, 2000);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleSignalingMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Send leave message before closing
        if (inCall && myIdRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'leave-room',
            room: roomId,
            from: myIdRef.current
          }));
        }
        wsRef.current.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []); // Remove dependencies to prevent reconnection loops

  // Join a room
  const joinRoom = async () => {
    try {
      if (!roomId.trim()) {
        alert('Please enter a room ID');
        return;
      }

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error('WebSocket not connected. Current state:', wsRef.current?.readyState);
        alert('Not connected to server. Please refresh the page.');
        return;
      }

      if (!isConnected || !myIdRef.current) {
        console.error('Client ID not received from server yet. Connected:', isConnected, 'ID:', myIdRef.current);
        alert('Connecting to server... Please wait a moment and try again.');
        return;
      }

      setCallStage('connecting');

      console.log('Initializing video before joining room...');
      
      try {
        await initVideo();
        console.log('Video initialized successfully');
      } catch (videoError) {
        console.error('Video initialization failed:', videoError);
        setCallStage('idle');
        return;
      }

      console.log('Joining room:', roomId, 'with client ID:', myIdRef.current);
      wsRef.current.send(JSON.stringify({
        type: 'join-room',
        room: roomId,
        from: myIdRef.current
      }));

      setCallStage('in-call');
      setInCall(true);
    } catch (err) {
      console.error('Error joining room:', err);
      alert('Failed to join room: ' + err.message);
      setCallStage('idle');
    }
  };

  // Leave the current room
  const leaveRoom = () => {
    console.log('Leaving room...');
    
    // Close all peer connections
    Object.keys(peerConnectionsRef.current).forEach(userId => {
      const pc = peerConnectionsRef.current[userId];
      pc?.close();
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

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'leave-room',
        room: roomId,
        from: myIdRef.current
      }));
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (inCall) {
        leaveRoom();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Video Chat</h1>

        {/* Before joining */}
        {callStage === 'idle' && (
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="mb-4">
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  isConnected ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {isConnected ? '● Connected' : '● Connecting...'}
                </div>
                {myIdRef.current && (
                  <div className="text-xs text-gray-500 mt-1">
                    Your ID: {myIdRef.current}
                  </div>
                )}
              </div>
              <input
                type="text"
                placeholder="Enter Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-4 py-2 border rounded-md mb-4 text-black bg-white"
                onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
              />
              <button
                onClick={joinRoom}
                className="w-full bg-blue-500 text-white px-6 py-2 rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed mb-2"
                disabled={!roomId.trim() || !isConnected}
              >
                {isConnected ? 'Join Room' : 'Connecting to server...'}
              </button>
            </div>

            {/* Camera Test Section */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-4">Camera Test</h3>
              <button
                onClick={testCamera}
                className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 mb-4"
              >
                Test Camera
              </button>
              
              {cameraError && (
                <div className="bg-red-100 text-red-700 p-3 rounded-md mb-4">
                  Error: {cameraError}
                </div>
              )}
              
              <div className="relative">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-w-md h-[200px] bg-black rounded-lg object-cover mx-auto"
                  style={{ transform: 'scaleX(-1)' }}
                />
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-sm">
                  Camera Test
                </div>
                {!isVideoOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 text-white text-sm">
                    Click "Test Camera" to check your camera
                  </div>
                )}
              </div>
              
              {/* Debug info for camera test */}
              <div className="bg-gray-100 p-3 rounded-md mt-4 text-sm">
                <div><strong>Camera Status:</strong></div>
                <div>Video On: {isVideoOn ? 'YES' : 'NO'}</div>
                <div>Audio On: {isAudioOn ? 'YES' : 'NO'}</div>
                <div>Stream Active: {localStreamRef.current?.active ? 'YES' : 'NO'}</div>
                <div>Video Playing: {localVideoRef.current && !localVideoRef.current.paused ? 'YES' : 'NO'}</div>
                <div>Video Dimensions: {localVideoRef.current?.videoWidth || 0}x{localVideoRef.current?.videoHeight || 0}</div>
                <div>Video Element: {localVideoRef.current ? 'Found' : 'Not Found'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Connecting screen */}
        {callStage === 'connecting' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-lg font-semibold">Connecting…</p>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-w-md h-[300px] bg-black rounded-lg object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          </div>
        )}

        {/* In-call screen */}
        {callStage === 'in-call' && inCall && (
          <div className="space-y-6">
            <div className="flex justify-center gap-4 mb-6">
              <button
                onClick={toggleCamera}
                className={`px-6 py-2 rounded-md ${
                  isVideoOn 
                    ? 'bg-gray-500 hover:bg-gray-600 text-white' 
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                {isVideoOn ? '📹 Camera On' : '📹 Camera Off'}
              </button>
              
              <button
                onClick={toggleAudio}
                className={`px-6 py-2 rounded-md ${
                  isAudioOn 
                    ? 'bg-gray-500 hover:bg-gray-600 text-white' 
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                {isAudioOn ? '🎤 Mic On' : '🎤 Mic Off'}
              </button>
              
              <button
                onClick={leaveRoom}
                className="bg-red-500 text-white px-6 py-2 rounded-md hover:bg-red-600"
              >
                Leave Room
              </button>
            </div>
            
            <div className="text-center text-gray-600 mb-4">
              Room: {roomId} | My ID: {myIdRef.current} | Connected users: {remoteUsers.length + 1}
            </div>
            
            {/* Debug info */}
            <div className="bg-gray-200 p-4 rounded-lg text-sm">
              <div><strong>Debug Info:</strong></div>
              <div>Local video: {isVideoOn ? 'ON' : 'OFF'}</div>
              <div>Local audio: {isAudioOn ? 'ON' : 'OFF'}</div>
              <div>Local stream active: {localStreamRef.current?.active ? 'YES' : 'NO'}</div>
              <div>Local video playing: {localVideoRef.current?.paused === false ? 'YES' : 'NO'}</div>
              <div>Local video dimensions: {localVideoRef.current?.videoWidth || 0}x{localVideoRef.current?.videoHeight || 0}</div>
              <div>Remote users: {JSON.stringify(remoteUsers)}</div>
              <div>Peer connections: {Object.keys(peerConnectionsRef.current).join(', ') || 'None'}</div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Local video */}
              <div className="relative">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-[300px] bg-black rounded-lg object-cover"
                  style={{ transform: 'scaleX(-1)' }} // Mirror the local video
                />
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-sm">
                  You (Local) - {myIdRef.current}
                </div>
                {/* Video status overlay */}
                {!isVideoOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 text-white text-lg">
                    📹 Camera Off
                  </div>
                )}
              </div>
              
              {/* Remote videos */}
              {remoteUsers.map(userId => (
                <div key={userId} className="relative">
                  <video
                    autoPlay
                    playsInline
                    className="w-full h-[300px] bg-black rounded-lg object-cover"
                    ref={(videoElement) => {
                      if (videoElement && remoteStreamsRef.current[userId]) {
                        videoElement.srcObject = remoteStreamsRef.current[userId];
                        console.log('Set remote video stream for user:', userId);
                      }
                    }}
                  />
                  <div className="absolute bottom-2 left-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-sm">
                    User {userId}
                  </div>
                </div>
              ))}
              
              {/* Placeholder for waiting */}
              {remoteUsers.length === 0 && (
                <div className="w-full h-[300px] bg-gray-800 rounded-lg flex items-center justify-center text-white">
                  <div className="text-center">
                    <div className="text-lg mb-2">Waiting for others...</div>
                    <div className="text-sm text-gray-400">Share room ID: <strong>{roomId}</strong></div>
                    <div className="text-xs text-gray-500 mt-2">Your ID: {myIdRef.current}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}