/** @module scripts/verify-public-voice-stream Real browser media with synthetic input, isolated from user audio and inference. */
// #region Disposable deterministic media and server
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createPublicVoiceSession } = require('../src/remote/public-voice-session');
const { browserExecutable, Cdp, freePort, waitForTarget, removeTemporaryPath } = require('./web-visual-regression');

function wave(seconds, microphone = false) {
  const rate=16000,length=Math.round(seconds*rate),bytes=Buffer.alloc(44+length*2);
  bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);
  bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);
  bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(length*2,40);
  if(microphone)for(let index=0;index<length;index++){
    const time=index/rate,active=(time>.4&&time<1.1)||(time>3&&time<3.8);
    bytes.writeInt16LE(active?Math.round(Math.sin(time*2*Math.PI*440)*12000):0,44+index*2);
  }
  return bytes;
}
async function main(){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-voice-stream-')),output=path.resolve(__dirname,'../qa-artifacts');
  const microphone=path.join(profile,'synthetic-microphone.wav');fs.writeFileSync(microphone,wave(8,true));
  let client,child,transcriptions=0,synthesis=0;
  const html=`<!doctype html><html><body><button id="core">Voice test</button><textarea id="prompt"></textarea><p id="phase"></p><pre id="result"></pre><script>
    const stats={asked:0,plays:0,pauses:0,states:[],error:''},runtime={capabilities:{'voice-input':{state:'available'}}};
    const NativeAudio=Audio;window.Audio=function(url){const audio=new NativeAudio(url),play=audio.play.bind(audio),pause=audio.pause.bind(audio);audio.play=()=>{stats.plays++;return play()};audio.pause=()=>{if(!audio.paused)stats.pauses++;pause()};return audio};
    const session=(${createPublicVoiceSession.toString()})({core:document.querySelector('#core'),prompt:document.querySelector('#prompt'),runtime,duplex:true,
      session:async()=>{},fetchAudio:fetch,encodeWav:()=>new Blob(['synthetic transcript input']),spokenLanguage:()=> 'it',
      ask:async()=>{stats.asked++;if(stats.asked===1)await session.speak('Risposta sintetica di prova');else session.leave()},
      setState:value=>stats.states.push(value),setPhase:()=>{},isBusy:()=>false,showText:()=>{stats.mode=runtime.voiceMode;document.querySelector('#result').textContent=JSON.stringify(stats)}});
    document.querySelector('#core').onclick=()=>session.start().then(()=>{if(session.active){stats.error=document.querySelector('.voice-session-controls p').textContent;document.querySelector('#result').textContent=JSON.stringify(stats)}});
  </script></body></html>`;
  const server=http.createServer(async(request,response)=>{
    if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end(html);return;}
    if(request.url==='/api/guest/voice/transcribe'){
      for await(const unused of request){void unused;}transcriptions++;
      response.setHeader('Content-Type','application/json');response.end(JSON.stringify({text:'Frase sintetica',language:'it',confidence:null}));return;
    }
    if(request.url==='/api/guest/voice/synthesize'){
      for await(const unused of request){void unused;}synthesis++;
      response.setHeader('Content-Type','application/x-ndjson');
      const frame=index=>JSON.stringify({type:'audio',index,mimeType:'audio/wav',audio:wave(5).toString('base64')})+'\n';
      response.write(frame(0));await new Promise(resolve=>setTimeout(resolve,100));
      if(!response.destroyed){response.end(frame(1)+JSON.stringify({type:'done',segments:2})+'\n');}return;
    }
    response.writeHead(404);response.end();
  });
  // #endregion
  // #region Real recorder, decoder, stream playback and cancellation
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`,debugPort=await freePort();
    child=spawn(browserExecutable(),['--headless=new',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,
      '--no-first-run','--disable-background-networking','--mute-audio','--autoplay-policy=no-user-gesture-required',
      '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${microphone}`,url],{stdio:'ignore',windowsHide:true});
    client=await new Cdp((await waitForTarget(debugPort,url)).webSocketDebuggerUrl).open();
    const readyDeadline=Date.now()+10000;
    while(Date.now()<readyDeadline&&!await client.evaluate("Boolean(document.querySelector('#core')?.onclick)"))await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(await client.evaluate("Boolean(document.querySelector('#core')?.onclick)"),true,'Voice fixture script must initialize');
    await client.evaluate("document.querySelector('#core').click();true");
    let report;const deadline=Date.now()+20000;
    while(Date.now()<deadline){const text=await client.evaluate("document.querySelector('#result').textContent");if(text){report=JSON.parse(text);break;}await new Promise(resolve=>setTimeout(resolve,100));}
    assert.ok(report,'Synthetic browser voice test did not settle');assert.equal(report.error,'',JSON.stringify(report));
    assert.equal(report.asked,2);assert.equal(report.plays,1);assert.equal(report.pauses,1);assert.equal(report.mode,'off');
    assert.equal(transcriptions,2);assert.equal(synthesis,1);assert.ok(report.states.includes('speaking'));
    fs.writeFileSync(path.join(output,'public-voice-stream-report.json'),JSON.stringify({passed:true,syntheticOnly:true,humanEchoVerified:false,...report},null,2));
    console.log('PASS real Chromium recorder/decoder, fragmented audio stream, spoken interruption, queued audio cancellation and next turn; synthetic input, no physical microphone or inference.');
  }finally{
    try{await client?.command('Browser.close');}catch{}client?.close();if(child&&child.exitCode===null)child.kill();
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await removeTemporaryPath(profile);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
// #endregion
