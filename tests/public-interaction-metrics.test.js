const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {observePublicInteractions}=require('../src/remote/public-interaction-metrics');

test('responsiveness observations are bounded, group real interactions and never retain input data',()=>{
 const callbacks={};let disconnected=0;
 class Observer{constructor(callback){this.callback=callback}observe(options){callbacks[options.type]=this.callback}disconnect(){disconnected++}}
 const factory=vm.runInNewContext('('+observePublicInteractions.toString()+')',{PerformanceObserver:Observer,addEventListener(){}}),api=factory();
 assert.equal(api.snapshot().status,'insufficient');assert.equal(api.snapshot().passing,null);
 const entries=[{interactionId:0,duration:9999},{interactionId:1,duration:40,target:'private text'},{interactionId:1,duration:72}];
 callbacks.event({getEntries:()=>entries});assert.equal(api.snapshot().observedInteractions,1);assert.equal(api.snapshot().worstInteractionMs,72);
 callbacks.event({getEntries:()=>Array.from({length:250},(_,i)=>({interactionId:i+2,duration:100}))});
 const result=api.snapshot();assert.equal(result.observedInteractions,200);assert.equal(result.status,'observed-window');assert.equal(result.passing,true);
 assert.equal(result.uploaded,false);assert.equal(result.persisted,false);assert.ok(!JSON.stringify(result).includes('private'));
 callbacks.longtask({getEntries:()=>[{duration:75},{duration:NaN}]});assert.equal(api.snapshot().longTasks,1);api.stop();assert.equal(disconnected,2);
});
test('unsupported event timing never reports a fabricated successful latency',()=>{
 const factory=vm.runInNewContext('('+observePublicInteractions.toString()+')',{addEventListener(){}}),result=factory().snapshot();
 assert.equal(result.status,'unsupported');assert.equal(result.passing,null);assert.equal(result.worstInteractionMs,null);
});
