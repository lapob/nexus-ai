const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createPublicVoiceSession } = require('../src/remote/public-voice-session');

function harness(duplex, echoCancellation = true, leaveDuringPlayback = false, interruptGeneration = false, synthesisInterruption = null, tone = 'neutral', voiceCapability = 'available', { browserLanguage = 'it-IT', transcriptLanguages = ['it'], responseLanguage = 'auto', spokenTurns = 1, fallbackLanguage = 'it', responseText = 'response', spokenGenerationInterruption = false, waitingFrames = 0, speechFrames = 7, streamingFrames = null, resumeFailureAt = 0, presentationDuringPlayback = false, microphoneDisconnectAtFrame = 0, floatCapture = false } = {}) {
  let frames=0, recordings=0, transcriptions=0, paused=0, stopped=0, speaking=false, busy=false, cancelled=0, audioStarts=0, synthesisAborted=false, microphoneRequests=0, instance, finishGeneration;
  const element=()=>{const classes=new Set(),attributes=new Map(),listeners=new Map(),styles=new Map();return {hidden:false,value:'',className:'',textContent:'',dataset:{},inert:false,style:{setProperty(k,v){styles.set(k,v);},removeProperty(k){styles.delete(k);},getPropertyValue:k=>styles.get(k)},getBoundingClientRect:()=>({left:40,top:80,width:240,height:240}),classList:{contains:value=>classes.has(value),add(...values){values.forEach(value=>classes.add(value));},remove(...values){values.forEach(value=>classes.delete(value));}},setAttribute(key,value){attributes.set(key,value);},getAttribute(key){return attributes.get(key)||'';},addEventListener(key,handler){listeners.set(key,handler);},emit(key,event){listeners.get(key)?.(event);},append(){},focus(){document.activeElement=this;},blur(){},dispatchEvent(){}};};
  const prompt=element(),core=element(),background=element();
  const document={createElement:element,body:element(),addEventListener(){},querySelectorAll:()=>[background],getElementById:()=>null};
  let ended; const track={stop(){stopped++;},getSettings:()=>({echoCancellation}),addEventListener(type,callback,options){if(type==='ended'){ended=callback;options?.signal?.addEventListener('abort',()=>{ended=null;});}}};
  const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  const durations=[],encoded=[],hints=[]; let resumes=0;
  class Context {
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createAnalyser(){let n=0;const sample=(samples,float)=>{n++;if(n===microphoneDisconnectAtFrame)queueMicrotask(()=>ended?.());const loud=n>waitingFrames&&n<=waitingFrames+speechFrames;samples.forEach((_,i)=>{samples[i]=float?(loud?(i%2?.21:-.21):0):(loud?(i%2?155:101):128);});};return {disconnect(){},getByteTimeDomainData:samples=>sample(samples,false),...(floatCapture?{getFloatTimeDomainData:samples=>sample(samples,true)}:{})};}
    async resume(){if(++resumes===resumeFailureAt)throw new Error('Capture unavailable');} async close(){} async decodeAudioData(){const length=Math.max(1,Math.round(durations.shift()*16000)),data=Float32Array.from({length},(_,index)=>index);return {length,sampleRate:16000,numberOfChannels:1,getChannelData:()=>data};}
  }
  class Recorder {
    constructor(){this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';recordings++;this.started=frames;}
    stop(){if(this.state!=='recording')return;this.state='inactive';durations.push((frames-this.started)*.08);queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['audio'])});this.onstop?.();});}
  }
  class Audio {
    async play(){audioStarts++;speaking=true;if(presentationDuringPlayback){for(let n=0;n<3;n++){instance.minimize();assert.equal(instance.active,true);assert.equal(background.inert,false);instance.expand();assert.equal(background.inert,true);}} if(leaveDuringPlayback){queueMicrotask(()=>instance.leave());return;}if(!duplex||![true,'all'].includes(echoCancellation))queueMicrotask(()=>{speaking=false;this.onended?.();});}
    pause(){if(speaking)paused++;speaking=false;}
  }
  const sandbox={document,innerWidth:390,innerHeight:844,navigator:{language:browserLanguage,mediaDevices:{getUserMedia:async()=>{microphoneRequests++;return stream;}}},AudioContext:Context,MediaRecorder:Recorder,Audio,assert,AbortController,Blob,Event,TextDecoder,atob,URL:{createObjectURL:()=> 'blob:qa',revokeObjectURL(){}},performance:{now:()=>frames*80},requestAnimationFrame:callback=>setImmediate(()=>{frames++;if(frames>1000)throw Error('capture did not settle');callback(frames*80);}),cancelAnimationFrame:clearImmediate,setTimeout,clearTimeout,addEventListener(){}};
  const factory=vm.runInNewContext(`(${createPublicVoiceSession.toString()})`,sandbox);
  const runtime={capabilities:voiceCapability===null?{}:{'voice-input':{state:voiceCapability}}};
  const deliveries=[],languages=[];
  const synthesize=async options=>{
    deliveries.push(JSON.parse(options.body).delivery); languages.push(JSON.parse(options.body).language);
    if(synthesisInterruption){
      if(synthesisInterruption==='leave') instance.leave(); else instance.interact();
      synthesisAborted=options.signal.aborted;
      if(synthesisInterruption==='reject') throw Object.assign(new Error('Cancelled'),{name:'AbortError'});
    }
    if(streamingFrames){const data=new TextEncoder().encode(streamingFrames.map(frame=>JSON.stringify(frame)).join('\n')+'\n');let offset=0;return {ok:true,headers:{get:()=> 'application/x-ndjson'},body:new ReadableStream({pull(controller){if(offset>=data.length){controller.close();return;}const end=Math.min(data.length,offset+17);controller.enqueue(data.subarray(offset,end));offset=end;}})};}return {ok:true,blob:async()=>new Blob(['speech'])};
  };
  instance=factory({core,prompt,runtime,duplex,getPreferences:()=>({tone,responseLanguage}),session:async()=>{},fetchAudio:async (path,options)=>{if(path.endsWith('synthesize'))return await synthesize(options);hints.push(options.headers['X-Nexus-Speech-Language']);return {ok:true,json:async()=>({text:`phrase ${++transcriptions}`,language:transcriptLanguages[(transcriptions-1)%transcriptLanguages.length]})};},ask:async()=>{if(transcriptions<=spokenTurns){if(spokenGenerationInterruption){busy=true;await new Promise(resolve=>{finishGeneration=resolve;});busy=false;await instance.speak(responseText);}else if(interruptGeneration){busy=true;instance.interact();busy=false;}else await instance.speak(responseText);}else instance.leave();},encodeWav:buffer=>{encoded.push({seconds:buffer.length/buffer.sampleRate,first:buffer.getChannelData(0)[0],last:buffer.getChannelData(0).at(-1)});return new Uint8Array(4);},spokenLanguage:()=> fallbackLanguage,setState:s=>{runtime.voiceState=s;},setPhase(){},isBusy:()=>busy,cancelResponse:()=>{cancelled++;finishGeneration?.();},showText(){}});
  return {instance,core,background,document,run:()=>instance.start(),stats:()=>({recordings,transcriptions,paused,stopped,speaking,cancelled,audioStarts,synthesisAborted,deliveries,languages,hints,encoded,microphoneRequests,voiceState:runtime.voiceState})};
}

