# 3) Run instructions

1) Client (Vite + React + Tailwind):

- Create project:
  npm create vite@latest my-call -- --template react
  cd my-call
  npm install

- Install Tailwind (optional) and configure per Tailwind docs, or remove Tailwind classes in the example.
- Replace src/App.jsx with the client code above and run:
  npm run dev

2) Server:
- Create a folder for server, paste server.js, and run:
  npm init -y
  npm install ws
  node server.js

3) Testing:
- Open two browser tabs (or two devices) and point both to the client app.
- Use the same room id in both tabs and join. They should connect and exchange video.

----------

# 4) Mobile / Hybrid notes

- Browser -> Capacitor: wrap the web app with Capacitor to run as Android/iOS. Capacitor provides native contact access and background behaviors.
- React Native: reimplement UI in RN and use react-native-webrtc for WebRTC support. Signaling logic can remain the same (WebSocket).
- Contacts: on mobile use native APIs (Android ContactsContract / iOS Contacts) or Capacitor community plugin.
- TURN servers: absolutely required for NAT traversal in production. Consider coturn.

----------

If you'd like, I can also:
- provide a production-ready version with TURN support and HTTPS/WSS config,
- port client logic to React Native (expo) or Capacitor wrapper,
- add UI improvements (participant grid, mute, camera toggle, screenshare).

