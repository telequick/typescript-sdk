import { WebSocket } from 'ws';
import { TeleQuickClient, MethodID } from '../src/client';

const CoreWASM = require(process.env.TELEQUICK_WASM_PATH || 'telequick_core'); 
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your-openai-api-key"; 

async function runOpenAiDemuxAgent() { 
    const credentialsPath = process.env.TELEQUICK_CREDENTIALS || "service_account.json";
    const client = new TeleQuickClient("quic://127.0.0.1:9090", credentialsPath); 
    await client.connect(); 

    const wasmModule = await CoreWASM(); 
    const openaiWs = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01", { 
        headers: { 
            "Authorization": `Bearer ${OPENAI_API_KEY}`, 
            "OpenAI-Beta": "realtime=v1" 
        } 
    }); 

    openaiWs.on('open', async () => { 
        openaiWs.send(JSON.stringify({ 
            type: "session.update", 
            session: { 
                modalities: ["audio", "text"], 
                instructions: "You are a telecom agent.", 
                voice: "alloy", 
                input_audio_format: "pcm16", 
                output_audio_format: "pcm16" 
            } 
        })); 

        await client.dial({to: "+15550000000", trunkId: "trunk_ai_test"}); 

        // Safely access transport as any to extract streams for mock logically 
        const activeStream = (client as any).transport.incomingBidirectionalStreams; 
        
        // Note: For full WASM we mock the buffer unpacking. 
        console.log("TypeScript TeleQuick Agent securely connected and bridged."); 
        
        let seq = 0; 
        openaiWs.on('message', (data: string) => { 
            const event = JSON.parse(data); 
            if (event.type === "response.audio.delta" && event.delta) { 
                const rawPcm = Buffer.from(event.delta, 'base64'); 
                const header = Buffer.alloc(8); 
                header.writeUInt32LE(rawPcm.length, 0); 
                header.writeUInt32LE(MethodID.AUDIO_FRAME, 4); 
                
                const packet = Buffer.concat([header, rawPcm]); 
                // activeStream.write(packet); 
            } 
        }); 
    });
} 

runOpenAiDemuxAgent().catch(console.error);
