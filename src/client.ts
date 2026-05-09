import { MethodID } from './methods';

interface NodeRequire { (id: string): unknown; }
interface NodeFs { readFileSync(path: string, encoding: string): string; }
interface NodeProcess { env: Record<string, string | undefined>; }

declare const process: NodeProcess;

type GlobalWithLoaders = typeof globalThis & {
    WebTransport?: WebTransportConstructor;
    TeleQuickModule?: () => Promise<TeleQuickWasmModule>;
    require?: NodeRequire;
};

function loadOptionalModule<T>(pkg: string): T | undefined {
    const g = globalThis as GlobalWithLoaders;
    const req: NodeRequire | undefined =
        g.require || ((): NodeRequire | undefined => {
            try { return eval('req' + 'uire') as NodeRequire; } catch { return undefined; }
        })();
    if (!req) return undefined;
    try { return req(pkg) as T; } catch { return undefined; }
}

interface WebTransportStreamWriter {
    write(chunk: Uint8Array): Promise<void>;
    close(): Promise<void>;
}
interface WebTransportWritableStream {
    writable: { getWriter(): WebTransportStreamWriter };
    getWriter(): WebTransportStreamWriter;
}
interface WebTransportStreamReader {
    read(): Promise<{ done: boolean; value?: WebTransportReadableStream | Uint8Array }>;
}
interface WebTransportReadableStream {
    getReader(): WebTransportStreamReader;
}
interface WebTransportBidirectionalStream {
    writable: { getWriter(): WebTransportStreamWriter };
}
interface WebTransportSession {
    ready: Promise<void>;
    closed: Promise<unknown>;
    createBidirectionalStream(): Promise<WebTransportBidirectionalStream>;
    createUnidirectionalStream(): Promise<WebTransportWritableStream>;
    incomingUnidirectionalStreams: WebTransportReadableStream;
}
interface WebTransportOptions {
    serverCertificateHashes?: { algorithm: string; value: Uint8Array }[];
}
type WebTransportConstructor = new (url: string, options: WebTransportOptions) => WebTransportSession;

interface WasmDeletable { delete(): void; }
interface WasmOriginateRequest extends WasmDeletable {
    trunk_id: string; to: string; call_from: string;
    ai_websocket_url: string; ai_quic_url: string; tenant_id: string;
    max_duration_ms: number; call_sid: string;
    default_app: number; default_app_args: string;
    auto_barge_in: boolean; barge_in_patience_ms: number;
    client_id: string;
}
interface WasmBulkRequest extends WasmDeletable {
    csv_url: string;
    template_trunk_id: string; template_to: string; template_call_from: string;
    template_ai_websocket_url: string; template_ai_quic_url: string;
    template_tenant_id: string; template_max_duration_ms: number;
    template_default_app: number; template_default_app_args: string;
    calls_per_second: number; max_concurrent_calls: number;
    campaign_id: string;
    auto_barge_in: boolean; barge_in_patience_ms: number;
}
interface WasmCallSidRequest extends WasmDeletable { call_sid: string; }
interface WasmClientIdRequest extends WasmDeletable { client_id: string; }
interface WasmTrunkIdRequest extends WasmDeletable { trunk_id: string; }
interface WasmCampaignIdRequest extends WasmDeletable { campaign_id: string; }
interface WasmSetInboundRoutingRequest extends WasmDeletable {
    trunk_id: string;
    rule: number;
    audio_url: string;
    webhook_url: string;
    ai_websocket_url: string;
    ai_quic_url: string;
}
interface WasmAnswerIncomingCallRequest extends WasmDeletable {
    call_sid: string;
    ai_websocket_url: string;
    ai_quic_url: string;
}
interface WasmExecuteDialplanRequest extends WasmDeletable {
    call_sid: string;
    action: number;
    app_args: string;
}

/** Mirrors telequick/api/telequick_types.hh::DialplanAction.
 *
 * Values 0-6 are the original dialplan apps (usable as `defaultApp` on
 * Dial). Values 7-12 are call-control verbs only valid through
 * `executeDialplan` against an active `call_sid`. */
