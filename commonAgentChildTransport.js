// Parent-owned transport: credentials stay in the desktop's protected gateway.
const REQUEST='COMMON_AGENT_CHILD_REQUEST';
const RESPONSE='COMMON_AGENT_CHILD_RESPONSE';
const CANCEL='COMMON_AGENT_CHILD_CANCEL';
const validId=value=>typeof value==='string' && /^[a-zA-Z0-9.-]{8,100}$/.test(value);

function createChildBridge(channel) {
  if(!channel?.send || !channel?.on || channel.connected===false)throw Error('Protected parent channel unavailable');
  const pending=new Map();
  let closed=false;
  const idle=()=>{if(!pending.size)channel.channel?.unref();};
  channel.on('message',message=>{
    if(message?.type!==RESPONSE || !pending.has(message.requestId))return;
    const task=pending.get(message.requestId);pending.delete(message.requestId);
    if(message.error)task.reject(Error(message.error));
    else task.resolve(message.result);
    idle();
  });
  channel.on('disconnect',()=>{
    closed=true;
    for(const task of pending.values())task.reject(Error('Protected parent channel disconnected'));
    pending.clear();
    idle();
  });
  idle();
  return {
    commonAgentRequest(input) {
      return new Promise((resolve,reject)=>{
        if(closed || channel.connected===false)return reject(Error('Protected parent channel unavailable'));
        if(!validId(input?.requestId) || pending.has(input.requestId))return reject(Error('Invalid or duplicate child request identifier'));
        pending.set(input.requestId,{resolve,reject});
        channel.channel?.ref();
        try {
          channel.send({type:REQUEST,input},error=>{
            if(error && pending.has(input.requestId)) {
              pending.delete(input.requestId);idle();reject(Error('Protected parent channel unavailable'));
            }
          });
        } catch {
          pending.delete(input.requestId);idle();reject(Error('Protected parent channel unavailable'));
        }
      });
    },
    async cancelCommonAgentRequest(requestId) {
      if(closed || !pending.has(requestId))return false;
      const fail=()=>{
        const task=pending.get(requestId);
        if(task) {pending.delete(requestId);idle();task.reject(Error('Protected parent channel unavailable'));}
      };
      try {
        channel.send({type:CANCEL,requestId},error=>{if(error)fail();});return true;
      } catch {fail();return false;}
    },
  };
}

function attachChildBroker({child,getBaseUrl,gateway}) {
  const pending=new Map();
  const send=message=>{if(child.connected!==false)child.send(message,()=>{});};
  const close=()=>{for(const controller of pending.values())controller.abort();pending.clear();};
  child.on('disconnect',close);child.on('exit',close);
  child.on('message',async message=>{
    if(message?.type===CANCEL) {pending.get(message.requestId)?.abort();return;}
    if(message?.type!==REQUEST)return;
    const input=message.input || {};
    if(!validId(input.requestId))return;
    let controller;
    try {
      if(pending.has(input.requestId))throw Error('Child request identifier already pending');
      const base=new URL(getBaseUrl()),target=new URL(input.url);
      const prefix=base.pathname.replace(/\/$/,'');
      if(!['http:','https:'].includes(target.protocol) || target.username || target.password
          || target.origin!==base.origin || !(target.pathname===prefix || target.pathname.startsWith(prefix+'/'))) {
        throw Error('Child request does not match the trusted configured server');
      }
      if(input.body!=null && (!(input.body instanceof Uint8Array) || input.body.byteLength>128*1024*1024))throw Error('Invalid child request payload');
      controller=new AbortController();pending.set(input.requestId,controller);
      const response=await gateway.fetch(target.toString(),{method:input.method || 'GET',
        headers:input.headers,body:input.body,signal:controller.signal},input.timeoutMs);
      send({type:RESPONSE,requestId:input.requestId,result:{status:response.status,
        headers:Object.fromEntries(response.headers),body:new Uint8Array(await response.arrayBuffer())}});
    } catch(error) {
      send({type:RESPONSE,requestId:input.requestId,error:String(error.message || 'Protected request failed').slice(0,300)});
    } finally {if(controller)pending.delete(input.requestId);}
  });
}

let runtimeBridge;
function getRuntimeChildBridge() {
  if(globalThis.process?.env?.MOLD_MASTER_COMMON_AGENT_BROKER!=='1')return null;
  if(globalThis.process.connected===false)throw Error('Protected parent channel unavailable');
  if(!runtimeBridge)runtimeBridge=createChildBridge(globalThis.process);
  return runtimeBridge;
}
module.exports={createChildBridge,attachChildBroker,getRuntimeChildBridge};
