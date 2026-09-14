const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createPublicVoiceSession } = require('../src/remote/public-voice-session');

function harness(duplex, echoCancellation = true, leaveDuringPlayback = false, interruptGeneration = false, synthesisInterruption = null) {
  let frames=0, recordings=0, transcriptions=0, paused=0, stopped=0, speaking=false, busy=false, cancelled=0, audioStarts=0, synthesisAborted=false, instance;
  const element=()=>({hidden:false,value:'',className:'',textContent:'',inert:false,classList:{contains:()=>false,add(){},remove(){}},setAttribute(){},getAttribute(){return '';},append(){},focus(){},blur(){},dispatchEvent(){}});
  const prompt=element(),core=element();
  const document={createElement:element,body:element(),addEventListener(){},querySelectorAll:()=>[],getElementById:()=>null};
  const stream={getTracks:()=>[{stop(){stopped++;}}],getAudioTracks:()=>[{getSettings:()=>({echoCancellation})}]};
  class Context {
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createAnalyser(){let n=0;return {disconnect(){},getByteTimeDomainData(samples){n++;const loud=n<8;samples.forEach((_,i)=>{samples[i]=loud?(i%2?155:101):128;});}};}
    async resume(){} async close(){} async decodeAudioData(){return {};}
  }
  class Recorder {
    constructor(){this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';recordings++;}
    stop(){if(this.state!=='recording')return;this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['audio'])});this.onstop?.();});}
  }
  class Audio {
    async play(){audioStarts++;speaking=true;if(leaveDuringPlayback){queueMicrotask(()=>instance.leave());return;}if(!duplex||!echoCancellation)queueMicrotask(()=>{speaking=false;this.onended?.();});}
    pause(){if(speaking)paused++;speaking=false;}
  }
  const sandbox={document,navigator:{language:'it-IT',mediaDevices:{getUserMedia:async()=>stream}},AudioContext:Context,MediaRecorder:Recorder,Audio,AbortController,Blob,Event,URL:{createObjectURL:()=> 'blob:qa',revokeObjectURL(){}},performance:{now:()=>frames*80},requestAnimationFrame:callback=>setImmediate(()=>{frames++;if(frames>200)throw Error('capture did not settle');callback(frames*80);}),cancelAnimationFrame:clearImmediate,setTimeout,clearTimeout,addEventListener(){}};
  const factory=vm.runInNewContext(`(${createPublicVoiceSession.toString()})`,sandbox);
  const runtime={};
  const synthesize=async options=>{
    if(synthesisInterruption){
      if(synthesisInterruption==='leave') instance.leave(); else instance.interact();
      synthesisAborted=options.signal.aborted;
      if(synthesisInterruption==='reject') throw Object.assign(new Error('Cancelled'),{name:'AbortError'});
    }
    return {ok:true,blob:async()=>new Blob(['speech'])};
  };
  instance=factory({core,prompt,runtime,duplex,session:async()=>{},fetchAudio:async (path,options)=>path.endsWith('synthesize')?await synthesize(options):{ok:true,json:async()=>({text:`phrase ${++transcriptions}`})},ask:async()=>{if(transcriptions===1){if(interruptGeneration){busy=true;instance.interact();busy=false;}else await instance.speak('response');}else instance.leave();},encodeWav:()=>new Uint8Array(4),spokenLanguage:()=> 'it',setState:s=>{runtime.voiceState=s;},setPhase(){},isBusy:()=>busy,cancelResponse:()=>{cancelled++;},showText(){}});
  return {instance,run:()=>instance.start(),stats:()=>({recordings,transcriptions,paused,stopped,speaking,cancelled,audioStarts,synthesisAborted})};
}

test('duplex captures a complete interruption during playback and releases the microphone',async()=>{
  const h=harness(true);await h.run();const s=h.stats();
  assert.equal(s.transcriptions,2);assert.equal(s.recordings,2);assert.equal(s.paused,1);assert.equal(s.speaking,false);assert.ok(s.stopped>=1);assert.equal(h.instance.active,false);
});
test('missing echo cancellation retains sequential capture without advertising duplex',async()=>{
  const h=harness(true,false);await h.run();assert.equal(h.stats().paused,0);assert.equal(h.stats().transcriptions,2);
});

test('leaving during playback releases audio and does not start another turn',async()=>{
  const h=harness(true,true,true);await h.run();assert.equal(h.instance.active,false);assert.equal(h.stats().transcriptions,1);assert.equal(h.stats().speaking,false);assert.ok(h.stats().stopped>=1);
});
test('duplex remains opt-in until real microphone validation',async()=>{
  const h=harness(undefined);await h.run();assert.equal(h.stats().paused,0);assert.equal(h.stats().transcriptions,2);
});
test('Core reuses response cancellation during generation and resumes the same voice conversation',async()=>{
  const h=harness(false,true,false,true);await h.run();
  assert.equal(h.stats().cancelled,1);
  assert.equal(h.stats().transcriptions,2);
  assert.equal(h.stats().recordings,2);
  assert.equal(h.stats().paused,0);
  assert.equal(h.instance.active,false);
});
for(const mode of ['late-response','reject','leave']){
  test(`synthesis interruption ${mode} prevents stale audio and releases the session`,async()=>{
    const h=harness(false,true,false,false,mode);await h.run();const s=h.stats();
    assert.equal(s.synthesisAborted,true);
    assert.equal(s.audioStarts,0);
    assert.equal(s.transcriptions,mode==='leave'?1:2);
    assert.ok(s.stopped>=1);
    assert.equal(h.instance.active,false);
  });
}