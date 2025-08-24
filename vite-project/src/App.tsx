import "./App.css";
// Just a dummy base64 24K audio for pinging, it says "Hey, can you hear me?"
import { dummyBase64Audio24K } from "./samples/dummyBase64Audio";
import {
  combineBase64ArrayList,
  useOpenAiRealTime,
} from "./hooks/useOpenAiRealTimeHook";
import { useCallback, useEffect, useRef, useState } from "react";

function App() {
  const [messages, setMessages] = useState<object[]>([]);
  const isAudioPlayingRef = useRef(false);

  const onIsAudioPlayingUpdate = useCallback((playing: boolean) => {
    isAudioPlayingRef.current = playing;
  }, []);

  const { isAudioPlaying, playAudio, stopPlayingAudio } = useAudioPlayer({
    onIsAudioPlayingUpdate,
  });

  const enqueueMessage = useCallback((message: object) => {
    console.log("Got response chunk");
    setMessages((prevMessages) => [...prevMessages, message]);
  }, []);

  const onAudioResponseComplete = useCallback(
    (base64String: string) => {
      console.log("Playing full response");
      playAudio({
        sampleRate: 24000,
        base64Text: base64String,
      });
    },
    [playAudio]
  );

  const onUsageReport = useCallback((usage: object) => {
    console.log("Usage report:", usage);
  }, []);

  const onSocketClose = useCallback(() => {
    console.log("onSocketClose");
    //stopStreaming();
    stopPlayingAudio();
  }, [stopPlayingAudio]);

  const onReadyToReceiveAudio = useCallback(() => {
    //startStreaming();
  }, []);

  const {
    isWebSocketConnected,
    connectWebSocket,
    disconnectSocket,
    isWebSocketConnecting,
    sendBase64AudioStringChunk,
    isAiResponseInProgress,
    isInitialized,
    transcription,
  } = useOpenAiRealTime({
    instructions: "You are a helpful assistant.",
    onMessageReceived: enqueueMessage,
    onAudioResponseComplete,
    onUsageReport,
    onSocketClose,
    onReadyToReceiveAudio,
  });

  const ping = useCallback(() => {
    sendBase64AudioStringChunk(dummyBase64Audio24K);
  }, [sendBase64AudioStringChunk]);

  const [chunks, setChunks] = useState<string[]>([]);

  console.log("before onAudioStreamerChunk: ", isAiResponseInProgress);

  const onAudioStreamerChunk = useCallback(
    (chunk: string) => {
      setChunks((prev) => [...prev, chunk]);
      if (
        isWebSocketConnected &&
        isInitialized &&
        !isAiResponseInProgress &&
        !isAudioPlayingRef.current
      ) {
        console.log("Sending audio chunk:", chunk.slice(0, 50) + "..."); // base64 string
        sendBase64AudioStringChunk(chunk);
      }
    },
    [
      isAiResponseInProgress,
      isInitialized,
      isWebSocketConnected,
      sendBase64AudioStringChunk,
    ]
  );

  const { isStreaming, startStreaming, stopStreaming } = useAudioStreamer({
    sampleRate: 16000, // e.g., 16kHz - // TODO : The documentation doesn't specify the exact requirements for this. It tried 16K and 24K. I think 16k is better.
    interval: 250, // emit every 250 milliseconds
    onAudioChunk: onAudioStreamerChunk,
  });

  const playAudioRecorderChunks = useCallback(() => {
    const combined = combineBase64ArrayList(chunks);
    playAudio({ base64Text: combined, sampleRate: 16000 });
  }, [chunks, playAudio]);

  const _connectWebSocket = useCallback(async () => {
    const tokenResponse = await fetch("http://localhost:3000/session");
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;
    connectWebSocket({ ephemeralKey: EPHEMERAL_KEY });
  }, [connectWebSocket]);

  useEffect(() => {
    if (isWebSocketConnected) {
      if (isInitialized) {
        console.log("Starting audio streaming");
        startStreaming();
      }
    } else {
      console.log("Stopping audio streaming");
      stopStreaming();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWebSocketConnected, isInitialized]);

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
        padding: 16,
      }}
    >
      <div>
        <button
          onClick={() => {
            playAudio({
              base64Text: dummyBase64Audio24K,
              sampleRate: 24000,
            });
          }}
        >
          Play 24K string
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

        <button
          onClick={() => {
            console.log("Log Messages:", messages);
          }}
        >
          Log Messages
        </button>
      </div>
      <hr />

      <div>
        <h2 className=" text-[30px] font-bold">Transcription:</h2>
        <p>{transcription}</p>
      </div>

      <hr />

      <div className=" flex-row flex items-center">
        <p>Is audio Playing: {isAudioPlaying ? "Yes" : "No"}</p>

        {isAudioPlaying && (
          <button onClick={stopPlayingAudio}>Stop Playing</button>
        )}
      </div>

      <hr />

      <div className=" flex flex-row items-center gap-2">
        {!isStreaming && (
          <button onClick={startStreaming}>Start Streaming</button>
        )}
        {isStreaming && <button onClick={stopStreaming}>Stop Streaming</button>}
        {isStreaming && (
          <button onClick={playAudioRecorderChunks}>Play Stream</button>
        )}
        <br />
      </div>
      <p>Is Streaming: {isStreaming ? "Yes" : "No"}</p>
    </div>
  );
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
  const updateIsStreaming = useCallback((streaming: boolean) => {
    setIsStreaming(streaming);
  }, []);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const intervalIdRef = useRef<number | null>(null);

  const startStreaming = useCallback(async () => {
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

      updateIsStreaming(true);
    } catch (err) {
      console.error("Error starting audio stream:", err);
    }
  }, [interval, isStreaming, onAudioChunk, sampleRate, updateIsStreaming]);

  const stopStreaming = useCallback(() => {
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

    updateIsStreaming(false);
  }, [isStreaming, updateIsStreaming]);

  return { isStreaming, startStreaming, stopStreaming };
};