for (const capability of ['unavailable', 'unknown', null]) {
  test(`voice capability ${capability} fails before requesting the microphone`, async () => {
    const h = harness(false, true, false, false, null, 'neutral', capability);
    await h.run();
    assert.equal(h.stats().microphoneRequests, 0);
    assert.equal(h.stats().recordings, 0);
    assert.equal(h.stats().transcriptions, 0);
    assert.equal(h.stats().voiceState, 'error');
    assert.equal(h.instance.active, true, 'The visible Core offers retry or return to text');
    h.instance.leave();
    assert.equal(h.instance.active, false);
  });
}

test('il tono esplicito della conversazione accompagna la sintesi vocale', async () => {
  for (const [tone, delivery] of [['neutral', 'neutral'], ['warm', 'warm'], ['direct', 'serious'], ['invalid', 'neutral']]) {
    const h=harness(false,true,false,false,null,tone); await h.run();
    assert.deepEqual(h.stats().deliveries,[delivery]);
  }
});

test('la voce italiana resta italiana anche con browser inglese e risposta solo numerica', async () => {
  const h=harness(false,true,false,false,null,'neutral','available',{browserLanguage:'en-US',transcriptLanguages:['it'],fallbackLanguage:'en',responseText:'42'});
  await h.run(); assert.deepEqual(h.stats().languages,['it']);
});

test('speech-language hints preserve the detected session language and explicit preference', async () => {
  const automatic=harness(false,true,false,false,null,'neutral','available',{transcriptLanguages:['it'],spokenTurns:2});
  await automatic.run(); assert.deepEqual(automatic.stats().hints,['auto','it','it']);
  const explicit=harness(false,true,false,false,null,'neutral','available',{responseLanguage:'en'});
  await explicit.run(); assert.deepEqual(explicit.stats().hints,['en','en']);
});

