// Supervisor client — Node-side QUIC/WebTransport client that subscribes
// to a specific call's audio fan-out on the gateway. Mirrors the
// browser-side implementation in
// telequick-frontend/src/lib/webtransport-supervise.ts; same wire, just
// imports `@fails-components/webtransport` instead of relying on a
// browser-native WebTransport global.
//
// Wire format (matches telequick/bridge/quic_server_engine.cc):
//   Bidi req:  [u32 LE total_len = 8 + envelope_size]
//              [u32 LE method_id]
//              [envelope]
//   Bidi resp: [envelope]                          ← no header
//   Uni stream: [u32 LE total_len = 4 + payload_len]
//               [u32 LE dg_id]
//               [payload (envelope)]
//
// Serde envelope: [u8 ver=0][u8 compat=0][u32 LE size][fields…]
//   sstring → [u32 LE len][bytes]
//   bool/u8 → 1 byte
//   u64 LE  → 8 bytes
//
// Bumping any field order or MethodID requires updating the gateway's
// telequick_types.hh in lockstep.

import { MethodID } from './methods';

export type SupervisionMode =
    | 'monitor'
    | 'whisper-agent'
    | 'whisper-caller'
    | 'barge'
    | 'agentic-monitor';

const MODE_TO_INT8: Record<SupervisionMode, number> = {
    'monitor':         0,
    'whisper-agent':   1,
    'whisper-caller':  2,
    'barge':           3,
    'agentic-monitor': 4,
};

export interface SupervisorClientOptions {
    /** WebTransport URL of the gateway, e.g. https://engine.telequick.dev:443/ */
    gatewayUrl: string;
    callSid: string;
    supervisorId: string;
    tenantId: string;
    /**
     * Service-account secret with `telephony:supervise` scope, OR a
     * short-lived token minted by the BFF's
     * `trpc.telephony.mintSuperviseToken` proc. The gateway resolves
     * `sa:<authToken>` and rejects the subscribe if scope is missing
     * or tenant doesn't match.
     */
    authToken: string;
    mode?: SupervisionMode;
    /** Called for every incoming AudioFrame. payload is raw codec bytes. */
    onAudio?: (frame: AudioFrameMsg) => void;
    /** Called once when subscribe succeeds or fails. */
    onStatus?: (s: { status: string; error?: string }) => void;
}

export interface AudioFrameMsg {
    callSid: string;
    payload: Uint8Array;
    codec: string;
    sequenceNumber: number;
    endOfStream: boolean;
}

interface WebTransportStreamWriter {
    write(chunk: Uint8Array): Promise<void>;
    close(): Promise<void>;
}
interface WebTransportWritableSide {
    writable: { getWriter(): WebTransportStreamWriter };
}
interface WebTransportReader {
    read(): Promise<{ done: boolean; value?: WebTransportReadableSide | Uint8Array }>;
}
interface WebTransportReadableSide {
    getReader(): WebTransportReader;
}
interface WebTransportBidi {
    writable: { getWriter(): WebTransportStreamWriter };
    readable: WebTransportReadableSide;
}
interface WebTransportSession {
    ready: Promise<void>;
    closed: Promise<unknown>;
    createBidirectionalStream(): Promise<WebTransportBidi>;
    createUnidirectionalStream(): Promise<{ getWriter(): WebTransportStreamWriter }>;
    incomingUnidirectionalStreams: WebTransportReadableSide;
    close(): void | Promise<void>;
}
type WebTransportConstructor = new (url: string, options?: unknown) => WebTransportSession;

interface NodeRequire { (id: string): unknown; }
type GlobalWithWT = typeof globalThis & {
    WebTransport?: WebTransportConstructor;
    require?: NodeRequire;
};

function loadWebTransport(): WebTransportConstructor {
    const g = globalThis as GlobalWithWT;
    if (typeof g.WebTransport === 'function') return g.WebTransport;
    // Node fallback — same package the rest of the SDK uses.
    const req: NodeRequire | undefined =
        g.require || ((): NodeRequire | undefined => {
            try { return eval('req' + 'uire') as NodeRequire; } catch { return undefined; }
        })();
    if (!req) throw new Error('WebTransport unavailable: no global and no require');
    const mod = req('@fails-components/webtransport') as { WebTransport: WebTransportConstructor };
    return mod.WebTransport;
}

