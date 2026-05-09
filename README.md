# TeleQuick TypeScript SDK The native standard for interacting with TeleQuick in Node.js architectures. Powered natively by `bufbuild` and `connect-es` for highly efficient browser and server-side RPCs. ## Installation ```bash
npm install
# or
yarn install
``` ## Quick Start Set `TELEQUICK_CREDENTIALS` context variable. ```typescript
import { TeleQuickClient } from "./src/TeleQuickClient";
import { TeleQuickAudioStream } from "./src/TeleQuickAudioStream"; async function run() { // Instantiates standard JWT gRPC Interceptors implicitly. const client = new TeleQuickClient("https://pbx.telequick.com"); const answer = await client.answerIncomingCall("call_sid_123", "wss://my-bot.com/media"); const stream = new TeleQuickAudioStream(); await stream.connect("wss://pbx.telequick.com/ai/session_789"); stream.onAudio((pcmBuffer: Uint8Array) => { // Forward realtime WebSockets audio to OpenAI! });
}
```
