const CoreWASM = require('./dist/telequick_core_cc.js');
CoreWASM().then((wasmModule) => {
    console.log("Wasm loaded.");
    console.log("rpc_event_stream_request:", typeof wasmModule.rpc_event_stream_request);
    console.log("serialize_event_stream_request:", typeof wasmModule.serialize_event_stream_request);
}).catch(e => console.error(e));
