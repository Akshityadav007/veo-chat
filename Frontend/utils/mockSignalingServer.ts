// utils/MockSignalingServer.ts
// utils/MockSignalingServer.ts
import type { SignalingMessage } from '../components/types';

export class MockSignalingServer {
  private peerId: string;
  private isConnected: boolean;
  public onmessage: ((event: { data: string }) => void) | null;
  private peers: Map<string, any>;

  constructor(peerId: string) {
    this.peerId = peerId;
    this.onmessage = null;
    this.peers = new Map();
    this.isConnected = true;
  }

  send(data: string): void {
    setTimeout(() => this.simulateSignaling(data), 100);
  }

  private simulateSignaling(data: string): void {
    const message: SignalingMessage = JSON.parse(data);
    if (!window.signalingData) {
      (window as any).signalingData = new Map();
    }

    if (message.type === 'offer' || message.type === 'answer') {
      (window as any).signalingData.set(message.target + '_' + message.type, message);
      setTimeout(() => {
        if (this.onmessage && message.target !== this.peerId) {
          this.onmessage({
            data: JSON.stringify({
              type: message.type,
              sdp: message.sdp,
              sender: message.sender
            })
          });
        }
      }, 500);
    } else if (message.type === 'ice-candidate') {
      const candidates = (window as any).signalingData.get(message.target + '_candidates') || [];
      candidates.push(message);
      (window as any).signalingData.set(message.target + '_candidates', candidates);
    }
  }

  close(): void {
    this.isConnected = false;
  }
}
