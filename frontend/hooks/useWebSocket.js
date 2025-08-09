// hooks/useWebSocket.js
import { useRef, useState, useEffect, useCallback } from 'react';

export const useWebSocket = (onMessage) => {
  const wsRef = useRef(null);
  const myIdRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');

  const connectWebSocket = useCallback(() => {
    console.log('Connecting to WebSocket server...');
    setConnectionStatus('Connecting...');
    
    // Dynamic WebSocket URL detection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = host === 'localhost' || host === '127.0.0.1' ? '8888' : '8888';
    const wsUrl = `${protocol}//${host}:${port}`;
    
    console.log('Connecting to:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    ws.onopen = () => {
      console.log('Connected to signaling server');
      reconnectAttempts = 0;
      setConnectionStatus('Connected');
    };
    
    ws.onclose = (event) => {
      console.log('Disconnected from signaling server:', event.code, event.reason);
      setIsConnected(false);
      setConnectionStatus('Disconnected');
      myIdRef.current = null;
      
      if (reconnectAttempts < maxReconnectAttempts && !event.wasClean) {
        reconnectAttempts++;
        setConnectionStatus(`Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
        console.log(`Reconnecting... Attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
        setTimeout(connectWebSocket, 2000 * reconnectAttempts);
      } else if (reconnectAttempts >= maxReconnectAttempts) {
        setConnectionStatus('Connection failed');
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('Connection error');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Handle client-id message here since it affects connection state
        if (message.type === 'client-id') {
          myIdRef.current = message.clientId;
          setIsConnected(true);
          setConnectionStatus('Connected');
          console.log('Received client ID:', message.clientId);
        }
        
        onMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
  }, [onMessage]);

  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const disconnect = useCallback((roomId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (roomId && myIdRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'leave-room',
          room: roomId,
          from: myIdRef.current
        }));
      }
      wsRef.current.close();
    }
  }, []);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  return {
    wsRef,
    myIdRef,
    isConnected,
    connectionStatus,
    sendMessage,
    disconnect
  };
};