export enum DialplanAction {
    HANGUP = 0,
    PARK = 1,
    MUSIC_ON_HOLD = 2,
    PLAYBACK = 3,
    UNPARK_AND_BRIDGE = 4,
    ANSWER = 5,
    AI_BIDIRECTIONAL_STREAM = 6,
    TRANSFER = 7,
    MUTE = 8,
    UNMUTE = 9,
    HOLD = 10,
    UNHOLD = 11,
    SEND_DTMF = 12,
}

export interface CallEvent extends WasmDeletable {
    call_sid: string; event_type: number; status: string;
    start_timestamp_ms: bigint; q850_cause: number; duration_seconds: number;
    answer_timestamp_ms: bigint; end_timestamp_ms: bigint;
    trunk_id: string; tenant_id: string;
}

export interface TeleQuickWasmModule {
    OriginateRequest: new () => WasmOriginateRequest;
    BulkRequest: new () => WasmBulkRequest;
    TerminateRequest: new () => WasmCallSidRequest;
    BargeRequest: new () => WasmCallSidRequest;
    EventStreamRequest: new () => WasmClientIdRequest;
    SetInboundRoutingRequest: new () => WasmSetInboundRoutingRequest;
    GetIncomingCallsRequest: new () => WasmTrunkIdRequest;
    AnswerIncomingCallRequest: new () => WasmAnswerIncomingCallRequest;
    AbortBulkRequest: new () => WasmCampaignIdRequest;
    ExecuteDialplanRequest: new () => WasmExecuteDialplanRequest;
    DialplanAction: { PARK: number };
    rpc_originate_request(req: WasmOriginateRequest): ArrayBuffer;
    rpc_bulk_request(req: WasmBulkRequest): ArrayBuffer;
    rpc_terminate_request(req: WasmCallSidRequest): ArrayBuffer;
    rpc_barge_request(req: WasmCallSidRequest): ArrayBuffer;
    rpc_event_stream_request(req: WasmClientIdRequest): ArrayBuffer;
    rpc_set_inbound_routing_request(req: WasmSetInboundRoutingRequest): ArrayBuffer;
    rpc_get_incoming_calls_request(req: WasmTrunkIdRequest): ArrayBuffer;
    rpc_answer_incoming_call_request(req: WasmAnswerIncomingCallRequest): ArrayBuffer;
    rpc_abort_bulk_request(req: WasmCampaignIdRequest): ArrayBuffer;
    rpc_execute_dialplan_request(req: WasmExecuteDialplanRequest): ArrayBuffer;
    serialize_audio_frame(callSid: string, payload: Uint8Array, codec: string, seq: number, eos: boolean): ArrayBuffer;

    // Inverse of serialize_audio_frame — used by the browser playback path
    // (PR15) so the SDK consumer doesn't have to re-implement the serde
    // wire format. Returns a typed AudioFrame view; caller should call
    // .delete() on the returned object once consumed (Embind ownership).
    AudioFrame: new () => WasmAudioFrame;
    deserialize_audio_frame(payload: Uint8Array): WasmAudioFrame;
}

export interface WasmAudioFrame extends WasmDeletable {
    call_sid: string;
    // Raw codec bytes — Embind exposes seastar::sstring as a JS string, so
    // binary payloads come through as a string with each char being one byte.
    // Use audioFramePayloadAsBytes() (helpers.ts) to convert.
    payload: string;
    codec: string;
    sequence_number: number;
    end_of_stream: boolean;
}

type WasmFactory = () => Promise<TeleQuickWasmModule>;

let WebTransportImpl: WebTransportConstructor | undefined;
{
    const g = globalThis as GlobalWithLoaders;
    if (g.WebTransport) {
        WebTransportImpl = g.WebTransport;
    } else {
        const mod = loadOptionalModule<{ WebTransport: WebTransportConstructor }>(
            '@fails' + '-' + 'components/webtransport',
        );
        if (mod) WebTransportImpl = mod.WebTransport;
    }
}

const CoreWASM: WasmFactory = (() => {
    const mod = loadOptionalModule<WasmFactory>('./tq' + 'call_core_cc.js');
    if (mod) return mod;
    return async () => {
        const g = globalThis as GlobalWithLoaders;
        if (g.TeleQuickModule) return g.TeleQuickModule();
        throw new Error(
            'TeleQuickModule not loaded into global browser scope. ' +
            'Include the WASM script in your HTML.',
        );
    };
})();

