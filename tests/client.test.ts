import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MethodID } from '../src/methods';
import { TeleQuickClient } from '../src/client';

describe('MethodID', () => {
    test('has stable wire values', () => {
        expect(MethodID.ORIGINATE).toBe(1430677891);
        expect(MethodID.ORIGINATE_BULK).toBe(721069100);
        expect(MethodID.TERMINATE).toBe(3834253405);
        expect(MethodID.STREAM_EVENTS).toBe(959835745);
        expect(MethodID.AUDIO_FRAME).toBe(2991054320);
    });

    test('values are unique', () => {
        const ids = [
            MethodID.ORIGINATE,
            MethodID.ORIGINATE_BULK,
            MethodID.ABORT_BULK,
            MethodID.TERMINATE,
            MethodID.STREAM_EVENTS,
            MethodID.BARGE,
            MethodID.AUDIO_FRAME,
        ];
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('TeleQuickClient', () => {
    test('dial routes through ORIGINATE method id with mocked transport', async () => {
        const credPath = path.join(os.tmpdir(), `ccsdk_${Date.now()}.json`);
        fs.writeFileSync(credPath, JSON.stringify({
            tenant_id: 'test-tenant',
            private_key: 'mock-key',
            private_key_id: 'key-id',
        }));

        try {
            const client = new TeleQuickClient('quic://127.0.0.1:9090', credPath);
            expect(client).toBeTruthy();

            (client as any).wasmModule = {
                serialize_originate_request: () => new Uint8Array([1, 2, 3]).buffer,
                OriginateRequest: class { delete() {} },
            };

            let sentMethodId = 0;
            let sentBuffer: Uint8Array | null = null;
            (client as any).sendNativePayload = async (methodId: number, buf: Uint8Array) => {
                sentMethodId = methodId;
                sentBuffer = buf;
            };

            await client.dial({ to: '+123', trunkId: 'trunk' });
            expect(sentMethodId).toBe(MethodID.ORIGINATE);
            expect(sentBuffer).toBeTruthy();
        } finally {
            fs.unlinkSync(credPath);
        }
    });
});
