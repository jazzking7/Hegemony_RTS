'use strict';
// Reference-preserving wire codec for the public simulation graph. An explicit
// root allowlist excludes UI drafts, AI planning state and secret agenda data.
(function(root) {
  const fields=['started','paused','over','time','id','unitInstanceId','automationId','scheduleExecutionId','players','buildings','units','projectiles','effects','entityById','liveEntityCount','enemyCount','mapSize','energyFields','energyFieldRevision','energyFieldSignature','missileZones','captureZones','captureRegions','captureIncome','territorialControl'];
  function pack(game) {
    const nodes=[], seen=new Map();
    function encode(value) {
      if(value===undefined || typeof value==='function') return null;
      if(value===null || typeof value!=='object') return Number.isFinite(value) || typeof value!=='number' ? value : null;
      if(seen.has(value)) return {$ref:seen.get(value)};
      const id=nodes.length; seen.set(value,id); nodes.push(null);
      const tag=Object.prototype.toString.call(value);
      if(tag==='[object Map]') nodes[id]=['map',[...value].map(([k,v])=>[encode(k),encode(v)])];
      else if(tag==='[object Set]') nodes[id]=['set',[...value].map(encode)];
      else if(Array.isArray(value)) nodes[id]=['array',value.map(encode)];
      else nodes[id]=['object',Object.entries(value).filter(([k])=> !['ai','modifierCache','path','pathQueue','urgentPathQueue'].includes(k)).map(([k,v])=>[k,encode(v)])];
      return {$ref:id};
    }
    return {root:encode(Object.fromEntries(fields.map(k=>[k,game[k]]))),nodes};
  }
  function unpack(packet) {
    const objects=packet.nodes.map(([kind])=>kind==='map'?new Map():kind==='set'?new Set():kind==='array'?[]:{});
    const decode=value=>value && typeof value==='object' && Number.isInteger(value.$ref)?objects[value.$ref]:value;
    packet.nodes.forEach(([kind,items],i)=> {
      const target=objects[i];
      if(kind==='map') items.forEach(([k,v])=>target.set(decode(k),decode(v)));
      else if(kind==='set') items.forEach(v=>target.add(decode(v)));
      else if(kind==='array') items.forEach(v=>target.push(decode(v)));
      else items.forEach(([k,v])=>{if(!['__proto__','constructor','prototype'].includes(k))target[k]=decode(v);});
    });
    return decode(packet.root);
  }
  root.PublicWorldState={pack,unpack};
})(globalThis);
