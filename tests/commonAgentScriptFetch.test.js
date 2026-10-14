const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'../scriptCommonAgentFetch.js');
const {createScriptFetch}=fs.existsSync(file)?require(file):{};

test('script requests select parent-capable transport for Common Agent and key-free QA transport',async()=>{
  assert.equal(typeof createScriptFetch,'function');
  const calls=[];
  const fetch=createScriptFetch({agentUrl:'http://127.0.0.1:9123',qaUrl:'http://127.0.0.1:9124',
    transport:async(url,options,policy)=>{calls.push({url,policy});return new Response('ok');}});
  await fetch('http://127.0.0.1:9123/v1/vision/diagnose');
  await fetch('http://127.0.0.1:9124/internal/vision/status');
  assert.equal(calls[0].policy.fetchImpl,undefined);
  assert.equal(calls[1].policy.fetchImpl,globalThis.fetch);
  await assert.rejects(fetch('https://foreign.invalid/v1/ask'),/trusted/i);
  assert.equal(calls.length,2);
});
test('current desktop evaluations and no-write runners no longer use anonymous Common Agent fetch',()=>{
  for(const name of ['run-multimodal-vision-benchmark.js','run-approved-graph-benchmark.js',
    'sync-approved-vision-fixtures.js','run-no-write-multiview-evaluation.js','run-approved-no-write-evaluation.js']) {
    const source=fs.readFileSync(path.join(__dirname,'../scripts',name),'utf8');
    assert(source.includes('createScriptFetch'),`${name} bypasses protected parent transport`);
  }
});
