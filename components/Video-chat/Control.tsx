import React from 'react';
import {Camera,CameraOff,Mic,MicOff,PhoneOff,} from 'lucide-react';
import { ControlProps } from '../types';

const Controls: React.FC<ControlProps> = ({
  isVideoEnabled,
  isAudioEnabled,
  toggleVideo,
  toggleAudio,
  endCall
}) => {
  return (
    <div className="flex gap-4 mt-4 justify-center">
      <button
        className="p-3 rounded-full bg-gray-800 hover:bg-gray-700"
        onClick={toggleVideo}
      >
        {isVideoEnabled ? <Camera size={24} /> : <CameraOff size={24} />}
      </button>

      <button
        className="p-3 rounded-full bg-gray-800 hover:bg-gray-700"
        onClick={toggleAudio}
      >
        {isAudioEnabled ? <Mic size={24} /> : <MicOff size={24} />}
      </button>

      <button
        className="p-3 rounded-full bg-red-600 hover:bg-red-500"
        onClick={endCall}
      >
        <PhoneOff size={24} />
      </button>
    </div>
  );
};

export default Controls;
