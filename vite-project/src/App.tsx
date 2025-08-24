import "./App.css";
import { dummyBase64Text } from "./samples/dummyBase64Audio";
import { useOpenAiRealTime } from "./hooks/useOpenAiRealTimeHook";

function App() {
  const playPingAudio = () => {
    playPCMBase64({ base64String: dummyBase64Text, sampleRate: 16000 });
  };
  const pingTemplate = () => {};

  const { isWebSocketConnected, connectWebSocket, disconnectSocket } =
    useOpenAiRealTime();

  /*
  const connectWebSocket = useCallback(async () => {
    const tokenResponse = await fetch("http://localhost:3000/session");
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;

    const url = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17&token=${EPHEMERAL_KEY}`;

    const ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`,
      [
        "realtime",
        "openai-insecure-api-key." + EPHEMERAL_KEY,
        // Beta protocol, required
        "openai-beta.realtime-v1",
      ]
    );

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
  }, []);*/

  /*
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
*/
  return (
    <div
      className=""
      style={{ width: "100vw", backgroundColor: "black", minHeight: "100vh" }}
    >
      <button onClick={pingTemplate}>Ping Template</button>
      <button onClick={playPingAudio}>playPingAudio</button>
      {!isWebSocketConnected && (
        <button onClick={connectWebSocket}>connectWebSocket</button>
      )}
      {isWebSocketConnected && (
        <button onClick={disconnectSocket}>disconnectSocket</button>
      )}
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
