const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {createDesktopRecipes}=require('../src/shared/desktop-recipes');
const root=path.resolve(__dirname,'..');
function fixture(extra={}){
  let id=0,time=0;const frames=new Map(),listeners=new Set();
  const events={addEventListener(_,fn){listeners.add(fn);},removeEventListener(_,fn){listeners.delete(fn);}};
  const ctx={setTransform(){},clearRect(){},fillRect(...values){assert.ok(values.every(Number.isFinite));}};
  const canvas={...events,dataset:{},getContext:kind=>kind==='2d'?ctx:null,getBoundingClientRect:()=>({left:0,top:0,width:390,height:844})};
  const media={...events,matches:false};const document={...events,hidden:false};
  const sandbox={...events,module:{exports:{}},navigator:{deviceMemory:2},document,devicePixelRatio:1,matchMedia:()=>media,performance:{now:()=>time},requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(i){frames.delete(i);},IntersectionObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'src/shared/cosmic-visualizers.js'),'utf8'),sandbox);
  const renderer=sandbox.module.exports.createCosmicVisualizers(canvas,{random:()=>.1,...extra},createDesktopRecipes);
  return {renderer,canvas,media,document,frames,listeners,tick(n=1,interval=1000/60){for(let i=0;i<n;i++){time+=interval;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time));}}};
}
test('generated GPU recipes and Android asset exactly match current desktop source',()=>{
  execFileSync(process.execPath,['scripts/generate-cosmic-visualizers.js','--check'],{cwd:root,stdio:'pipe'});
  const r=createDesktopRecipes();
  for(const data of [r.neural.build(1200),r.reactor(1200,'rings'),r.saturn.planet(1200),r.saturn.orbit(1200)]){
    assert.equal(data.positions.length,3600);assert.ok([...data.positions].every(Number.isFinite));
  }
});
test('random cycles visit all three presets with continuous assembly and no adjacent repeats',()=>{
  const f=fixture();const seen=[];let previous='';
  for(let i=0;i<6400;i++){
    f.tick();const m=f.renderer.getMetrics();assert.ok(m.arrival>=0&&m.arrival<=1);
    if(m.preset!==previous){if(previous)assert.equal(m.arrival,0,'Switch only after dispersion');seen.push(m.preset);previous=m.preset;}
  }
  assert.ok(seen.length>=3);assert.equal(new Set(seen.slice(0,3)).size,3);
  f.renderer.dispose();assert.equal(f.frames.size,0);assert.equal(f.listeners.size,0);
});
test('reduced motion settles immediately, ignores stale voice and resumes safely',()=>{
  let state='idle';const f=fixture({getState:()=>state,getEnergy:()=>1});f.media.matches=true;f.tick();
  const first=f.renderer.getMetrics();f.tick(500);assert.equal(f.renderer.getMetrics().draws,first.draws);assert.equal(first.arrival,1);assert.equal(first.audio,0);
  state='speaking';f.tick();assert.equal(f.renderer.getMetrics().state,'speaking');
  f.media.matches=false;f.renderer.refresh();f.tick(120);assert.ok(f.renderer.getMetrics().audio>.9);
  state='idle';f.tick(120);assert.ok(f.renderer.getMetrics().audio<.001);f.renderer.dispose();
});
test('hidden pages freeze both transition clock and drawing',()=>{
  const f=fixture();f.tick(20);const before=f.renderer.getMetrics();f.document.hidden=true;f.tick(400);
  assert.equal(f.renderer.getMetrics().draws,before.draws);assert.equal(f.renderer.getMetrics().arrival,before.arrival);
  f.document.hidden=false;f.renderer.refresh();f.tick();assert.ok(f.renderer.getMetrics().draws>before.draws);f.renderer.dispose();
});

test('returning from the composer gathers the Core again without an instant pop',()=>{
  let shown=true;const f=fixture({getVisible:()=>shown});f.tick(250);
  assert.equal(f.renderer.getMetrics().arrival,1);
  shown=false;f.tick(10);shown=true;f.tick();
  assert.equal(f.renderer.getMetrics().arrival,0);
  f.tick(120);assert.ok(f.renderer.getMetrics().arrival>0&&f.renderer.getMetrics().arrival<1);
  f.tick(120);assert.equal(f.renderer.getMetrics().arrival,1);f.renderer.dispose();
});

test('web writing releases the same matter to the background and holds it there',()=>{
  let shown=true;const f=fixture({getVisible:()=>shown,disperseOnHide:true,gatherBackground:true});f.tick(250);
  shown=false;f.tick(30);const partial=f.renderer.getMetrics().arrival;
  assert.ok(partial>0&&partial<1);f.tick(120);assert.equal(f.renderer.getMetrics().arrival,0);
  f.tick(200);assert.equal(f.renderer.getMetrics().arrival,0);assert.equal(f.renderer.getMetrics().phase,'background');
  shown=true;f.tick(250);assert.equal(f.renderer.getMetrics().arrival,1);f.renderer.dispose();
});
test('Android visual scene has no network, file, content or JavaScript bridge access',()=>{
  const native=fs.readFileSync(path.join(root,'android/NexusRemote/app/src/main/java/local/nexus/remote/CosmicVisualizers.kt'),'utf8');
  for(const token of ['allowFileAccess = false','allowContentAccess = false','blockNetworkLoads = true','domStorageEnabled = false','MIXED_CONTENT_NEVER_ALLOW'])assert.ok(native.includes(token));
  assert.doesNotMatch(native,/addJavascriptInterface|loadUrl\s*\(/);
  assert.match(native,/JSONObject\(\)/);assert.match(native,/web\?\.destroy\(\)/);
});


test('slow devices retain the complete particle field while adapting raster resolution',()=>{
  const f=fixture({planetOnly:true});
  const count=f.renderer.getMetrics().particles;
  f.tick(240,50);
  assert.equal(f.renderer.getMetrics().particles,count);
  assert.ok(f.renderer.getMetrics().resolutionScale>=.75);
  assert.ok(f.renderer.getMetrics().resolutionScale<1);
  f.renderer.dispose();
});
