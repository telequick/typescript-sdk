const CoreWASM = require('./dist/telequick_core_cc.js');
CoreWASM().then((wasmModule) => {
    let exportsName = Object.keys(wasmModule).filter(k => k.startsWith('serialize_') || k.startsWith('rpc_'));
    console.log("Found exports:", exportsName);
}).catch(e => console.error(e));
