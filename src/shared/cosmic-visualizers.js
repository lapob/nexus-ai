/** @module shared/cosmic-visualizers
 * Shared GPU stage for public web and Android. Desktop shaders and geometry are
 * generated verbatim by generate-cosmic-visualizers.js; desktop stays untouched.
 */
function createCosmicVisualizers(canvas, options = {}, createRecipes) {
  // #region Desktop fields and GPU resources
  const recipes = createRecipes();
  const host = options.host || canvas;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const random = options.random || Math.random;
  const planetOnly = options.planetOnly === true;
  const names = planetOnly ? ['saturn-experimental'] : ['neural', 'jarvis-reactor', 'saturn-experimental'];
  let deck = [], preset = '', previousPreset = '', age = 0, elapsed = 0, phase = 'assembling';
  let arrival = 0, hold = 24, last = 0, raf = 0, disposed = false, lost = false, visible = true;
  let draws = 0, drawMs = 0, quality = 1, strain = 0, healthy = 0, state = 'idle', audio = 0;
  let resolutionScale = 1, releaseAge = 0, releaseArrival = 0, releaseStage = null;
  let width = 1, height = 1, dpr = 1, rect = {left:0,top:0,width:1,height:1};
  let pointer = [0,0], pointerStrength = 0, touching = false, dragging = false, dragStart = [0,0], rotation = [0,0], targetRotation = [0,0];
  let suppressClick = 0, paintedReduced = false, ringVisibility = 0, wasCoreVisible = true;
  const efficient = options.efficient || navigator.connection?.saveData || Number(navigator.deviceMemory || 4) <= 3;
  const budget = efficient ? 16000 : 42000;
  const ambient = options.ambient ? document.createElement('canvas') : null;
  if(ambient){ambient.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none';canvas.before(ambient);}
  const ambientPaint=ambient?.getContext('2d');
  const reduced = () => media.matches || options.getReduced?.() === true;
  const pick = () => {
    if (!deck.length) {
      deck = [...names];
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
      if (deck[deck.length - 1] === preset) [deck[0],deck[deck.length - 1]]=[deck[deck.length - 1],deck[0]];
    }
    previousPreset = preset; preset = deck.pop(); hold = 24 + random() * 12;
  };
  pick();
  const smooth = v => { v=Math.max(0,Math.min(1,v));return v*v*(3-2*v); };
  const fields = {
    neural:[{...recipes.neural.build(budget),kind:0}],
    'jarvis-reactor':['rings','core','scanner','aura'].map((layer,i)=>({...recipes.reactor(Math.floor(budget*[.55,.22,.08,.15][i]),layer),kind:i})),
    'saturn-experimental':(planetOnly ? [['planet',1]] : [['planet',.36],['orbit',.48],['halo',.16]]).map(([layer,share],i)=>({...recipes.saturn[layer](Math.floor(budget*share)),kind:i}))
  };
  const basicVertex = `precision highp float;uniform float uTime;uniform float uEnergy;uniform float uKind;uniform vec3 uAccent;varying float vAlpha;void main(){vec3 p=position;float angle=uTime*(uKind<.5?.07:uKind<1.5?-.12:-.09);float c=cos(angle),s=sin(angle);p.xy=mat2(c,-s,s,c)*p.xy;p*=1.+sin(uTime*1.1)*.025+uEnergy*.025;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=1.25;vAlpha=uKind>2.5?.12:uKind>.5&&uKind<1.5?.6:.42;}`;
  const basicFragment = `precision highp float;uniform vec3 uAccent;varying float vAlpha;void main(){float a=smoothstep(.5,.13,length(gl_PointCoord-.5));gl_FragColor=vec4(uAccent,a*vAlpha);}`;
  const prefix = `precision highp float;attribute vec3 position;attribute vec4 aJourney;uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;uniform vec4 uStage;uniform vec2 uViewport;uniform float uElapsed;uniform float uArrival;uniform float uDpr;uniform float uTaper;varying float vJourney;varying float vEdge;varying float vCarrier;varying float vSourceAlpha;`;
  function vertex(source) {
    const index=source.lastIndexOf('}');
    return prefix + source.slice(0,index) + `
      vec2 target=gl_Position.xy/gl_Position.w*uStage.xy+uStage.zw;
      float shapeEdge=mix(1.,1.-smoothstep(.82,1.,abs(gl_Position.x/gl_Position.w)),uTaper);
      // The field can fill the screen horizontally while matter fades before
      // reaching the title and controls reserved above/below the host.
      float readingEdge=1.-smoothstep(.78,1.,abs(target.y-uStage.w)/max(.001,uStage.y/1.25));
      shapeEdge*=readingEdge;
      float journeyProgress=clamp((uArrival-aJourney.z*.16)/(1.-aJourney.z*.16),0.,1.);
      float settle=journeyProgress*journeyProgress*(3.-2.*journeyProgress);
      vec2 origin=vec2(aJourney.x*2.-1.,1.-aJourney.y*2.);
      vCarrier=step(.5,aJourney.w);
      float starIndex=max(0.,aJourney.w-1.);
      float starPhase=starIndex*2.399963;
      origin+=vec2(sin(uElapsed*.07+starPhase)*10./uViewport.x,-cos(uElapsed*.06+starPhase)*8./uViewport.y)*vCarrier;
      float sourceSide=min(1.,abs((aJourney.x-.5)*uViewport.x)/min(460.,uViewport.x*.48));
      vSourceAlpha=.04+.5*sourceSide*sourceSide;
      vec2 curl=vec2(sin(aJourney.z*19.),cos(aJourney.z*23.))*sin(journeyProgress*3.14159)*.12;
      gl_Position=vec4(mix(origin,target,settle)+curl,0.,1.);
      gl_PointSize=mix(max(.8,gl_PointSize),1.1+mod(starIndex,7.)*.26,vCarrier*(1.-settle))*uDpr;
      vJourney=settle;
      vEdge=smoothstep(0.,.08,1.-abs(gl_Position.x))*smoothstep(0.,.08,1.-abs(gl_Position.y))*mix(1.,shapeEdge,settle);
    }`;
  }
  function fragment(source) {
    const index=source.lastIndexOf('}');
    // Sparse distant grains become the dense desktop matter, without a flashed layer.
    return 'precision highp float;varying float vJourney;varying float vEdge;varying float vCarrier;varying float vSourceAlpha;'+source.slice(0,index)+`float sourceMask=smoothstep(.5,.35,length(gl_PointCoord-.5));gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(166.,224.,234.)/255.,vCarrier*(1.-vJourney));gl_FragColor.a=mix(gl_FragColor.a*mix(.06,1.,vJourney),mix(vSourceAlpha*sourceMask,gl_FragColor.a,vJourney),vCarrier)*vEdge;}`;
  }
  let gl = canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,premultipliedAlpha:true,powerPreference:'low-power'});
  let context2d = null, programs = {}, buffers = [], fallbackReason = '';
  function shader(type,source) {
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(message);}
    return s;
  }
  function program(v,f) {
    const vs=shader(gl.VERTEX_SHADER,vertex(v)),fs=shader(gl.FRAGMENT_SHADER,fragment(f));
    const p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
    return {p,uniforms:new Map(),attributes:new Map()};
  }
  function upload() {
    programs={neural:program(recipes.neural.vertexShader,recipes.neural.fragmentShader),'jarvis-reactor':program(basicVertex,basicFragment),'saturn-experimental':program(recipes.saturn.vertexShader,recipes.saturn.fragmentShader)};
    for(const list of Object.values(fields)){let offset=0;for(const field of list){
      field.gpu={};const count=field.positions.length/3;
      const journey=new Float32Array(count*4);
      for(let i=0;i<count;i++){const grain=i+offset,carrier=grain<(efficient?140:360)&&(options.gatherBackground||grain%4===0),source=carrier?grain+901:grain+1;journey[i*4]=(source*.61803398875)%1;journey[i*4+1]=(source*.41421356237)%1;journey[i*4+2]=((grain+1)*.754877666)%1;journey[i*4+3]=carrier?grain+1:0;}
      offset+=count;
      for(const [name,data] of Object.entries({position:field.positions,aSeed:field.seeds,aImportance:field.importance,aJourney:journey})){
        if(!data)continue;const buffer=gl.createBuffer();buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);field.gpu[name]={buffer,size:data.length/count};
      }
    }}
    gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);
  }
  if(gl){try{upload();}catch(error){fallbackReason=String(error.message);lost=true;}}
  else context2d=canvas.getContext('2d',{alpha:true});
  // A GPU compilation failure can only obtain 2D on a fresh canvas.
  if(lost){for(const b of buffers)gl.deleteBuffer(b);for(const p of Object.values(programs))gl.deleteProgram(p.p);const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;gl=null;lost=false;context2d=canvas.getContext('2d');}
  const profile={...recipes.profiles.idle};
  function resize(){const bounds=canvas.getBoundingClientRect();width=Math.max(1,bounds.width);height=Math.max(1,bounds.height);dpr=Math.min(devicePixelRatio||1,planetOnly?3:efficient?1.5:2.5,Math.sqrt(8294400/(width*height)))*resolutionScale;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);if(gl)gl.viewport(0,0,canvas.width,canvas.height);paintedReduced=false;}
  function uniform(p,name,value){if(!p.uniforms.has(name))p.uniforms.set(name,gl.getUniformLocation(p.p,name));const loc=p.uniforms.get(name);if(loc===null)return;if(Array.isArray(value)||value instanceof Float32Array){if(value.length===16)gl.uniformMatrix4fv(loc,false,value);else gl['uniform'+value.length+'fv'](loc,value);}else gl.uniform1f(loc,value);}
  function matrix(rx,ry,rz,scale=1){const x=Math.cos(rx),a=Math.sin(rx),y=Math.cos(ry),b=Math.sin(ry),z=Math.cos(rz),c=Math.sin(rz);return new Float32Array([y*z*scale,(a*b*z+x*c)*scale,(-x*b*z+a*c)*scale,0,-y*c*scale,(-a*b*c+x*z)*scale,(x*b*c+a*z)*scale,0,b*scale,-a*y*scale,x*y*scale,0,0,0,-8,1]);}
  const projection=new Float32Array([1/6.6,0,0,0,0,1/6.6,0,0,0,0,-.01,0,0,0,0,1]);
  const colors={idle:[.33,.73,.75],listening:[.34,.87,.7],thinking:[.49,.74,1],responding:[.7,.94,1],speaking:[.47,.97,1],error:[.84,.6,.35],offline:[.33,.41,.42],permission:[1,.75,.41],executing:[.94,.83,.44]};
  // #endregion
  // #region Shared clock, transitions and lifecycle
  function draw(now){
    raf=0;if(disposed||lost||!visible||document.hidden||options.getPaused?.())return;
    const next=options.getState?.()||state;const normalized=next==='ready'?'idle':next==='transcribing'?'thinking':next;
    if(state!==normalized){state=Object.hasOwn(recipes.profiles,normalized)?normalized:'idle';paintedReduced=false;}
    const isReduced=reduced();if(isReduced&&paintedReduced){raf=requestAnimationFrame(draw);return;}
    const input=options.getInspection?.();if(input){touching=input[2]>0;dragging=touching;pointer=[input[0]*6.6,-input[1]*6.6];targetRotation=[input[1]*.5,input[0]*.5];}
    const start=performance.now(),dt=last?Math.min(.06,(now-last)/1000):1/60;last=now;
    if(!isReduced){elapsed+=dt;age+=dt;}
    else {arrival=1;phase='holding';age=0;}
    if(!isReduced){
      if(phase==='assembling'){arrival=smooth(age/3.8);if(age>=3.8){phase='holding';age=0;arrival=1;}}
      else if(phase==='holding'&&!planetOnly&&age>=hold&&!touching&&['idle','offline','booting'].includes(state)){phase='dispersing';age=0;}
      else if(phase==='dispersing'){arrival=1-smooth(age/3.2);if(age>=3.2){pick();phase='assembling';age=0;arrival=0;}}
    }
    const target=recipes.profiles[state]||recipes.profiles.idle;
    for(const key of Object.keys(profile))profile[key]=key==='mode'?target[key]:profile[key]+(target[key]-profile[key])*(1-Math.exp(-dt*5.2));
    const e=Number(options.getEnergy?.()||0);audio+=((['listening','speaking'].includes(state)&&Number.isFinite(e)?Math.max(0,Math.min(1,e)):0)-audio)*(1-Math.exp(-dt*12));
    pointerStrength+=((touching&&!isReduced?.55:0)-pointerStrength)*(1-Math.exp(-dt*(touching?7:.8)));
    for(let a=0;a<2;a++)rotation[a]+=((dragging&&!isReduced?targetRotation[a]:0)-rotation[a])*(1-Math.exp(-dt*(dragging?8:1.1)));
    rect=host.getBoundingClientRect();const side=Math.min(rect.width,rect.height)*1.25;
    const stage=[side/width,side/height,(rect.left+rect.width/2)/width*2-1,1-(rect.top+rect.height/2)/height*2];
    const requestedVisible=options.getVisible?.()!==false;
    const coreVisible=requestedVisible||options.disperseOnHide===true;
    if(options.disperseOnHide&&!requestedVisible){if(wasCoreVisible){releaseAge=0;releaseArrival=arrival;}releaseAge+=dt;arrival=isReduced?0:releaseArrival*(1-smooth(releaseAge/1.4));phase="background";if(releaseStage)stage.splice(0,4,...releaseStage);}else if(requestedVisible){if(options.disperseOnHide&&releaseStage&&side<1)stage.splice(0,4,...releaseStage);else releaseStage=[...stage];}
    if(requestedVisible&&!wasCoreVisible&&!isReduced){age=0;arrival=0;phase='assembling';}
    wasCoreVisible=requestedVisible;
    if(!coreVisible){stage[0]=0;stage[1]=0;stage[2]=4;stage[3]=4;}
    const accent=colors[state]||colors.idle,t=isReduced?0:elapsed*.55;
    // The dormant planet has a much smaller footprint than its deployed rings.
    // Ease its framing with the same ring clock, keeping active rings inside the stage.
    const ringTarget=planetOnly ? 0 : {listening:.86,speaking:.58+audio*.42,thinking:.56,responding:.72,executing:.82,permission:.48,error:.58}[state]||0;
    ringVisibility=isReduced?ringTarget:ringVisibility+(ringTarget-ringVisibility)*(1-Math.exp(-dt*1.65));
    const saturnFraming=planetOnly?4:2.85-smooth(ringVisibility/.56)*1.65;
    const expansiveScale=preset==='neural'?Math.max(1.18,Math.min(1.8,width*.94/Math.max(1,side))):1.18;
    const fieldScale=kind=>expansiveScale*(preset==='saturn-experimental'?saturnFraming*(kind===0?.94:1):preset==='jarvis-reactor'?1.48:1);
    // Adaptive detail does not change point positions or restart the shared clock.
    strain=dt>.028||drawMs>8?strain+dt:Math.max(0,strain-dt);healthy=dt<.021&&drawMs<5?healthy+dt:0;
    if(strain>1.5){quality=Math.max(.35,quality-.15);if(quality<=.35&&resolutionScale>(planetOnly?.75:.5)){resolutionScale=Math.max(planetOnly?.75:.5,resolutionScale-.1);resize();}strain=0;}if(healthy>10){quality=Math.min(1,quality+.05);if(quality===1&&resolutionScale<1){resolutionScale=Math.min(1,resolutionScale+.05);resize();}healthy=0;}
    if(ambientPaint){
      if(ambient.width!==canvas.width||ambient.height!==canvas.height){ambient.width=canvas.width;ambient.height=canvas.height;}
      ambientPaint.setTransform(dpr,0,0,dpr,0,0);ambientPaint.clearRect(0,0,width,height);
      for(let i=0;i<(efficient?140:360);i++){if(coreVisible&&gl&&(options.gatherBackground||i%4===0))continue;const clock=isReduced?0:elapsed,starPhase=i*2.399963,x=((i+901)*.61803398875%1)*width+Math.sin(clock*.07+starPhase)*5,y=((i+901)*.41421356237%1)*height+Math.cos(clock*.06+starPhase)*4;const edge=Math.min(1,Math.abs(x-width/2)/Math.min(460,width*.48));ambientPaint.fillStyle=`rgba(166,224,234,${.04+edge*edge*.5})`;ambientPaint.beginPath();ambientPaint.arc(x,y,.55+(i%7)*.13,0,Math.PI*2);ambientPaint.fill();}
    }
    if(gl){
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);const p=programs[preset];gl.useProgram(p.p);
      for(const [name,value] of Object.entries({projectionMatrix:projection,uStage:stage,uViewport:[width,height],uElapsed:isReduced?0:elapsed,uTaper:preset==='neural'?1:0,uArrival:arrival,uDpr:dpr,uTime:t,uAudio:[audio,audio*.65,audio*.45,audio*.25],uAccent:accent,uLuminosity:planetOnly?1.2:1.08,uPointScale:planetOnly?.62:1.05,uStateBlend:1,uStateEnergy:profile.energy,uTransition:0,uRingVisibility:ringVisibility,uDisintegration:0,uPointer:pointer,uPointerStrength:pointerStrength}))uniform(p,name,value);
      for(const [key,value] of Object.entries(profile))uniform(p,'u'+key[0].toUpperCase()+key.slice(1),value);
      for(const field of coreVisible?fields[preset]:[]){
        const saturn=preset==='saturn-experimental',reactor=preset==='jarvis-reactor';
        const rx=(saturn?(field.kind>0?1.38:-.03):reactor?-.12:-.2)+rotation[0];
        uniform(p,'modelViewMatrix',matrix(rx,rotation[1]+(saturn?.04:0),saturn&&field.kind>0?-.16:reactor?.16:0,fieldScale(field.kind)));uniform(p,'uKind',field.kind);
        for(const [name,attribute]of Object.entries(field.gpu)){if(!p.attributes.has(name))p.attributes.set(name,gl.getAttribLocation(p.p,name));const loc=p.attributes.get(name);if(loc<0)continue;gl.bindBuffer(gl.ARRAY_BUFFER,attribute.buffer);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,attribute.size,gl.FLOAT,false,0,0);}
        gl.drawArrays(gl.POINTS,0,Math.floor(field.positions.length/3*quality));
      }
    }else if(context2d){
      // Software fallback uses the same sampled desktop positions; never old ribbons.
      const ctx=context2d;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle=`rgb(${accent.map(v=>Math.round(v*255))})`;
      for(const field of coreVisible?fields[preset]:[]){
        const saturn=preset==='saturn-experimental',reactor=preset==='jarvis-reactor';
        if(saturn&&field.kind>0&&ringVisibility<.01)continue;
        const transform=matrix((saturn?(field.kind>0?1.38:-.03):reactor?-.12:-.2)+rotation[0],rotation[1]+(saturn?.04:0),saturn&&field.kind>0?-.16:reactor?.16:0,fieldScale(field.kind));
        const points=field.positions,step=Math.max(3,Math.ceil(points.length/3600)*3);
        for(let i=0;i<points.length;i+=step){
          const px=points[i],py=points[i+1],pz=points[i+2];
          const x=rect.left+rect.width/2+(transform[0]*px+transform[4]*py+transform[8]*pz)*side/13.2;
          const y=rect.top+rect.height/2-(transform[1]*px+transform[5]*py+transform[9]*pz)*side/13.2;
          const originX=((i+1)*.61803398875%1)*width,originY=((i+1)*.41421356237%1)*height;
          const readingEdge=1-smooth((Math.abs(y-rect.top-rect.height/2)/Math.max(1,rect.height/2)-.78)/.22);
          ctx.globalAlpha=(.15+arrival*.5)*(saturn&&field.kind>0?ringVisibility:1)*(1-arrival+arrival*readingEdge);
          ctx.fillRect(originX+(x-originX)*arrival,originY+(y-originY)*arrival,1,1);
        }
      }
      ctx.globalAlpha=1;
    }
    canvas.dataset.visualizer=preset;canvas.dataset.assembled=String(arrival===1);canvas.dataset.astralParticles=String(Math.floor(budget*quality));
    draws++;drawMs+=(performance.now()-start-drawMs)*.1;paintedReduced=isReduced;raf=requestAnimationFrame(draw);
  }
  function refresh(){paintedReduced=false;if(!raf&&!disposed&&!lost&&visible&&!document.hidden){last=0;raf=requestAnimationFrame(draw);}}
  function visibility(){cancelAnimationFrame(raf);raf=0;last=0;refresh();}
  function move(e){pointer=[(e.clientX-rect.left-rect.width/2)/Math.max(1,rect.width)*13.2,-(e.clientY-rect.top-rect.height/2)/Math.max(1,rect.height)*13.2];touching=true;if(dragging){targetRotation=[Math.max(-1,Math.min(1,(e.clientY-dragStart[1])/200)),Math.max(-1,Math.min(1,(e.clientX-dragStart[0])/200))];if(Math.hypot(e.clientX-dragStart[0],e.clientY-dragStart[1])>8)suppressClick=performance.now()+400;}}
  function down(e){if(e.button!==0||reduced())return;dragging=true;dragStart=[e.clientX,e.clientY];host.setPointerCapture?.(e.pointerId);}
  function leave(){touching=false;dragging=false;}
  function click(e){if(host.contains(e.target)&&performance.now()<suppressClick){e.preventDefault();e.stopImmediatePropagation();}}
  function contextLost(e){e.preventDefault();lost=true;cancelAnimationFrame(raf);raf=0;}
  function contextRestored(){try{buffers=[];upload();lost=false;resize();refresh();}catch(e){fallbackReason=String(e.message);}}
  const ro=new ResizeObserver(()=>{resize();refresh();});ro.observe(canvas);ro.observe(host);
  const io=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;visibility();});io.observe(canvas);
  host.addEventListener('pointermove',move,{passive:true});host.addEventListener('pointerdown',down);host.addEventListener('pointerup',leave);host.addEventListener('pointerleave',leave);host.addEventListener('pointercancel',leave);document.addEventListener('click',click,true);
  canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);
  document.addEventListener('visibilitychange',visibility);media.addEventListener('change',refresh);globalThis.addEventListener('resize',refresh);globalThis.addEventListener('scroll',refresh,{passive:true});globalThis.addEventListener('blur',leave);
  resize();refresh();
  return {refresh,setState(value){state=value;refresh();},getMetrics:()=>({state,phase,preset,previousPreset,arrival,energy:profile.energy,audio,quality,particles:Math.floor(budget*quality),draws,drawMs,elapsed,resolutionScale,pixelRatio:dpr,renderWidth:canvas.width,renderHeight:canvas.height,planetOnly,ringVisibility,backend:gl?'webgl':'canvas',fallbackReason}),dispose(){disposed=true;cancelAnimationFrame(raf);ro.disconnect();io.disconnect();ambient?.remove();document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',refresh);globalThis.removeEventListener('resize',refresh);globalThis.removeEventListener('scroll',refresh);globalThis.removeEventListener('blur',leave);host.removeEventListener('pointermove',move);host.removeEventListener('pointerdown',down);host.removeEventListener('pointerup',leave);host.removeEventListener('pointerleave',leave);host.removeEventListener('pointercancel',leave);document.removeEventListener('click',click,true);canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);if(gl){for(const b of buffers)gl.deleteBuffer(b);for(const p of Object.values(programs))gl.deleteProgram(p.p);}}};
}
module.exports = {createCosmicVisualizers};
