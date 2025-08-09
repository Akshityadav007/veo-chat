// hooks/useWebRTC.js


import { useRef, useState, useCallback } from 'react';
import { createRTCConfiguration } from '../utils/webrtcConfig';

export const useWebRTC = (wsRef, myIdRef, roomId) => {
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [networkStats, setNetworkStats] = useState({});
  
  const peerConnectionsRef = useRef({});
  const remoteStreamsRef = useRef({});
  const localStreamRef = useRef(null);

  // Monitor connection quality
  const monitorConnectionQuality = useCallback((userId, pc) => {
    const interval = setInterval(async () => {
      if (pc.connectionState === 'connected') {
        const stats = await pc.getStats();
        let inboundRTP = null;
        let outboundRTP = null;
        
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            inboundRTP = report;
          }
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            outboundRTP = report;
          }
        });
        
        setNetworkStats(prev => ({
          ...prev,
          [userId]: {
            inbound: inboundRTP,
            outbound: outboundRTP,
            connectionState: pc.connectionState
          }
        }));
      }
    }, 2000);

    return interval;
  }, []);

  const initPeerConnection = useCallback((userId) => {
    console.log('Initializing peer connection for:', userId);
    const pc = new RTCPeerConnection(createRTCConfiguration());
    peerConnectionsRef.current[userId] = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`Adding track ${track.kind} to peer connection for ${userId}`);
        pc.addTrack(track, localStreamRef.current);
      });
    }

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

    pc.onconnectionstatechange = () => {
      console.log(`Peer connection state for ${userId}:`, pc.connectionState);
      if (pc.connectionState === 'failed') {
        pc.restartIce();
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${userId}:`, pc.iceConnectionState);
    };

    const statsInterval = monitorConnectionQuality(userId, pc);
    pc.statsInterval = statsInterval;

    return pc;
  }, [wsRef, myIdRef, roomId, localStreamRef, monitorConnectionQuality]);

  const createOffer = useCallback(async (peerId) => {
    console.log('Creating offer for:', peerId);
    const pc = initPeerConnection(peerId);
    
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
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
  }, [initPeerConnection, wsRef, myIdRef, roomId]);

  const handleOffer = useCallback(async (from, sdp) => {
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
  }, [initPeerConnection, wsRef, myIdRef, roomId]);

  const handleAnswer = useCallback(async (from, sdp) => {
    const answerPc = peerConnectionsRef.current[from];
    if (answerPc) {
      try {
        await answerPc.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log('Set remote description for answer from:', from);
      } catch (error) {
        console.error('Error handling answer from', from, ':', error);
      }
    }
  }, []);

  const handleIceCandidate = useCallback(async (from, candidate) => {
    const candidatePc = peerConnectionsRef.current[from];
    if (candidatePc && candidate) {
      try {
        await candidatePc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Added ICE candidate from:', from);
      } catch (error) {
        console.error('Error adding ICE candidate from', from, ':', error);
      }
    }
  }, []);

  const handlePeerLeft = useCallback((peerId) => {
    console.log('Peer left:', peerId);
    if (peerConnectionsRef.current[peerId]) {
      if (peerConnectionsRef.current[peerId].statsInterval) {
        clearInterval(peerConnectionsRef.current[peerId].statsInterval);
      }
      peerConnectionsRef.current[peerId].close();
      delete peerConnectionsRef.current[peerId];
      delete remoteStreamsRef.current[peerId];
      setRemoteUsers(prev => prev.filter(id => id !== peerId));
      setNetworkStats(prev => {
        const newStats = { ...prev };
        delete newStats[peerId];
        return newStats;
      });
    }
  }, []);

  const cleanup = useCallback(() => {
    Object.keys(peerConnectionsRef.current).forEach(userId => {
      const pc = peerConnectionsRef.current[userId];
      if (pc) {
        if (pc.statsInterval) {
          clearInterval(pc.statsInterval);
        }
        pc.close();
      }
      delete peerConnectionsRef.current[userId];
      delete remoteStreamsRef.current[userId];
    });
    
    setRemoteUsers([]);
    setNetworkStats({});
  }, []);

  return {
    remoteUsers,
    networkStats,
    remoteStreamsRef,
    peerConnectionsRef,
    localStreamRef,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handlePeerLeft,
    cleanup
  };
};