export class SupervisorClient {
    private wt: WebTransportSession | null = null;
    private bidiWriter: WebTransportStreamWriter | null = null;
    private bidiReader: WebTransportReader | null = null;
    private uniReadLoop: Promise<void> | null = null;
    private uplinkWriter: WebTransportStreamWriter | null = null;
    private uplinkSeq = 0;
    private closed = false;

    constructor(private opts: SupervisorClientOptions) {}

    async open(): Promise<void> {
        const Ctor = loadWebTransport();
        this.wt = new Ctor(this.opts.gatewayUrl);
        await this.wt.ready;

        const stream = await this.wt.createBidirectionalStream();
        this.bidiWriter = stream.writable.getWriter();
        this.bidiReader = stream.readable.getReader();

        const subscribeFrame = encodeSubscribeFrame({
            callSid:      this.opts.callSid,
            supervisorId: this.opts.supervisorId,
            tenantId:     this.opts.tenantId,
            mode:         MODE_TO_INT8[this.opts.mode ?? 'monitor'],
            authToken:    this.opts.authToken,
        });
        await this.bidiWriter.write(subscribeFrame);

        void this.readSubscribeResponse();
        this.uniReadLoop = this.readUniStreams();
    }

    /**
     * Push a supervisor-side AudioFrame for whisper / barge modes. Caller
     * supplies the raw codec bytes (PCMU recommended; PCMA also accepted).
     * The gateway routes this based on the supervisor mode set at subscribe
     * time: WhisperToCaller / Barge → caller leg; Monitor / AgenticMonitor
     * drop. Lazily opens a uni stream and reuses it for all subsequent
     * frames.
     */
    async sendAudio(payload: Uint8Array, codec: 'PCMU' | 'PCMA' = 'PCMU'): Promise<void> {
        if (!this.wt || this.closed) return;
        if (!this.uplinkWriter) {
            const stream = await this.wt.createUnidirectionalStream();
            this.uplinkWriter = stream.getWriter();
        }
        const frame = encodeAudioFrame({
            callSid:        this.opts.callSid,
            payload,
            codec,
            sequenceNumber: this.uplinkSeq++,
            endOfStream:    false,
        });
        await this.uplinkWriter.write(frame);
    }

    async close(): Promise<void> {
        this.closed = true;
        try { await this.uplinkWriter?.close(); } catch { /* */ }
        try { await this.bidiWriter?.close(); } catch { /* */ }
        try { await this.wt?.close(); } catch { /* */ }
        this.uplinkWriter = null;
        this.bidiWriter = null;
        this.bidiReader = null;
        this.wt = null;
    }

    private async readSubscribeResponse(): Promise<void> {
        if (!this.bidiReader) return;
        const acc: number[] = [];
        try {
            while (!this.closed) {
                const { value, done } = await this.bidiReader.read();
                if (done) break;
                if (value && value instanceof Uint8Array) for (const b of value) acc.push(b);
                const parsed = tryParseSubscribeResponse(new Uint8Array(acc));
                if (parsed) {
                    this.opts.onStatus?.({ status: parsed.status, error: parsed.errorMessage || undefined });
                    return;
                }
            }
        } catch (e) {
            this.opts.onStatus?.({ status: 'ERROR', error: String(e) });
        }
    }

    private async readUniStreams(): Promise<void> {
        if (!this.wt) return;
        try {
            const reader = this.wt.incomingUnidirectionalStreams.getReader();
            while (!this.closed) {
                const { value: stream, done } = await reader.read();
                if (done) break;
                // The stream value here is a ReadableStream-like object.
                if (stream && !(stream instanceof Uint8Array)) {
                    void this.consumeUniStream(stream);
                }
            }
        } catch {
            // Session closed.
        }
    }

    private async consumeUniStream(stream: WebTransportReadableSide): Promise<void> {
        const r = stream.getReader();
        const acc: number[] = [];
        try {
            while (!this.closed) {
                const { value, done } = await r.read();
                if (done) break;
                if (value && value instanceof Uint8Array) for (const b of value) acc.push(b);
                while (acc.length >= 8) {
                    const total = readU32LE(acc, 0);
                    if (acc.length < 4 + total) break;
                    const dgId = readU32LE(acc, 4);
                    const payload = new Uint8Array(acc.slice(8, 4 + total));
                    acc.splice(0, 4 + total);
                    if (dgId === MethodID.AUDIO_FRAME) {
                        const f = parseAudioFrame(payload);
                        this.opts.onAudio?.(f);
                    }
                }
            }
        } catch {
            // Stream ended.
        }
    }
}