const fs: NodeFs | undefined = loadOptionalModule<NodeFs>('f' + 's');

export interface TeleQuickCredentials {
    tenantId: string;
    privateKey: string;
    privateKeyId: string;
}

interface TeleQuickCredentialsWire {
    tenant_id: string;
    private_key: string;
    private_key_id: string;
}

function parseCredentials(raw: string): TeleQuickCredentials {
    const wire = JSON.parse(raw) as TeleQuickCredentialsWire;
    return {
        tenantId: wire.tenant_id,
        privateKey: wire.private_key,
        privateKeyId: wire.private_key_id,
    };
}

interface JwtSigner {
    sign(payload: object, secret: string, options: {
        algorithm: string;
        keyid: string;
        issuer: string;
        expiresIn: string;
    }): string;
}

export interface DialOptions {
    to: string;
    trunkId: string;
    callFrom?: string;
    aiWebsocketUrl?: string;
    aiQuicUrl?: string;
    onDisconnect?: (e: CallEvent) => void;
    callSid?: string;
    autoBargeIn?: boolean;
    bargeInPatienceMs?: number;
    clientId?: string;
}

export interface BulkDialOptions {
    csvUrl: string;
    trunkId: string;
    cps: number;
    campaignId: string;
    defaultApp?: number;
    defaultAppArgs?: string;
    aiWebsocketUrl?: string;
    aiQuicUrl?: string;
    autoBargeIn?: boolean;
    bargeInPatienceMs?: number;
}

export class TeleQuickClient {
    private transport!: WebTransportSession;
    private credentials!: TeleQuickCredentials;
    private browserJwtToken!: string;
    public wasmModule!: TeleQuickWasmModule;
    private endpoint: string;

    private audioWriter: WebTransportStreamWriter | null = null;
    public onAudioFrame?: (payload: Uint8Array) => void;
    public onCallEvent?: (payload: Uint8Array) => void;

    private eventHooks: Map<string, (log: CallEvent) => void> = new Map();
    private clientId: string;
    public serverCertificateHash?: string;

    constructor(endpoint: string, credentialsPathOrToken?: string, isBrowserToken: boolean = false, serverCertificateHash?: string) {
        this.clientId = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2, 15);
        this.endpoint = endpoint.replace('quic://', 'https://');
        this.serverCertificateHash = serverCertificateHash;

