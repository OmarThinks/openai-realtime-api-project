import { useCallback, useEffect, useRef, useState } from "react";

const useOpenAiRealTime = () => {
  const webSocketRef = useRef<null | WebSocket>(null);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);

  const connectWebSocket = useCallback(async () => {
    const tokenResponse = await fetch("http://localhost:3000/session");
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;

    const url = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17&token=${EPHEMERAL_KEY}`;

    const ws = new WebSocket(url, [
      "realtime",
      "openai-insecure-api-key." + EPHEMERAL_KEY,
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
  }, []);

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

  return {
    isWebSocketConnected,
    connectWebSocket,
    disconnectSocket,
  };
};

export { useOpenAiRealTime };
