import { useCallback, useEffect, useRef, useState } from "react";

const useOpenAiRealTime = ({ instructions }: { instructions: string }) => {
  const webSocketRef = useRef<null | WebSocket>(null);
  const [isWebSocketConnecting, setIsWebSocketConnecting] = useState(false);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);

  const connectWebSocket = useCallback(
    async ({ ephemeralKey }: { ephemeralKey: string }) => {
      setIsWebSocketConnecting(true);

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
        });

        ws.addEventListener("error", (error) => {
          console.error("WebSocket error:", error);
        });

        ws.addEventListener("message", (event) => {
          console.log("WebSocket message:", event.data);
        });

        webSocketRef.current = ws;
      } catch (error) {
        console.error("Error connecting to WebSocket:", error);
      } finally {
        setIsWebSocketConnecting(false);
      }
    },
    []
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

  return {
    isWebSocketConnected,
    connectWebSocket,
    disconnectSocket,
    isWebSocketConnecting,
  };
};

export { useOpenAiRealTime };
