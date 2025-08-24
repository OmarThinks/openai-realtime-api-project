import "./App.css";
import { dummyBase64Audio16k } from "./samples/dummyBase64Audio";
import {
  combineBase64ArrayList,
  useOpenAiRealTime,
} from "./hooks/useOpenAiRealTimeHook";
import { useCallback, useRef, useState } from "react";

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

  const [chunks, setChunks] = useState<string[]>([]);

  const { isStreaming, startStreaming, stopStreaming } = useAudioStreamer({
    sampleRate: 16000, // e.g., 16kHz
    interval: 250, // emit every 250 milliseconds
    onAudioChunk: (chunk) => {
      console.log("Got audio chunk:", chunk.slice(0, 50) + "..."); // base64 string
      setChunks((prev) => [...prev, chunk]);
    },
  });

  const playAudioChunks = () => {
    const combined = combineBase64ArrayList(chunks);
    playPCMBase64({ base64String: combined, sampleRate: 16000 });
  };

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

      <hr />

      <div className=" flex flex-row items-center gap-2">
        <button onClick={startStreaming}>Start Streaming</button>
        <button onClick={stopStreaming}>Stop Streaming</button>
        <button onClick={playAudioChunks}>Play Stream</button>
        <p>Is Streaming: {isStreaming ? "Yes" : "No"}</p>
      </div>
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

function floatTo16BitPCM(float32Array: Float32Array): Int16Array {
  const buffer = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return buffer;
}

function encodePCMToBase64(int16Array: Int16Array): string {
  const buffer = new Uint8Array(int16Array.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < buffer.length; i += chunkSize) {
    const chunk = buffer.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

const useAudioStreamer = ({
  sampleRate,
  interval,
  onAudioChunk,
}: {
  sampleRate: number;
  interval: number;
  onAudioChunk: (audioChunk: string) => void;
}) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const intervalIdRef = useRef<number | null>(null);

  const startStreaming = async () => {
    if (isStreaming) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // ScriptProcessorNode (deprecated but still widely supported).
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        bufferRef.current.push(new Float32Array(inputData));
      };

      // Send chunks every interval
      intervalIdRef.current = window.setInterval(() => {
        if (bufferRef.current.length === 0) return;

        // Flatten buffered audio
        const length = bufferRef.current.reduce(
          (acc, cur) => acc + cur.length,
          0
        );
        const merged = new Float32Array(length);
        let offset = 0;
        for (const chunk of bufferRef.current) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        bufferRef.current = [];

        // Convert -> PCM16 -> Base64
        const pcm16 = floatTo16BitPCM(merged);
        const base64 = encodePCMToBase64(pcm16);
        onAudioChunk(base64);
      }, interval);

      setIsStreaming(true);
    } catch (err) {
      console.error("Error starting audio stream:", err);
    }
  };

  const stopStreaming = () => {
    if (!isStreaming) return;

    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    bufferRef.current = [];

    setIsStreaming(false);
  };

  return { isStreaming, startStreaming, stopStreaming };
};

export default App;
