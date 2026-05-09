# TeleQuick TypeScript SDK

The official TypeScript / JavaScript SDK for TeleQuick. Runs in Node, Bun, and
modern browsers (the WASM core ships in the package).

## Installation

```bash
npm install telequick_connect
# or: pnpm add telequick_connect
# or: bun  add telequick_connect
```

## Quick start

Set `TELEQUICK_CREDENTIALS` to your service-account JSON, then:

```typescript
import { TeleQuickClient }      from "telequick_connect";
import { TeleQuickAudioStream } from "telequick_connect";

async function run() {
  const client = new TeleQuickClient("https://pbx.telequick.com");

  // Answer an inbound call and pipe its media into your bot.
  await client.answerIncomingCall("call_sid_123", "wss://my-bot.com/media");

  // Tap the raw audio if you want to do your own routing.
  const stream = new TeleQuickAudioStream();
  await stream.connect("wss://pbx.telequick.com/ai/session_789");
  stream.onAudio((pcm: Uint8Array) => {
    // Forward to OpenAI / Deepgram / your model of choice.
  });
}

run();
```

## Native core

In Node, the SDK loads `libtelequick_core_ffi.{so,dylib,dll}` via Node-API.
In the browser, it loads the WASM build (`telequick_core_cc.wasm`) shipped in
`dist/`. Build details: [`core-sdk`](https://github.com/telequick/core-sdk).
