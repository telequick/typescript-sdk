import { TeleQuickClient } from './dist/client.js';
// @ts-ignore
import * as fs from 'fs';
async function main() {
    console.log("Initiating telequick dialing sequence via QUIC (TypeScript Node/WASM)...");
    const dummySA = {
        tenant_id: "test_tenant",
        private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDKr7fNMuPW0Csi\nIjXmOL9uAZ9utFIbneiQh6mIET8qb0bJ2Oe6VobLosqOUfC2POyNXUKczssdKBJn\n6ouJSmddb2ykonhaSMh57B0m18iT85yhgxEjDCFQ1MXCJk0ovgsu3fXx8s4lg+3i\neLBg7HjTufLIK8IzkxdySnUli/1B8d8sZn3FZ20uJ/GyqzscmB5drgxlRID9KAT7\npIxiJ8Fv9F8u5v1FuseLLsEcBqt3dthEqJoV9DieQCX5cO4g603s34Z97kPaRG00\n/HlcBJOu/gxk0Y2fsVGEjb4ewCN3sFHECxBHc1kHqlfrvsC41LrHdsC+QU0332xA\n0ZtPTxjxAgMBAAECggEADbvyx5/4qgWIvrM0asln81N/KFhmA0K5JRNZl1jv1Pdz\nA69ueFpvn4cu6Y4/h4xromKc5mo+1NbHydct+wYZ004pvaLYET9tp5FVIlzXKxYE\nBDpmOV/o4VohnQ0iXQM6V8PTlsBTXAhrYKq5QkAT1JOnkg0hB4SilJcwsUl3Rkth\n8BqA6kFYQW8S0XItZ99GWHDBlAb8DPMcQCMK0wg9B1e2M5t2vHf9eL7OARbK/eSb\nMWwsWFgRIpkg2ZVm9U6GlFp6F7pazzfcddHldBb6wp2tCp3GUGX/wKv3+ytTPnPB\nYpKNbc+Z/msf3dnKDjGPQyKMm1rL317bXNJ4nD4hSQKBgQD7MdXw3H0rg/2ZzXv8\n1PCYtcW/LiPXEu2OQ/Sz9G5LAAAKpKDFtor7UEAtBw69zkZtPmW3UG4wRwmfSHDW\nn9kWJII5pfF0yp5U3xZ3nvetSX50NFyi+C8pEp5sET/EhSrKzkys6MEtN6DHSZHl\nq5FwSeqA/j9gCE3jqoRGqp7PHQKBgQDOkFMsuIPie7sqn0TPznXxYDVHPf5ZijLc\nrjdHgAr9sPxDhBPLb9ygXdmZjgxSMiSMJogw0wv8XpOcDAUQ9XYHxRNI5IdcYM5D\nvibEUQsVSWPAaPEmSiQUSaL1Xi4EjPyAHCFn+GZgdld3xRmnsvZJdfV9FQrM9hJe\n0j7CbdLk5QKBgB07uIU2c867pqjelB5hfbqX9PKB4SPnjQPwfqruuGM8FcUnUZqQ\n2u3SchWLa7jFJ8cQ6u+BicFOkx0ZZiBkK/R6vTkOSeJorjJ8X/X95x8gnXnSmjFR\nJtPl2dAD1eL+CHPfvGanE8w6XBi1RChxZhSmVYc7j46SiNYFAy3iL2c1AoGAcHPF\ntAznT38Ij9WRAohlUPiNSLGJLHm94sG9OmGMmjuluaPHmvLU60DsW1onfv/pQZsg\nfWQHnGZoeYVZpLfcf7JcI0y2HCZfZCW6uRldrUL82RzIW431Qk4sNuQErVmLhLrL\nvOxP36fNSli09MTKq4daE7RG4vn7Wj+fBv3+17kCgYBWGEVSdW9yGOsEvZsN+nTp\nBQhdyvQjy6/lYMHeFrx1ga4V1E/XXmhyRRzk1lCg8AGRUfPyMqgo/tXOQSHoK6yp\ntdIph/XuCmA8ZFGayFdGVrIL2nw9qs7cRGAUAPRnRNlgRzTzFc8WnB6vtItTfaDm\nNhNocK9YfkydFdqQbB7Daw==\n-----END PRIVATE KEY-----",
        private_key_id: "test"
    };
    fs.writeFileSync('dummy_sa.json', JSON.stringify(dummySA));
    // Initialize TeleQuickClient
    const client = new TeleQuickClient("quic://187.127.139.138:9090", "dummy_sa.json", false, // Not a browser token
    "none" // No SPKI cert check
    );
    try {
        console.log("Connecting to QUIC Server at 187.127.139.138:9090...");
        await client.connect();
        console.log("Successfully connected over QUIC!");
        const f_out = fs.openSync("captured_output.alaw", "w");
        const active_calls = new Set();
        client.onAudioFrame = (payload) => {
            try {
                if (client.wasmModule) {
                    const info = client.wasmModule.deserialize_audio_frame(payload);
                    if (info.payload) {
                        const pcm = Buffer.from(info.payload, 'base64');
                        fs.writeSync(f_out, pcm);
                    }
                }
            }
            catch (err) {
                console.error("Error parsing audio frame:", err);
            }
        };
        client.onCallEvent = (payload) => {
            try {
                if (client.wasmModule) {
                    const info = client.wasmModule.deserialize_call_event(payload);
                    console.log(`--> [EVENT] call_sid: ${info.call_sid.substring(0, 8)} | status: ${info.status}`);
                    if (!["COMPLETED", "FAILED", "BUSY", "NO_ANSWER"].includes(info.status)) {
                        active_calls.add(info.call_sid);
                    }
                    else {
                        active_calls.delete(info.call_sid);
                    }
                }
            }
            catch (err) {
                console.error("Error parsing call event:", err);
            }
        };
        console.log("Executing dialing RPC using trunk: default ...");
        await client.dial({
            to: "sip:+1600258824@2x99i6f70f2.sip.livekit.cloud",
            trunkId: "default",
            callFrom: "+18005551234",
            clientId: "node-client"
        });
        console.log("Dial RPC dispatched successfully. PBX is routing!");
        await new Promise(r => setTimeout(r, 20000));
        for (const sid of Array.from(active_calls)) {
            console.log(`Terminating orphaned call automatically natively: ${sid}`);
            await client.terminate(sid);
        }
        await new Promise(r => setTimeout(r, 1000));
        process.exit(0);
    }
    catch (e) {
        console.error("Dial Error:", e);
        process.exit(1);
    }
}
main();
