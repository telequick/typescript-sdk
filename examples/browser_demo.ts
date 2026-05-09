import { TeleQuickClient, MethodID } from '../src/client';
const CoreWASM = require('../../core/telequick_core.js');

function logUi(msg: string) {
    const l = document.getElementById('logs');
    if (l) l.innerText += `\n${msg}`;
}

async function startBrowserExample() {
    const jwtEl = document.getElementById('jwtBox') as HTMLTextAreaElement;
    if (!jwtEl.value) { logUi("Error: Mock JWT Pre-Signed Required!"); return; }

    logUi("Initializing TeleQuick Browser WebTransport...");
    const client = new TeleQuickClient("quic://127.0.0.1:9090", jwtEl.value, true);
    await client.connect();
    
    const wasmModule = await CoreWASM();

    logUi("Activating Native WebRTC Microphone...");
    const userMedia = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Convert to AudioContext immediately
    const actx = new AudioContext({ sampleRate: 8000 });
    const source = actx.createMediaStreamSource(userMedia);
    const processor = actx.createScriptProcessor(4096, 1, 1);
    
    source.connect(processor);
    processor.connect(actx.destination);

    let seq = 0;
    await client.dial({to: "+15550000000", trunkId: "trunk_browser"});
    logUi("Dial complete.");

    processor.onaudioprocess = (e) => {
        const floats = e.inputBuffer.getChannelData(0);
        const pcmArr = new Uint8Array(floats.buffer); 
        const c_buf = wasmModule.telequick_serialize_audio_frame(
            "simulated_browser_id", pcmArr, "PCMU", seq++, false
        );

        // Map buffer to stream 
    };
}

(document.getElementById('startCallBtn') as HTMLButtonElement).onclick = startBrowserExample;