// ---- wire codecs ----

function writeU8(out: number[], n: number) { out.push(n & 0xff); }
function writeU32LE(out: number[], n: number) {
    out.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
}
function writeSstring(out: number[], s: string) {
    const bytes = new TextEncoder().encode(s);
    writeU32LE(out, bytes.length);
    for (const b of bytes) out.push(b);
}
function readU32LE(buf: number[] | Uint8Array, off: number): number {
    return ((buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0);
}

function encodeSubscribeFrame(req: {
    callSid: string; supervisorId: string; tenantId: string;
    mode: number; authToken: string;
}): Uint8Array {
    // Must match telequick_types.hh::SuperviseSubscribeRequest::serde_fields().
    const fields: number[] = [];
    writeSstring(fields, req.callSid);
    writeSstring(fields, req.supervisorId);
    writeSstring(fields, req.tenantId);
    writeU8(fields, req.mode);
    writeSstring(fields, req.authToken);

    const env: number[] = [];
    writeU8(env, 0);
    writeU8(env, 0);
    writeU32LE(env, fields.length);
    for (const b of fields) env.push(b);

    const frame: number[] = [];
    writeU32LE(frame, 8 + env.length);
    writeU32LE(frame, MethodID.SUPERVISE_SUBSCRIBE);
    for (const b of env) frame.push(b);
    return new Uint8Array(frame);
}

function encodeAudioFrame(req: {
    callSid: string; payload: Uint8Array; codec: string;
    sequenceNumber: number; endOfStream: boolean;
}): Uint8Array {
    const fields: number[] = [];
    writeSstring(fields, req.callSid);
    writeU32LE(fields, req.payload.length);
    for (const b of req.payload) fields.push(b);
    writeSstring(fields, req.codec);
    const seqLo = req.sequenceNumber >>> 0;
    const seqHi = Math.floor(req.sequenceNumber / 0x1_0000_0000) >>> 0;
    writeU32LE(fields, seqLo);
    writeU32LE(fields, seqHi);
    writeU8(fields, req.endOfStream ? 1 : 0);

    const env: number[] = [];
    writeU8(env, 0);
    writeU8(env, 0);
    writeU32LE(env, fields.length);
    for (const b of fields) env.push(b);

    const frame: number[] = [];
    writeU32LE(frame, 4 + env.length);
    writeU32LE(frame, MethodID.AUDIO_FRAME);
    for (const b of env) frame.push(b);
    return new Uint8Array(frame);
}

function tryParseSubscribeResponse(buf: Uint8Array): {
    status: string; errorMessage: string;
} | null {
    if (buf.length < 6) return null;
    const size = readU32LE(buf, 2);
    if (buf.length < 6 + size) return null;
    let off = 6;
    const s = readSstring(buf, off); off = s.next;
    const e = readSstring(buf, off); off = e.next;
    return { status: s.value, errorMessage: e.value };
}

function parseAudioFrame(buf: Uint8Array): AudioFrameMsg {
    let off = 6;
    const callSidR   = readSstring(buf, off); off = callSidR.next;
    const payloadLen = readU32LE(buf, off);
    const payload    = buf.slice(off + 4, off + 4 + payloadLen);
    off += 4 + payloadLen;
    const codecR     = readSstring(buf, off); off = codecR.next;
    const seq = Number(readU32LE(buf, off)) + Number(readU32LE(buf, off + 4)) * 0x1_0000_0000; off += 8;
    const eos = buf[off] !== 0;
    return {
        callSid: callSidR.value,
        payload,
        codec: codecR.value,
        sequenceNumber: seq,
        endOfStream: eos,
    };
}

// Read an sstring at `off`. Returns the decoded value and the offset of the
// byte immediately after the field. Using a separate `next` instead of
// `value.length` avoids the UTF-8 byte/codepoint mismatch when the bytes
// don't form valid UTF-8 (which happens for binary fields decoded as
// strings — JS string length != original byte count after Replacement-
// character substitution).
function readSstring(buf: Uint8Array, off: number): { value: string; next: number } {
    const len = readU32LE(buf, off);
    const value = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(off + 4, off + 4 + len));
    return { value, next: off + 4 + len };
}
