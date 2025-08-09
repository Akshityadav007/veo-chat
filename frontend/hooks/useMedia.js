// hooks/useMedia.js

import { useRef, useState, useCallback } from 'react';

export const useMedia = (peerConnectionsRef) => {
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [cameraError, setCameraError] = useState(null);

  // Helper function to set video source with better error handling
  const setVideoSource = useCallback(async (stream) => {
    return new Promise((resolve, reject) => {
      if (!localVideoRef.current || !stream) {
        reject(new Error('Video element or stream not available'));
        return;
      }

      const video = localVideoRef.current;
      console.log('Setting video source, stream tracks:', stream.getTracks().length);
      
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
          video.muted = true;
          await video.play();
          console.log('Video started playing successfully');
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
      
      setTimeout(() => {
        cleanup();
        reject(new Error('Video load timeout'));
      }, 10000);
    });
  }, []);

  const requestPermissions = useCallback(async () => {
    try {
      const permissions = await navigator.mediaDevices.enumerateDevices();
      const hasVideoPermission = permissions.some(device => device.kind === 'videoinput' && device.label);
      const hasAudioPermission = permissions.some(device => device.kind === 'audioinput' && device.label);
      
      if (!hasVideoPermission || !hasAudioPermission) {
        console.log('Requesting permissions explicitly...');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(track => track.stop());
      }
      return true;
    } catch (err) {
      console.error('Permission request failed:', err);
      return false;
    }
  }, []);

  const initVideo = useCallback(async () => {
    try {
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

      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Got media stream:', stream.getTracks().map(t => `${t.kind}: ${t.label}`));
      
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
  }, [requestPermissions, setVideoSource]);

  const testCamera = useCallback(async () => {
    try {
      setCameraError(null);
      console.log('=== TESTING CAMERA ===');
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, 
        audio: true 
      });
      
      console.log('Camera test - Got stream:', stream);
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
        
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track === videoTrack);
          if (sender) {
            console.log('Toggled video track:', videoTrack.enabled);
          }
        });
      }
    }
  }, [peerConnectionsRef]);

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioOn(audioTrack.enabled);
        
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track === audioTrack);
          if (sender) {
            console.log('Toggled audio track:', audioTrack.enabled);
          }
        });
      }
    }
  }, [peerConnectionsRef]);

  const stopLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    }
    setIsVideoOn(false);
    setIsAudioOn(true);
    setCameraError(null);
  }, []);

  return {
    localVideoRef,
    localStreamRef,
    isVideoOn,
    isAudioOn,
    cameraError,
    initVideo,
    testCamera,
    toggleCamera,
    toggleAudio,
    stopLocalStream,
    setCameraError
  };
};