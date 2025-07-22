import React, { useRef, useEffect } from 'react';
import { StreamDisplayProps } from '../types';

const StreamDisplay: React.FC<StreamDisplayProps> = ({
  localStream,
  remoteStream
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }

    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [localStream, remoteStream]);

  return (
    <div className="flex flex-col items-center gap-4">
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="w-full max-w-md rounded-lg border-2 border-gray-700"
      />
      <video
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
        className="w-32 h-32 rounded-full border-2 border-white object-cover absolute bottom-6 right-6"
      />
    </div>
  );
};

export default StreamDisplay;
