// components/VideoChat/VideoChat.tsx
import { Camera, CameraOff, Mic, MicOff, Phone, PhoneOff, Copy, Smartphone, Monitor, Users, Wifi, WifiOff, Video, VideoOff } from 'lucide-react';
import { MockSignalingServer } from '../../utils/MockSignalingServer';
import type { SignalingMessage, ConnectionState, MediaState } from '../types';
import ConnectionStatus from './ConnectionStatus';
import { useCallback, useEffect, useRef, useState } from 'react';

// Generate unique peer ID only once
const generatePeerId = (): string => {
  return 'peer_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
};

const VideoChat: React.FC = () => {
  // Use a stable peer ID
  const [peerId] = useState(() => generatePeerId());

  const [remotePeerId, setRemotePeerId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isCallActive, setIsCallActive] = useState<boolean>(false);

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    isConnecting: false,
    status: 'disconnected'
  });

  const [mediaState, setMediaState] = useState<MediaState>({
    isCameraOn: false,
    isMicOn: true,
    hasPermissions: false
  });

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<MockSignalingServer | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const configuration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ],
    iceCandidatePoolSize: 10,
  };

  const createPeerConnection = useCallback((): RTCPeerConnection => {
    const peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate && socketRef.current) {
        const message: SignalingMessage = {
          type: 'ice-candidate',
          candidate: event.candidate,
          target: remotePeerId,
          sender: peerId
        };
        socketRef.current.send(JSON.stringify(message));
      }
    };

    peerConnection.ontrack = (event: RTCTrackEvent) => {
      const [stream] = event.streams;
      setRemoteStream(stream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }

      setConnectionState(prev => ({
        ...prev,
        status: 'connected',
        isConnected: true,
        isConnecting: false
      }));
      setIsCallActive(true);
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;

      setConnectionState(prev => ({
        ...prev,
        status: state,
        isConnected: state === 'connected',
        isConnecting: state === 'connecting'
      }));

      if (state === 'connected') {
        setError('');
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        setIsCallActive(false);
        if (state === 'failed') {
          setError('Connection failed. Please try again.');
        }
      }
    };

    const dataChannel = peerConnection.createDataChannel('messages');
    dataChannelRef.current = dataChannel;

    peerConnection.ondatachannel = (event: RTCDataChannelEvent) => {
      const channel = event.channel;
      channel.onmessage = (event: MessageEvent) => {
        console.log('Received message:', event.data);
      };
    };

    return peerConnection;
  }, [peerId, remotePeerId]);

  useEffect(() => {
    socketRef.current = new MockSignalingServer(peerId);

    socketRef.current.onmessage = async (event: { data: string }) => {
      try {
        const data: SignalingMessage = JSON.parse(event.data);

        if (!peerConnectionRef.current) {
          peerConnectionRef.current = createPeerConnection();
        }

        switch (data.type) {
          case 'offer':
            await handleOffer(data);
            break;
          case 'answer':
            await handleAnswer(data);
            break;
          case 'ice-candidate':
            await handleIceCandidate(data);
            break;
        }
      } catch (error) {
        console.error('Error handling signaling message:', error);
      }
    };

    return () => {
      cleanup();
    };
  }, [createPeerConnection, peerId]);

  // Handle incoming offer
  const handleOffer = async (data: SignalingMessage): Promise<void> => {
    try {
      if (!localStream) {
        await startCamera();
      }
      
      if (!peerConnectionRef.current || !data.sdp) return;
      
      await peerConnectionRef.current.setRemoteDescription(data.sdp);
      
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      
      const message: SignalingMessage = {
        type: 'answer',
        sdp: answer,
        target: data.sender,
        sender: peerId
      };
      
      socketRef.current?.send(JSON.stringify(message));
      
      setConnectionState(prev => ({ ...prev, isConnecting: true }));
    } catch (error) {
      console.error('Error handling offer:', error);
      setError('Failed to handle incoming call');
    }
  };

  // Handle answer
  const handleAnswer = async (data: SignalingMessage): Promise<void> => {
    try {
      if (!peerConnectionRef.current || !data.sdp) return;
      await peerConnectionRef.current.setRemoteDescription(data.sdp);
    } catch (error) {
      console.error('Error handling answer:', error);
      setError('Failed to establish connection');
    }
  };

  // Handle ICE candidate
  const handleIceCandidate = async (data: SignalingMessage): Promise<void> => {
    try {
      if (!peerConnectionRef.current || !data.candidate) return;
      await peerConnectionRef.current.addIceCandidate(data.candidate);
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  };

  // Start camera
  const startCamera = async (): Promise<void> => {
    try {
      setError('');
      const constraints: MediaStreamConstraints = {
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      setLocalStream(stream);
      setMediaState(prev => ({
        ...prev,
        isCameraOn: true,
        isMicOn: true,
        hasPermissions: true
      }));
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Add tracks to peer connection if it exists
      if (peerConnectionRef.current) {
        stream.getTracks().forEach((track: MediaStreamTrack) => {
          peerConnectionRef.current?.addTrack(track, stream);
        });
      }
      
    } catch (error) {
      console.error('Error accessing camera:', error);
      setError('Camera access denied. Please allow camera and microphone permissions.');
      setMediaState(prev => ({ ...prev, hasPermissions: false }));
    }
  };

  // Stop camera
  const stopCamera = (): void => {
    if (localStream) {
      localStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setLocalStream(null);
    }
    setMediaState(prev => ({ ...prev, isCameraOn: false }));
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  };

  // Toggle camera
  const toggleCamera = (): void => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setMediaState(prev => ({ ...prev, isCameraOn: videoTrack.enabled }));
      }
    }
  };

  // Toggle microphone
  const toggleMicrophone = (): void => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMediaState(prev => ({ ...prev, isMicOn: audioTrack.enabled }));
      }
    }
  };

  // Start call
  const startCall = async (): Promise<void> => {
    if (!remotePeerId.trim()) {
      setError('Please enter a peer ID to call');
      return;
    }

    if (!localStream) {
      await startCamera();
    }

    try {
      setConnectionState(prev => ({ ...prev, isConnecting: true }));
      setError('');

      peerConnectionRef.current = createPeerConnection();
      
      // Add local stream tracks
      if (localStream) {
        localStream.getTracks().forEach((track: MediaStreamTrack) => {
          peerConnectionRef.current?.addTrack(track, localStream);
        });
      }

      // Create and send offer
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);

      const message: SignalingMessage = {
        type: 'offer',
        sdp: offer,
        target: remotePeerId,
        sender: peerId
      };

      socketRef.current?.send(JSON.stringify(message));

    } catch (error) {
      console.error('Error starting call:', error);
      setError('Failed to start call. Please try again.');
      setConnectionState(prev => ({ ...prev, isConnecting: false }));
    }
  };

  // End call
  const endCall = (): void => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    setRemoteStream(null);
    setConnectionState({
      isConnected: false,
      isConnecting: false,
      status: 'disconnected'
    });
    setIsCallActive(false);
  };

  // Copy peer ID to clipboard
  const copyPeerId = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(peerId);
      // Could add toast notification here
    } catch (error) {
      console.error('Failed to copy:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = peerId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  // Cleanup
  const cleanup = (): void => {
    if (localStream) {
      localStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    if (socketRef.current) {
      socketRef.current.close();
    }
  };

  // Connection status component
  const ConnectionStatus: React.FC = () => {
    const getStatusColor = (): string => {
      switch (connectionState.status) {
        case 'connected': return 'text-green-400';
        case 'connecting': return 'text-yellow-400';
        case 'disconnected': return 'text-gray-400';
        default: return 'text-red-400';
      }
    };

    const getStatusText = (): string => {
      if (connectionState.isConnecting) return 'Connecting...';
      if (connectionState.isConnected) return 'Connected';
      if (isCallActive) return 'In Call';
      return 'Ready';
    };

    return (
      <div className={`flex items-center gap-2 ${getStatusColor()}`}>
        {connectionState.isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
        <span className="text-sm font-medium">{getStatusText()}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 text-white">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-lg border-b border-white/10 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-2 rounded-lg">
              <Video className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-semibold">Veo Chat</h1>
            <div className="hidden sm:flex items-center gap-2 text-xs bg-white/10 px-2 py-1 rounded-full">
              <Monitor className="w-3 h-3" />
              <Smartphone className="w-3 h-3" />
              <span>Web • Mobile</span>
            </div>
          </div>
          <ConnectionStatus />
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Error Display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-red-200">
            {error}
          </div>
        )}

        {/* Video Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Local Video */}
          <div className="relative aspect-video bg-gray-800/50 rounded-xl overflow-hidden border border-white/10">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full text-sm">
              You {!mediaState.isCameraOn && '(Camera Off)'}
            </div>
            {!mediaState.isCameraOn && (
              <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                <CameraOff className="w-12 h-12 text-gray-400" />
              </div>
            )}
          </div>

          {/* Remote Video */}
          <div className="relative aspect-video bg-gray-800/50 rounded-xl overflow-hidden border border-white/10">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full text-sm">
              {connectionState.isConnected ? 'Remote User' : 'Waiting for connection...'}
            </div>
            {!connectionState.isConnected && (
              <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                <div className="text-center">
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-400">No one connected</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={mediaState.isCameraOn ? stopCamera : startCamera}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all ${
              mediaState.isCameraOn 
                ? 'bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30' 
                : 'bg-gray-500/20 border border-gray-500/30 text-gray-300 hover:bg-gray-500/30'
            }`}
          >
            {mediaState.isCameraOn ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
            {mediaState.isCameraOn ? 'Stop Camera' : 'Start Camera'}
          </button>

          <button
            onClick={toggleCamera}
            disabled={!localStream}
            className={`p-3 rounded-full transition-all ${
              mediaState.isCameraOn
                ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30'
                : 'bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {mediaState.isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          <button
            onClick={toggleMicrophone}
            disabled={!localStream}
            className={`p-3 rounded-full transition-all ${
              mediaState.isMicOn
                ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30'
                : 'bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {mediaState.isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          <button
            onClick={isCallActive ? endCall : startCall}
            disabled={connectionState.isConnecting}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all ${
              isCallActive
                ? 'bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30'
                : 'bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isCallActive ? <PhoneOff className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
            {connectionState.isConnecting ? 'Connecting...' : (isCallActive ? 'End Call' : 'Start Call')}
          </button>
        </div>

        {/* Connection Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-black/20 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <h3 className="text-lg font-semibold mb-4">Your Peer ID</h3>
            <div className="flex items-center gap-2 bg-black/30 p-3 rounded-lg">
              <code className="flex-1 text-sm text-blue-300 break-all">{peerId}</code>
              <button
                onClick={copyPeerId}
                className="p-2 hover:bg-white/10 rounded transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mt-2">Share this ID with someone to receive calls</p>
          </div>

          <div className="bg-black/20 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <h3 className="text-lg font-semibold mb-4">Connect to Peer</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={remotePeerId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemotePeerId(e.target.value)}
                placeholder="Enter peer ID to call"
                className="w-full bg-black/30 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <p className="text-sm text-gray-400">Enter the other person's peer ID to start a call</p>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-black/20 backdrop-blur-lg rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold mb-4">How to Use</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="space-y-2">
              <div className="text-blue-300 font-medium">1. Start Your Camera</div>
              <div className="text-gray-300">Click "Start Camera" to enable your video and audio</div>
            </div>
            <div className="space-y-2">
              <div className="text-blue-300 font-medium">2. Share Your ID</div>
              <div className="text-gray-300">Copy and share your Peer ID with someone</div>
            </div>
            <div className="space-y-2">
              <div className="text-blue-300 font-medium">3. Connect & Call</div>
              <div className="text-gray-300">Enter their Peer ID and click "Start Call"</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoChat;