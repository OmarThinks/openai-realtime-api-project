import "./App.css";
import { dummyBase64Audio16k } from "./samples/dummyBase64Audio";
import { useOpenAiRealTime } from "./hooks/useOpenAiRealTimeHook";
import { useCallback, useState } from "react";

function App() {
  const [messages, setMessages] = useState<object[]>([]);

  const enqueueMessage = useCallback((message: object) => {
    setMessages((prevMessages) => [...prevMessages, message]);
  }, []);

  const onAudioResponseComplete = useCallback((base64String: string) => {
    playPCMBase64({
      base64String,
      sampleRate: 24000,
    });
  }, []);

  const onUsageReport = useCallback((usage: object) => {
    console.log("Usage report:", usage);
  }, []);

  const {
    isWebSocketConnected,
    connectWebSocket,
    disconnectSocket,
    isWebSocketConnecting,
    sendBase64AudioStringChunk,
  } = useOpenAiRealTime({
    instructions: "You are a helpful assistant.",
    onMessageReceived: enqueueMessage,
    onAudioResponseComplete,
    onUsageReport,
  });

  const _connectWebSocket = useCallback(async () => {
    const tokenResponse = await fetch("http://localhost:3000/session");
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;
    connectWebSocket({ ephemeralKey: EPHEMERAL_KEY });
  }, [connectWebSocket]);

  const ping = useCallback(() => {
    sendBase64AudioStringChunk(dummyBase64Audio16k);
  }, [sendBase64AudioStringChunk]);

  return (
    <div
      className=""
      style={{
        width: "100vw",
        backgroundColor: "black",
        minHeight: "100vh",
        gap: 16,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div>
        <button
          onClick={() =>
            playPCMBase64({
              base64String: dummyBase64Audio16k,
              sampleRate: 16000,
            })
          }
        >
          Play 16K string
        </button>
      </div>
      <div>
        {isWebSocketConnected && <button onClick={ping}>Ping</button>}
        {isWebSocketConnecting ? (
          <span>Connecting...</span>
        ) : isWebSocketConnected ? (
          <button onClick={disconnectSocket}>disconnectSocket</button>
        ) : (
          <button onClick={_connectWebSocket}>connectWebSocket</button>
        )}
      </div>
      <button
        onClick={() => {
          console.log("Log Messages:", messages);
        }}
      >
        Log Messages
      </button>
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
