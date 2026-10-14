const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const {fork}=require('node:child_process');
const present=fs.existsSync(path.join(__dirname,'../commonAgentChildTransport.js'));
const api=present?require('../commonAgentChildTransport'):{};

function fixture(){
  assert.equal(typeof api.createChildBridge,'function','Protected child transport is missing');
  assert.equal(typeof api.attachChildBroker,'function','Parent request broker is missing');
  const child=new EventEmitter();child.connected=true;
  const parent=new EventEmitter();parent.connected=true;
  child.send=message=>queueMicrotask(()=>parent.emit('message',message));
  parent.send=message=>queueMicrotask(()=>child.emit('message',message));
  const calls=[];
  api.attachChildBroker({child:parent,getBaseUrl:()=> 'http://127.0.0.1:9123',gateway:{
    fetch:async(url,options)=>{calls.push({url,options});
      if(url.endsWith('/slow'))return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('cancelled'))));
      return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/png'}});
    }}});
  return {child,parent,calls,bridge:api.createChildBridge(child)};
}
test('child requests use the parent gateway and carry no credential',async()=>{
  const f=fixture();
  const result=await f.bridge.commonAgentRequest({url:'http://127.0.0.1:9123/v1/datasets/images/a/file',requestId:'request-0001'});
  assert.equal(result.status,200);
  assert.deepEqual(Array.from(result.body),[1,2,3]);
  assert.equal(f.calls.length,1);
  assert(!JSON.stringify(f.calls).includes('token'));
});
test('foreign destination and malformed body never reach the parent gateway',async()=>{
  const f=fixture();
  await assert.rejects(f.bridge.commonAgentRequest({url:'https://other.invalid/v1/ask',requestId:'request-0002'}),/trusted|configured/i);
  await assert.rejects(f.bridge.commonAgentRequest({url:'http://127.0.0.1:9123/v1/ask',requestId:'request-0003',body:{invalid:true}}),/payload/i);
  assert.equal(f.calls.length,0);
});
test('cancellation affects only the owned pending request',async()=>{
  const f=fixture();
  const pending=f.bridge.commonAgentRequest({url:'http://127.0.0.1:9123/slow',requestId:'request-0004'});
  await new Promise(resolve=>setImmediate(resolve));
  await f.bridge.cancelCommonAgentRequest('request-0004');
  await assert.rejects(pending,/cancelled/i);
  const next=await f.bridge.commonAgentRequest({url:'http://127.0.0.1:9123/healthz',requestId:'request-0005'});
  assert.equal(next.status,200);
});
test('lost parent channel fails closed, not anonymous fetch',async()=>{
  const f=fixture();
  const pending=f.bridge.commonAgentRequest({url:'http://127.0.0.1:9123/slow',requestId:'request-0006'});
  f.child.emit('disconnect');
  await assert.rejects(pending,/disconnect|unavailable/i);
  await assert.rejects(f.bridge.commonAgentRequest({url:'http://127.0.0.1:9123/healthz',requestId:'request-0007'}),/disconnect|unavailable/i);
});
test('transport chooses protected parent mode when the child marker is set',async()=>{
  const previous=process.env.MOLD_MASTER_COMMON_AGENT_BROKER;
  process.env.MOLD_MASTER_COMMON_AGENT_BROKER='1';
  let anonymous=0;
  try {
    const {fetchWithCommonAgentPolicy}=require('../commonAgentTransport');
    await assert.rejects(async()=>fetchWithCommonAgentPolicy('http://127.0.0.1:9123/healthz',{},
      {fetchImpl:async()=>{anonymous++;return new Response('unsafe');}}),/parent channel unavailable/i);
    assert.equal(anonymous,0,'Disconnected broker must not fall through to anonymous fetch');
  } finally {
    if(previous===undefined)delete process.env.MOLD_MASTER_COMMON_AGENT_BROKER;
    else process.env.MOLD_MASTER_COMMON_AGENT_BROKER=previous;
  }
  const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
  assert(main.includes('attachChildBroker'));
  assert(main.includes("serialization: 'advanced'"));
});
test('an actual child receives binary IPC and exits without an orphaned channel',async()=>{
  const child=fork(path.join(__dirname,'fixtures/commonAgentChildProcessFixture.js'),['http://127.0.0.1:9123'],{
    silent:true,serialization:'advanced',env:{...process.env,MOLD_MASTER_COMMON_AGENT_BROKER:'1'},
  });
  api.attachChildBroker({child,getBaseUrl:()=> 'http://127.0.0.1:9123',gateway:{
    fetch:async()=>new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/png'}})}});
  let output='';child.stdout.on('data',data=>{output+=data.toString();});
  const result=await new Promise(resolve=>{
    const timer=setTimeout(()=>{child.kill();resolve({timedOut:true});},1500);
    child.on('close',code=>{clearTimeout(timer);resolve({code});});
  });
  assert(!result.timedOut,'Completed child remains alive because the IPC channel is still referenced');
  assert.equal(result.code,0);
  assert.equal(JSON.parse(output.trim()).status,'passed');
});
test('send callback and synchronous channel failures reject rather than leave requests pending',async()=>{
  for(const mode of ['callback','throw']) {
    const channel=new EventEmitter();channel.connected=true;
    channel.send=(_message,callback)=>{if(mode==='throw')throw Error('closed');callback(Error('closed'));};
    const bridge=api.createChildBridge(channel);
    await assert.rejects(bridge.commonAgentRequest({url:'http://127.0.0.1:9123/healthz',requestId:'failed-send-0001'}),/unavailable/);
    assert.equal(await bridge.cancelCommonAgentRequest('failed-send-0001'),false);
  }
  assert.throws(()=>api.createChildBridge({connected:false}),/unavailable/);
});
test('invalid and duplicate identifiers cannot add a second upstream request',async()=>{
  const f=fixture();
  await assert.rejects(f.bridge.commonAgentRequest({requestId:'!'}),/identifier/);
  const input={url:'http://127.0.0.1:9123/slow',requestId:'duplicate-0001'};
  const pending=f.bridge.commonAgentRequest(input);
  await assert.rejects(f.bridge.commonAgentRequest(input),/duplicate/);
  await new Promise(resolve=>setImmediate(resolve));
  await f.bridge.cancelCommonAgentRequest(input.requestId);
  await assert.rejects(pending,/cancelled/);
  assert.equal(f.calls.length,1);
});

test('a channel lost during cancellation settles the request without an unhandled rejection',async()=>{
  for(const mode of ['callback','throw']) {
    const channel=new EventEmitter();channel.connected=true;channel.send=()=>{};
    const bridge=api.createChildBridge(channel);
    const pending=bridge.commonAgentRequest({requestId:'cancel-race-0001'});
    const outcome=pending.then(()=> 'resolved',()=> 'rejected');
    channel.send=(_message,callback)=>{if(mode==='throw')throw Error('closed');callback?.(Error('closed'));};
    try {
      assert.equal(await bridge.cancelCommonAgentRequest('cancel-race-0001'),mode!=='throw');
      assert.equal(await Promise.race([outcome,new Promise(resolve=>setTimeout(()=>resolve('pending'),20))]),'rejected');
    } finally {channel.emit('disconnect');await outcome;}
  }
});
