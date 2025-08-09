// components/VideoComponents.jsx
import React from 'react';

export const LocalVideo = ({ videoRef, isVideoOn, myId }) => (
  <div className="relative bg-black rounded-xl overflow-hidden shadow-lg">
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="w-full h-64 object-cover"
      style={{ transform: 'scaleX(-1)' }}
    />
    <div className="absolute bottom-3 left-3 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-sm">
      You ({myId})
    </div>
    {!isVideoOn && (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 text-white">
        <div className="text-center">
          <div className="text-3xl mb-2">📹</div>
          <div>Camera Off</div>
        </div>
      </div>
    )}
  </div>
);

export const RemoteVideo = ({ userId, remoteStreamsRef }) => (
  <div className="relative bg-black rounded-xl overflow-hidden shadow-lg">
    <video
      autoPlay
      playsInline
      className="w-full h-64 object-cover"
      ref={(videoElement) => {
        if (videoElement && remoteStreamsRef.current[userId]) {
          videoElement.srcObject = remoteStreamsRef.current[userId];
          console.log('Set remote video stream for user:', userId);
        }
      }}
    />
    <div className="absolute bottom-3 left-3 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-sm">
      User {userId}
    </div>
  </div>
);

export const WaitingPlaceholder = ({ roomId, myId }) => (
  <div className="bg-gray-800 rounded-xl flex items-center justify-center text-white h-64 shadow-lg">
    <div className="text-center">
      <div className="text-2xl mb-3">👥</div>
      <div className="text-lg mb-2">Waiting for others...</div>
      <div className="text-sm text-gray-400">Share room ID: <strong>{roomId}</strong></div>
      <div className="text-xs text-gray-500 mt-2">Your ID: {myId}</div>
    </div>
  </div>
);

export const ControlButtons = ({ 
  isVideoOn, 
  isAudioOn, 
  toggleCamera, 
  toggleAudio, 
  leaveRoom 
}) => (
  <div className="flex justify-center gap-4 mb-6">
    <button
      onClick={toggleCamera}
      className={`px-6 py-3 rounded-lg font-medium transition-colors ${
        isVideoOn 
          ? 'bg-gray-600 hover:bg-gray-700 text-white' 
          : 'bg-red-600 hover:bg-red-700 text-white'
      }`}
    >
      📹 {isVideoOn ? 'Camera On' : 'Camera Off'}
    </button>
    
    <button
      onClick={toggleAudio}
      className={`px-6 py-3 rounded-lg font-medium transition-colors ${
        isAudioOn 
          ? 'bg-gray-600 hover:bg-gray-700 text-white' 
          : 'bg-red-600 hover:bg-red-700 text-white'
      }`}
    >
      🎤 {isAudioOn ? 'Mic On' : 'Mic Off'}
    </button>
    
    <button
      onClick={leaveRoom}
      className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium"
    >
      Leave Room
    </button>
  </div>
);

export const ConnectionStatus = ({ isConnected, connectionStatus, myId }) => (
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
);

export const RoomInfo = ({ roomId, userCount }) => (
  <div className="text-center text-gray-600 mb-4 bg-white rounded-lg p-4 shadow">
    <div className="font-medium text-lg">Room: {roomId}</div>
    <div className="text-sm">Connected users: {userCount}</div>
  </div>
);

export const CameraTest = ({ 
  testCamera, 
  cameraError, 
  localVideoRef, 
  isVideoOn, 
  isAudioOn, 
  localStreamRef 
}) => (
  <div className="bg-white rounded-xl shadow-lg p-6">
    <h3 className="text-xl font-semibold mb-4 text-gray-800">Camera & Audio Test</h3>
    <button
      onClick={testCamera}
      className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium mb-4"
    >
      Test Camera & Microphone
    </button>
    
    {cameraError && (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-4">
        <strong>Error:</strong> {cameraError}
      </div>
    )}
    
    <div className="relative">
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="w-full max-w-md h-64 bg-black rounded-lg object-cover mx-auto"
        style={{ transform: 'scaleX(-1)' }}
      />
      <div className="absolute bottom-3 left-3 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-sm">
        Camera Test
      </div>
      {!isVideoOn && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 text-white rounded-lg">
          <div className="text-center">
            <div className="text-2xl mb-2">📹</div>
            <div>Click "Test Camera" above</div>
          </div>
        </div>
      )}
    </div>
    
    {/* Status indicators */}
    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
      <div className={`p-3 rounded-lg ${isVideoOn ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
        <div className="font-medium">Camera</div>
        <div>{isVideoOn ? '✓ Working' : '○ Not active'}</div>
      </div>
      <div className={`p-3 rounded-lg ${isAudioOn && localStreamRef.current ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
        <div className="font-medium">Microphone</div>
        <div>{isAudioOn && localStreamRef.current ? '✓ Working' : '○ Not active'}</div>
      </div>
    </div>
  </div>
);