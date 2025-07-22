import React from 'react';
import VideoChat from '../components/Video-chat/VideoChat';

const App: React.FC = () => {
  return (
    <div className="bg-black text-white h-screen w-screen overflow-auto">
      <VideoChat />
    </div>
  );
};

export default App;
