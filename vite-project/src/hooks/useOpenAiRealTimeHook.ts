import { useCallback, useEffect, useRef, useState } from "react";
import { Buffer } from "buffer";

const useOpenAiRealTime = ({
  instructions,
  onMessageReceived,
  onAudioResponseComplete,
  onUsageReport,
  onReadyToReceiveAudio,
  onSocketClose,
  onSocketError,
}: {
  instructions: string;
  onMessageReceived: (message: object) => void;
  onAudioResponseComplete: (base64Audio: string) => void;
  onUsageReport: (usage: object) => void;
  onReadyToReceiveAudio: () => void;
  onSocketClose: () => void;
  onSocketError?: (error: any) => void;
}) => {
  const webSocketRef = useRef<null | WebSocket>(null);
  const [isWebSocketConnecting, setIsWebSocketConnecting] = useState(false);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAiResponseInProgress, setIsAiResponseInProgress] = useState(false);
  const [transcription, setTranscription] = useState<string>("");
  const responseQueueRef = useRef<string[]>([]);

  const resetHookState = useCallback(() => {
    webSocketRef.current = null;
    setIsWebSocketConnecting(false);
    setIsWebSocketConnected(false);
    setIsInitialized(false);
    responseQueueRef.current = [];
    setIsAiResponseInProgress(false);
    setTranscription("");
  }, []);

  const connectWebSocket = useCallback(
    async ({ ephemeralKey }: { ephemeralKey: string }) => {
      setIsWebSocketConnecting(true);
      if (webSocketRef.current) {
        return;
      }

      try {
        const url = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17&token=${ephemeralKey}`;

        const ws = new WebSocket(url, [
          "realtime",
          "openai-insecure-api-key." + ephemeralKey,
          "openai-beta.realtime-v1",
        ]);

        ws.addEventListener("open", () => {
          console.log("Connected to server.");
          setIsWebSocketConnected(true);
        });

        ws.addEventListener("close", () => {
          console.log("Disconnected from server.");
          setIsWebSocketConnected(false);
          resetHookState();
          onSocketClose();
        });

        ws.addEventListener("error", (error) => {
          console.error("WebSocket error:", error);
          onSocketError?.(error);
        });

        ws.addEventListener("message", (event) => {
          //console.log("WebSocket message:", event.data);
          // convert message to an object

          const messageObject = JSON.parse(event.data);
          onMessageReceived(messageObject);
          if (messageObject.type === "response.created") {
            setIsAiResponseInProgress(true);
            setTranscription("");
          }
          if (messageObject.type === "response.audio.done") {
            setIsAiResponseInProgress(false);
            const combinedBase64 = combineBase64ArrayList(
              responseQueueRef.current
            );
            responseQueueRef.current = [];
            onAudioResponseComplete(combinedBase64);
          }
          if (messageObject.type === "response.audio.delta") {
            const audioChunk = messageObject.delta;
            if (audioChunk) {
              responseQueueRef.current.push(audioChunk);
            }
          }
          if (messageObject?.response?.usage) {
            onUsageReport(messageObject.response.usage);
          }
          if (messageObject.type === "session.updated") {
            setIsInitialized(true);
            onReadyToReceiveAudio();
          }
          if (messageObject.type === "response.audio_transcript.delta") {
            setTranscription((prev) => prev + messageObject.delta);
          }
        });

        webSocketRef.current = ws;
      } catch (error) {
        console.error("Error connecting to WebSocket:", error);
      } finally {
        setIsWebSocketConnecting(false);
      }
    },
    [
      onAudioResponseComplete,
      onMessageReceived,
      onReadyToReceiveAudio,
      onSocketClose,
      onSocketError,
      onUsageReport,
      resetHookState,
    ]
  );

  const disconnectSocket = useCallback(() => {
    if (webSocketRef.current) {
      webSocketRef.current.close();
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isWebSocketConnected) {
      const event = {
        type: "session.update",
        session: {
          instructions,
        },
      };
      webSocketRef.current?.send(JSON.stringify(event));
    }
  }, [instructions, isWebSocketConnected]);

  const sendMessage = useCallback(
    (messageObject: { [key: string]: any }) => {
      if (
        webSocketRef.current &&
        webSocketRef.current.readyState === WebSocket.OPEN &&
        isWebSocketConnected &&
        isInitialized
      ) {
        webSocketRef.current.send(JSON.stringify(messageObject));
      }
    },
    [isInitialized, isWebSocketConnected]
  );

  const sendBase64AudioStringChunk = useCallback(
    (base64String: string) => {
      if (webSocketRef.current) {
        sendMessage({
          type: "input_audio_buffer.append",
          audio: base64String,
        });
      }
    },
    [sendMessage]
  );

  return {
    isWebSocketConnected,
    connectWebSocket,
    disconnectSocket,
    isWebSocketConnecting,
    sendBase64AudioStringChunk,
    isInitialized,
    isAiResponseInProgress,
    transcription,
  };
};

const combineBase64ArrayList = (base64Array: string[]): string => {
  const pcmChunks: Uint8Array[] = base64Array.map((base64Text) => {
    if (base64Text) {
      const buf = Buffer.from(base64Text, "base64"); // decode base64 to raw bytes
      const toReturn = new Uint8Array(
        buf.buffer,
        buf.byteOffset,
        buf.byteLength
      );
      return toReturn;
    } else {
      return new Uint8Array();
    }
  });

  // Calculate total length
  const totalLength = pcmChunks.reduce((acc, chunk) => acc + chunk.length, 0);

  // Create one big Uint8Array
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of pcmChunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  // Convert back to base64
  const combinedBase64 = Buffer.from(combined.buffer).toString("base64");

  return combinedBase64;
};

export { useOpenAiRealTime, combineBase64ArrayList };