function base64ToFloat32Array(base64String: string): Float32Array {
  // Decode base64 → Uint8Array
  const binaryString = atob(base64String);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Convert Uint8Array → Int16Array
  const pcm16 = new Int16Array(bytes.buffer);

  // Convert Int16 → Float32 (-1 to 1)
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768;
  }

  return float32;
}

const useAudioPlayer = ({
  onIsAudioPlayingUpdate,
}: {
  onIsAudioPlayingUpdate: (isAudioPlaying: boolean) => void;
}): {
  isAudioPlaying: boolean;
  playAudio: ({
    sampleRate,
    base64Text,
  }: {
    sampleRate: number;
    base64Text: string;
  }) => void;
  stopPlayingAudio: () => void;
} => {
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const updateIsAudioPlaying = useCallback(
    (playing: boolean) => {
      setIsAudioPlaying(playing);
      onIsAudioPlayingUpdate(playing);
    },
    [onIsAudioPlayingUpdate]
  );

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stopPlayingAudio = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        //
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    updateIsAudioPlaying(false);
  }, [updateIsAudioPlaying]);

  const playAudio = useCallback(
    ({
      sampleRate,
      base64Text,
    }: {
      sampleRate: number;
      base64Text: string;
    }) => {
      stopPlayingAudio(); // stop any currently playing audio first

      const float32 = base64ToFloat32Array(base64Text);

      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      const buffer = audioContext.createBuffer(1, float32.length, sampleRate);
      buffer.copyToChannel(float32, 0);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);

      source.onended = () => {
        updateIsAudioPlaying(false);
        stopPlayingAudio();
      };

      source.start();
      sourceRef.current = source;

      updateIsAudioPlaying(true);
    },
    [stopPlayingAudio, updateIsAudioPlaying]
  );

  return { isAudioPlaying, playAudio, stopPlayingAudio };
};

export default App;