test('waiting silence is cropped with pre-roll and tail before transcription', async () => {
  const h=harness(false,true,false,false,null,'neutral','available',{waitingFrames:200});
  await h.run(); const {encoded,transcriptions}=h.stats();
  assert.equal(transcriptions,2);
  for(const clip of encoded){assert.ok(clip.seconds<2);assert.ok(clip.first>=15.5*16000);assert.ok(clip.first<16*16000);assert.ok(clip.last>16.5*16000);}
});

test('an overlong utterance fails visibly without sending a truncated command', async () => {
  const h=harness(false,true,false,false,null,'neutral','available',{speechFrames:170});
  await h.run(); assert.equal(h.stats().transcriptions,0); assert.equal(h.stats().voiceState,'error');
  assert.ok(h.stats().stopped>=1); h.instance.leave();
});

test('la lingua esplicita prevale sul riconoscimento, mentre auto segue il cambio lingua', async () => {
  const explicit=harness(false,true,false,false,null,'neutral','available',{transcriptLanguages:['it'],responseLanguage:'en'});
  await explicit.run(); assert.deepEqual(explicit.stats().languages,['en']);
  const automatic=harness(false,true,false,false,null,'neutral','available',{transcriptLanguages:['it','en'],spokenTurns:2});
  await automatic.run(); assert.deepEqual(automatic.stats().languages,['it','en']);
});

test('la lingua sconosciuta o non valida non sostituisce l ultima lingua riconosciuta', async () => {
  const h=harness(false,true,false,false,null,'neutral','available',{browserLanguage:'en-US',transcriptLanguages:['it','und','../../en'],spokenTurns:3,fallbackLanguage:'en'});
  await h.run(); assert.deepEqual(h.stats().languages,['it','it','it']);
});

test('duplex captures a complete interruption during playback and releases the microphone',async()=>{
  const h=harness(true);await h.run();const s=h.stats();
  assert.equal(s.transcriptions,2);assert.equal(s.recordings,2);assert.equal(s.paused,1);assert.equal(s.speaking,false);assert.ok(s.stopped>=1);assert.equal(h.instance.active,false);
});
test('una frase pronunciata durante la generazione annulla il modello e conserva il nuovo turno', async () => {
  const h=harness(true,true,false,false,null,'neutral','available',{spokenGenerationInterruption:true});
  await h.run(); const stats=h.stats();
  assert.equal(stats.cancelled,1); assert.equal(stats.transcriptions,2);
  assert.equal(stats.audioStarts,0); assert.ok(stats.stopped>=1);
});

test('Core cancels generation even while the duplex recorder is waiting', async () => {
  const h=harness(true,true,false,true);await h.run();
  assert.equal(h.stats().cancelled,1);assert.equal(h.stats().transcriptions,2);
  assert.equal(h.stats().audioStarts,0);assert.equal(h.instance.active,false);
});

const audioFrame=index=>({type:'audio',index,mimeType:'audio/wav',audio:Buffer.from(`voice-${index}`).toString('base64')});
test('progressive speech plays all segments once across fragmented stream frames',async()=>{
  const h=harness(false,true,false,false,null,'neutral','available',{streamingFrames:[audioFrame(0),audioFrame(1),{type:'done',segments:2}]});
  await h.run();assert.equal(h.stats().audioStarts,2);assert.equal(h.stats().transcriptions,2);assert.equal(h.instance.active,false);
});
test('spoken interruption clears prefetched speech segments and retains the next turn',async()=>{
  const h=harness(true,true,false,false,null,'neutral','available',{streamingFrames:[audioFrame(0),audioFrame(1),{type:'done',segments:2}]});
  await h.run();assert.equal(h.stats().audioStarts,1);assert.equal(h.stats().paused,1);assert.equal(h.stats().transcriptions,2);
});
for(const [name,frames] of [['missing end',[audioFrame(0)]],['wrong order',[audioFrame(1)]],['server failure',[{type:'error',code:'VOICE_SYNTHESIS_FAILED'}]]]){
  test(`invalid speech stream ${name} fails without starting a new turn`,async()=>{
    const h=harness(false,true,false,false,null,'neutral','available',{streamingFrames:frames});await h.run();
    assert.equal(h.stats().voiceState,'error');assert.equal(h.stats().transcriptions,1);assert.ok(h.stats().stopped>=1);h.instance.leave();
  });
}
test('a failed concurrent recorder cancels synthesis instead of advertising an unusable duplex',async()=>{
  const h=harness(true,true,false,false,null,'neutral','available',{resumeFailureAt:2});await h.run();
  assert.equal(h.stats().voiceState,'error');assert.equal(h.stats().transcriptions,1);assert.equal(h.stats().speaking,false);assert.equal(h.stats().paused,1);h.instance.leave();
});
test('overlong answers stay in text without being silently shortened for synthesis',async()=>{
  const h=harness(false,true,false,false,null,'neutral','available',{responseText:'x'.repeat(4001)});await h.run();
  assert.equal(h.stats().voiceState,'error');assert.equal(h.stats().audioStarts,0);assert.equal(h.stats().deliveries.length,0);h.instance.leave();
});

