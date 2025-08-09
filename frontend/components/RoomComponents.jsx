// components/RoomComponents.jsx

import React from 'react';
import { generateRoomId, copyToClipboard } from '../utils/webrtcConfig';

export const RoomControls = ({ 
  roomId, 
  setRoomId, 
  joinRoom, 
  isConnected 
}) => {
  const handleGenerateRoomId = () => {
    const newRoomId = generateRoomId();
    setRoomId(newRoomId);
  };

  const handleCopyRoomId = async () => {
    if (roomId) {
      const success = await copyToClipboard(roomId);
      if (success) {
        // You could add a toast notification here
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

export const ConnectingScreen = ({ roomId, localVideoRef }) => (
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