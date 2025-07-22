// types/webrtc.d.ts

declare global {
  interface Window {
    signalingData?: Map<string, any>;
  }
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidate;
  target: string;
  sender: string;
}

export interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  status: RTCPeerConnectionState | 'disconnected';
}

export interface MediaState {
  isCameraOn: boolean;
  isMicOn: boolean;
  hasPermissions: boolean;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'failed' | 'closed';


export interface ControlProps {
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  toggleVideo: () => void;
  toggleAudio: () => void;
  endCall: () => void;
}

export interface StreamDisplayProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}
