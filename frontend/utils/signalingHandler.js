// utils/signalingHandler.js

export const createSignalingHandler = (webrtcHook) => {
  const {
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handlePeerLeft
  } = webrtcHook;

  return async (message) => {
    console.log('Received signaling message:', message.type, 'from:', message.from);
    const { type, from, candidate, sdp, peers, peerId } = message;

    switch (type) {
      case 'client-id':
        // This is handled in the WebSocket hook
        break;

      case 'joined':
        console.log('Joined room with existing peers:', peers);
        for (const existingPeerId of peers) {
          await createOffer(existingPeerId);
        }
        break;

      case 'peer-joined':
        console.log('Peer joined:', peerId);
        break;

      case 'peer-left':
        handlePeerLeft(peerId);
        break;

      case 'offer':
        await handleOffer(from, sdp);
        break;

      case 'answer':
        await handleAnswer(from, sdp);
        break;

      case 'ice-candidate':
        await handleIceCandidate(from, candidate);
        break;

      default:
        console.log('Unknown message type:', type);
    }
  };
};