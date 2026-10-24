const test = require('node:test');
const assert = require('node:assert/strict');
const { speechChunks, joinSpeechWaves, synthesizeSpeechSegments } = require('../src/voice/speech-segments');
const { NeuralSpeechService } = require('../src/voice/neural-speech');
const { ExpressiveSpeechService } = require('../src/voice/expressive-speech');

function wave(values, rate=24000) {
  const data=Buffer.alloc(44+values.length*2);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);
  data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);
  data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(values.length*2,40);
  values.forEach((value,index)=>data.writeInt16LE(value,44+index*2));return data;
}
test('segments preserve complete bounded text including unspaced Unicode',()=>{
  for(const text of ['Una frase completa. '.repeat(150),'星🌌'.repeat(950),'x'.repeat(4000)]) {
    const chunks=speechChunks(text);assert.ok(chunks[0].length<=180);assert.ok(chunks.every(chunk=>chunk.length<=520));
    assert.equal(chunks.join('').replace(/\s/g,''),text.replace(/\s/g,''));
    assert.ok(chunks.every(chunk=>!/[\uD800-\uDBFF]$/.test(chunk)));
  }
  assert.throws(()=>speechChunks('x'.repeat(4001)));assert.throws(()=>speechChunks(' '));
});
test('legacy PCM assembly preserves all samples and rejects incompatible or malformed audio',()=>{
  const result=joinSpeechWaves([{audio:wave([1,2])},{audio:wave([3,4])}]);
  assert.equal(result.audio.readUInt32LE(4),result.audio.length-8);assert.equal(result.audio.readUInt32LE(40),8);
  assert.deepEqual([...result.audio.subarray(44)],[1,0,2,0,3,0,4,0]);
  assert.throws(()=>joinSpeechWaves([{audio:wave([1])},{audio:wave([2],16000)}]));
  const broken=wave([1]);broken.writeUInt32LE(999,40);assert.throws(()=>joinSpeechWaves([{audio:broken}]));
  assert.throws(()=>joinSpeechWaves([{audio:Buffer.from('not-wave')}]));
});
test('complete synthesis emits each segment once and can cancel between segments',async()=>{
  const text='Testo intero, senza perdere parole. '.repeat(30),seen=[],emitted=[];
  const result=await synthesizeSpeechSegments({text,synthesize:async text=>{seen.push(text);return {audio:wave([seen.length]),mimeType:'audio/wav'};},onChunk:async(result,index)=>emitted.push([index,result.audio.readInt16LE(44)])});
  assert.equal(result.segments,seen.length);assert.ok(seen.length>1);assert.deepEqual(emitted,seen.map((_,index)=>[index,index+1]));
  assert.equal(seen.join('').replace(/\s/g,''),text.replace(/\s/g,''));
  let cancelled=false,calls=0;
  await assert.rejects(synthesizeSpeechSegments({text,cancelled:()=>cancelled,synthesize:async()=>{calls++;return {audio:wave([1])};},onChunk:async()=>{cancelled=true;}}),{code:'VOICE_CANCELLED'});
  assert.equal(calls,1);
});
test('engines reject oversized direct segments instead of silently shortening speech',async()=>{
  for(const service of [new NeuralSpeechService(),new ExpressiveSpeechService()]) {
    await assert.rejects(service.synthesize({text:'x'.repeat(521)}),/troppo lungo/);
    service.shutdown();
  }
});
