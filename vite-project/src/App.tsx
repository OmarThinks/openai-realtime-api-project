import { useEffect, useRef } from "react";
import "./App.css";
import { dummyBase64Text } from "./samples/dummyBase64Audio";

const apiKey = import.meta.env.VITE_OPENAI_KEY;

function App() {
  const playPingAudio = () => {
    playPCMBase64({ base64String: dummyBase64Text, sampleRate: 16000 });
  };
  const pingTemplate = () => {};

  const webSocketRef = useRef<null | WebSocket>(null);

  const connectWebSocket = () => {
    const url =
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";
    const ws = new WebSocket(url, {
      headers: {
        Authorization: "Bearer " + apiKey,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    ws.on("open", function open() {
      console.log("Connected to server.");
    });

    ws.on("message", function incoming(message) {
      console.log(JSON.parse(message.toString()));
    });
  };

  useEffect(() => {
    if (webSocketRef) {
      webSocketRef?.current?.close();
    }
  });

  return (
    <div
      className=""
      style={{ width: "100vw", backgroundColor: "black", minHeight: "100vh" }}
    >
      <button onClick={pingTemplate}>Ping Template</button>
      <button onClick={playPingAudio}>playPingAudio</button>
    </div>
  );
}

function playPCMBase64({
  base64String,
  sampleRate,
}: {
  base64String: string;
  sampleRate: number;
}) {
  // Convert base64 to ArrayBuffer
  const binaryString = atob(base64String);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Convert to Int16Array
  const pcm16 = new Int16Array(bytes.buffer);

  // Convert to Float32Array (range -1.0 to 1.0)
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768; // normalize
  }

  // Use Web Audio API to play
  const context = new AudioContext({ sampleRate });
  const buffer = context.createBuffer(1, float32.length, sampleRate);
  buffer.copyToChannel(float32, 0);

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
}

export default App;