test('missing echo cancellation retains sequential capture without advertising duplex',async()=>{
  const h=harness(true,false);await h.run();assert.equal(h.stats().paused,0);assert.equal(h.stats().transcriptions,2);
});

test('explicit all echo cancellation supports local playback interruption',async()=>{
  const h=harness(true,'all');await h.run();assert.equal(h.stats().paused,1);assert.equal(h.stats().transcriptions,2);
});

test('WebRTC-only echo cancellation does not advertise interruption of local playback',async()=>{
  const h=harness(true,'remote-only');await h.run();assert.equal(h.stats().paused,0);assert.equal(h.stats().transcriptions,2);
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

 test('compact and full presentations preserve microphone, playback and the next turn', async () => {
  const h=harness(true,true,false,false,null,'neutral','available',{presentationDuringPlayback:true});await h.run();
  const stats=h.stats();assert.equal(stats.microphoneRequests,1);assert.equal(stats.audioStarts,1);
  assert.equal(stats.cancelled,0);assert.equal(stats.transcriptions,2);assert.equal(stats.paused,1);
  assert.equal(h.background.inert,false);assert.equal(h.instance.active,false);
 });
 test('downward Core swipe minimizes, ignores the following click and restores original inert state', async () => {
  const h=harness(false,true,false,false,null,'neutral','unavailable');await h.run();
  assert.equal(h.background.inert,true);
  h.core.emit('pointerdown',{pointerType:'touch',pointerId:1,clientX:20,clientY:20});
  h.core.emit('pointermove',{pointerId:1,clientX:24,clientY:100});
  h.core.emit('pointerup',{pointerId:1});
  assert.equal(h.instance.minimized,true);assert.equal(h.background.inert,false);
  h.instance.interact();assert.equal(h.instance.minimized,true,'synthesized click must not expand');
  h.instance.expand();assert.equal(h.background.inert,true);h.instance.leave();assert.equal(h.background.inert,false);
 });
 test('horizontal, mouse and cancelled drags do not minimize the voice view', async () => {
  const h=harness(false,true,false,false,null,'neutral','unavailable');await h.run();
  for(const [pointerType,x,y,cancel] of [['touch',200,95,false],['mouse',25,120,false],['touch',25,120,true]]){
   h.core.emit('pointerdown',{pointerType,pointerId:2,clientX:20,clientY:20});
   h.core.emit('pointermove',{pointerId:2,clientX:x,clientY:y});
   if(cancel)h.core.emit('pointercancel',{});h.core.emit('pointerup',{pointerId:2});assert.equal(h.instance.minimized,false);
  }h.instance.leave();
 });

 test('drag geometry follows the finger before release and reversal preserves the voice session', async () => {
  const h=harness(false,true,false,false,null,'neutral','unavailable');
  await h.instance.start();
  h.core.emit('pointerdown',{pointerType:'touch',pointerId:3,clientX:160,clientY:200});
  h.core.emit('pointermove',{pointerId:3,clientX:160,clientY:240});
  await new Promise(setImmediate);
  assert.equal(h.document.body.classList.contains('voice-dragging'),true);
  assert.equal(h.document.body.style.getPropertyValue('--nxs-drag-top'),'240px');
  assert.ok(parseFloat(h.document.body.style.getPropertyValue('--nxs-drag-size'))<240);
  assert.equal(h.instance.minimized,false);
  h.core.emit('pointermove',{pointerId:3,clientX:160,clientY:210});
  h.core.emit('pointerup',{pointerId:3});
  assert.equal(h.instance.active,true); assert.equal(h.instance.minimized,false);
  assert.equal(h.document.body.classList.contains('voice-dragging'),false);
  h.instance.leave();
 });

 test('microphone disconnection discards partial capture and leaves an explicit recoverable error', async()=>{
  const h=harness(false,true,false,false,null,'neutral','available',{microphoneDisconnectAtFrame:4});await h.run();
  assert.equal(h.stats().transcriptions,0);assert.equal(h.stats().audioStarts,0);assert.equal(h.stats().voiceState,'error');assert.ok(h.stats().stopped>0);h.instance.leave();
 });
 test('floating point capture keeps the same cancellation and complete-turn contract',async()=>{
  const h=harness(true,true,false,false,null,'neutral','available',{floatCapture:true});await h.run();
  assert.equal(h.stats().transcriptions,2);assert.equal(h.stats().audioStarts,1);assert.equal(h.stats().microphoneRequests,1);
 });