        if (isBrowserToken && credentialsPathOrToken) {
            this.browserJwtToken = credentialsPathOrToken;
        } else {
            const credPath = credentialsPathOrToken || process.env.TELEQUICK_CREDENTIALS;
            if (!credPath) throw new Error('Missing TELEQUICK_CREDENTIALS');
            if (!fs) throw new Error('fs module not available in this runtime');
            const credData = fs.readFileSync(credPath, 'utf-8');
            this.credentials = parseCredentials(credData);
        }
    }

    async connect(): Promise<void> {
        console.log('Initializing WASM Module...');
        this.wasmModule = await CoreWASM();
        console.log('WASM loaded successfully.');

        let token: string;
        if (this.browserJwtToken) {
            token = this.browserJwtToken;
        } else {
            const jwtLib = loadOptionalModule<JwtSigner>('jsonweb' + 'token');
            if (!jwtLib) throw new Error('jsonwebtoken module not available');
            token = jwtLib.sign(
                { tenant_id: this.credentials.tenantId },
                this.credentials.privateKey,
                { algorithm: 'RS256', keyid: this.credentials.privateKeyId, issuer: 'telequick-sdk', expiresIn: '1h' },
            );
        }
        void token;

        const wtOptions: WebTransportOptions = {};
        if (this.serverCertificateHash && this.serverCertificateHash !== 'none' && this.serverCertificateHash !== '') {
            const hashBytes = Uint8Array.from(atob(this.serverCertificateHash), c => c.charCodeAt(0));
            wtOptions.serverCertificateHashes = [{ algorithm: 'sha-256', value: hashBytes }];
        }
        console.log('Initializing WebTransport to ' + this.endpoint, wtOptions);
        if (!WebTransportImpl) throw new Error('WebTransport implementation unavailable');
        this.transport = new WebTransportImpl(this.endpoint, wtOptions);

        this.transport.closed
            .then(() => console.log('WT Closed gracefully'))
            .catch((e: unknown) => console.log('WT Closed with error', e));

        try {
            await this.transport.ready;
        } catch (e) {
            console.error('WT Ready failed:', e);
            throw e;
        }
        console.log('WebTransport session established');
        this.initializeEventDemultiplexer();
    }

    private initializeEventDemultiplexer() {
        if (!this.wasmModule) return;
        console.log('Dispatching event stream request over WT...');
        const req = new this.wasmModule.EventStreamRequest();
        req.client_id = this.clientId;
        const payloadView = this.wasmModule.rpc_event_stream_request(req);
        this.sendNativePayload(new Uint8Array(payloadView));
        req.delete();

        void (async () => {
            const reader = this.transport.incomingUnidirectionalStreams.getReader();
            while (true) {
                const { done, value: stream } = await reader.read();
                if (done) break;
                if (!stream || stream instanceof Uint8Array) continue;
                this.demuxStream(stream).catch((e: unknown) => console.error(e));
            }
        })();
    }

    private async demuxStream(stream: WebTransportReadableStream): Promise<void> {
        const r = stream.getReader();
        let buffer = new Uint8Array(0);
        while (true) {
            const { done, value: chunk } = await r.read();
            if (chunk && chunk instanceof Uint8Array) {
                const merged = new Uint8Array(buffer.length + chunk.length);
                merged.set(buffer);
                merged.set(chunk, buffer.length);
                buffer = merged;

                while (buffer.length >= 8) {
                    const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
                    const totalLen = dv.getUint32(0, true);
                    if (buffer.length < 4 + totalLen) break;

                    const dgId = dv.getUint32(4, true);
                    const payload = new Uint8Array(buffer.buffer, buffer.byteOffset + 8, totalLen - 4);

                    if (dgId === MethodID.AUDIO_FRAME && this.onAudioFrame) {
                        this.onAudioFrame(payload);
                    } else if (dgId === MethodID.STREAM_EVENTS && this.onCallEvent) {
                        this.onCallEvent(payload);
                    }

                    buffer = new Uint8Array(buffer.buffer, buffer.byteOffset + 4 + totalLen, buffer.length - (4 + totalLen));
                }
            }
            if (done) break;
        }
    }

    private async sendNativePayload(buf: Uint8Array): Promise<void> {
        const stream = await this.transport.createBidirectionalStream();
        const writer = stream.writable.getWriter();
        await writer.write(buf);
        await writer.close();
    }

    async pushAudio(callSid: string, payload: Uint8Array, codec: string, sequenceNumber: number, endOfStream: boolean): Promise<void> {
        if (!this.wasmModule) await this.connect();

        const payloadView = this.wasmModule.serialize_audio_frame(callSid, payload, codec, sequenceNumber, endOfStream);
        const payloadBytes = new Uint8Array(payloadView);

        if (!this.audioWriter) {
            const stream = await this.transport.createUnidirectionalStream();
            this.audioWriter = stream.getWriter();
        }

        const header = new ArrayBuffer(8);
        const headerView = new DataView(header);
        headerView.setUint32(0, payloadBytes.length + 4, true);
        headerView.setUint32(4, MethodID.AUDIO_FRAME, true);

        await this.audioWriter.write(new Uint8Array(header));
        await this.audioWriter.write(payloadBytes);
    }

    async dial(options: DialOptions): Promise<void> {
        if (!this.wasmModule) await this.connect();

        const req = new this.wasmModule.OriginateRequest();
        req.trunk_id = options.trunkId;
        req.to = options.to;
        req.call_from = options.callFrom || '';
        req.ai_websocket_url = options.aiWebsocketUrl || '';
        req.ai_quic_url = options.aiQuicUrl || '';
        req.tenant_id = this.credentials ? this.credentials.tenantId : 'browser_tenant';
        req.default_app = this.wasmModule.DialplanAction.PARK;
        req.default_app_args = '';
        req.auto_barge_in = options.autoBargeIn || false;
        req.barge_in_patience_ms = options.bargeInPatienceMs || 250;
        req.client_id = options.clientId || this.clientId;
        if (options.callSid) req.call_sid = options.callSid;

        const payloadView = this.wasmModule.rpc_originate_request(req);
        await this.sendNativePayload(new Uint8Array(payloadView));

        if (options.onDisconnect && options.callSid) {
            this.eventHooks.set(options.callSid, options.onDisconnect);
        }

        req.delete();
    }

    async originateBulk(options: BulkDialOptions): Promise<void> {
        if (!this.wasmModule) await this.connect();

        const req = new this.wasmModule.BulkRequest();
        req.csv_url = options.csvUrl;
        req.template_trunk_id = options.trunkId;
        req.template_to = '';
        req.template_call_from = '';
        req.template_tenant_id = this.credentials ? this.credentials.tenantId : 'browser_tenant';
        req.template_ai_websocket_url = options.aiWebsocketUrl || '';
        req.template_ai_quic_url = options.aiQuicUrl || '';
        req.template_max_duration_ms = 0;
        req.template_default_app = this.wasmModule.DialplanAction.PARK;
        req.template_default_app_args = '';
        req.calls_per_second = options.cps;
        req.max_concurrent_calls = options.cps;
        req.campaign_id = options.campaignId;
        req.auto_barge_in = options.autoBargeIn || false;
        req.barge_in_patience_ms = options.bargeInPatienceMs || 250;

        const payloadView = this.wasmModule.rpc_bulk_request(req);
        await this.sendNativePayload(new Uint8Array(payloadView));
        req.delete();
    }

    async terminate(callSid: string): Promise<void> {
        if (!this.wasmModule) await this.connect();
        const req = new this.wasmModule.TerminateRequest();
        req.call_sid = callSid;
        const payloadView = this.wasmModule.rpc_terminate_request(req);
        await this.sendNativePayload(new Uint8Array(payloadView));
        req.delete();
    }

    async barge(callSid: string): Promise<void> {
        if (!this.wasmModule) await this.connect();
        const req = new this.wasmModule.BargeRequest();
        req.call_sid = callSid;
        const payloadView = this.wasmModule.rpc_barge_request(req);
        await this.sendNativePayload(new Uint8Array(payloadView));
        req.delete();
    }

    async streamEvents(clientId: string): Promise<void> {
        if (!this.wasmModule) await this.connect();
        const req = new this.wasmModule.EventStreamRequest();
        req.client_id = clientId;
        const payloadView = this.wasmModule.rpc_event_stream_request(req);
        await this.sendNativePayload(new Uint8Array(payloadView));
        req.delete();
    }

    // ─── Inbound routing (parity with Python + Go) ─────────────────────
    //
    // The WASM module exposes the same DTOs (SetInboundRoutingRequest,
    // GetIncomingCallsRequest, AnswerIncomingCallRequest, AbortBulkRequest)
    // and rpc_*_request shims as the native FFI lib. If your build of
    // telequick_core.{js,wasm} predates these methods, regenerate the
    // bindings via the apirpc_compiler (see telequick/tools/apirpc_compiler).

    async setInboundRouting(opts: {
        trunkId: string;
        rule: number;                       // InboundRule enum: 1=AI, 2=WEBHOOK, 3=PLAYBACK
        audioUrl?: string;                  // for rule=PLAYBACK
        webhookUrl?: string;                // for rule=WEBHOOK
        aiWebsocketUrl?: string;            // for rule=AI
        aiQuicUrl?: string;
    }): Promise<void> {
        if (!this.wasmModule) await this.connect();
        const req = new this.wasmModule.SetInboundRoutingRequest();
        req.trunk_id = opts.trunkId;
        req.rule = opts.rule;
        req.audio_url = opts.audioUrl ?? "";
        req.webhook_url = opts.webhookUrl ?? "";
        req.ai_websocket_url = opts.aiWebsocketUrl ?? "";
        req.ai_quic_url = opts.aiQuicUrl ?? "";
        const payloadView = this.wasmModule.rpc_set_inbound_routing_request(req);
        await this.sendNativePayload(new Uint8Array(payloadView));
        req.delete();
    }

    async getIncomingCalls(trunkId: string): Promise<void> {
        if (!this.wasmModule) await this.connect();
        const req = new this.wasmModule.GetIncomingCallsRequest();
        req.trunk_id = trunkId;
        const payloadView = this.wasmModule.rpc_get_incoming_calls_request(req);
        await this.sendNativePayload(new Uint8Array(payloadView));
        req.delete();
    }

    async answerIncomingCall(opts: {
        callSid: string;
        aiWebsocketUrl?: string;
        aiQuicUrl?: string;
    }): Promise<void> {
        if (!this.wasmModule) await this.connect();
        const req = new this.wasmModule.AnswerIncomingCallRequest();
        req.call_sid = opts.callSid;
        req.ai_websocket_url = opts.aiWebsocketUrl ?? "";
        req.ai_quic_url = opts.aiQuicUrl ?? "";
        const payloadView = this.wasmModule.rpc_answer_incoming_call_request(req);
        await this.sendNativePayload(new Uint8Array(payloadView));
        req.delete();
    }

    async abortBulk(campaignId: string): Promise<void> {
        if (!this.wasmModule) await this.connect();
        const req = new this.wasmModule.AbortBulkRequest();
        req.campaign_id = campaignId;
        const payloadView = this.wasmModule.rpc_abort_bulk_request(req);
        await this.sendNativePayload(new Uint8Array(payloadView));
        req.delete();
    }

    // ─── Mid-call dialplan execution + call-control verbs ──────────────
    //
    // All five verbs (transfer, mute, unmute, hold, unhold, sendDtmf)
    // route through ExecuteDialplan with a DialplanAction enum value
    // and an app_args string. The engine maps each verb to the right
    // SIP/RTP primitive — REFER for transfer, gateway-side TX silencing
    // (or recvonly re-INVITE) for mute, sendrecv re-INVITE for hold, etc.

    async executeDialplan(callSid: string, action: DialplanAction | number, appArgs: string = ""): Promise<void> {
        if (!this.wasmModule) await this.connect();
        const req = new this.wasmModule.ExecuteDialplanRequest();
        req.call_sid = callSid;
        req.action = action as number;
        req.app_args = appArgs;
        const payloadView = this.wasmModule.rpc_execute_dialplan_request(req);
        await this.sendNativePayload(new Uint8Array(payloadView));
        req.delete();
    }

    /** RFC 3515 blind transfer. `destination` may be a SIP URI or E.164. */
    async transfer(callSid: string, destination: string): Promise<void> {
        await this.executeDialplan(callSid, DialplanAction.TRANSFER, destination);
    }

    /** Mute the call. `onWire=true` also sends a SIP recvonly re-INVITE. */
    async mute(callSid: string, opts: { onWire?: boolean } = {}): Promise<void> {
        await this.executeDialplan(callSid, DialplanAction.MUTE, opts.onWire ? "wire" : "");
    }

    async unmute(callSid: string, opts: { onWire?: boolean } = {}): Promise<void> {
        await this.executeDialplan(callSid, DialplanAction.UNMUTE, opts.onWire ? "wire" : "");
    }

    async hold(callSid: string): Promise<void> {
        await this.executeDialplan(callSid, DialplanAction.HOLD, "");
    }

    async unhold(callSid: string): Promise<void> {
        await this.executeDialplan(callSid, DialplanAction.UNHOLD, "");
    }

    /** Send a DTMF digit. mode = "rfc2833" | "info" | "inband". */
    async sendDtmf(
        callSid: string,
        digit: string,
        opts: { mode?: "rfc2833" | "info" | "inband"; durationMs?: number } = {},
    ): Promise<void> {
        if (digit.length !== 1 || !"0123456789*#".includes(digit)) {
            throw new Error(`invalid DTMF digit: ${digit}`);
        }
        const mode = opts.mode ?? "rfc2833";
        const durationMs = opts.durationMs ?? 200;
        await this.executeDialplan(
            callSid,
            DialplanAction.SEND_DTMF,
            `${digit}:${mode}:${durationMs}`,
        );
    }
}
