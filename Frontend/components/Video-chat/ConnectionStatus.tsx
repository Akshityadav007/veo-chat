// components/VideoChat/ConnectionStatus.tsx
import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { ConnectionState } from '../types';

interface Props {
  connectionState: ConnectionState;
  isCallActive: boolean;
}

const ConnectionStatus: React.FC<Props> = ({ connectionState, isCallActive }) => {
  const getStatusColor = () => {
    switch (connectionState.status) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'disconnected': return 'text-gray-400';
      default: return 'text-red-400';
    }
  };

  const getStatusText = () => {
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

export default ConnectionStatus;
