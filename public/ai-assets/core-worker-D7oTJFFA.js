const e=.8,t=e=>{let t=Math.min(1,Math.max(0,e));return t*t*t*(t*(t*6-15)+10)};function n(n,r){let i=n*e/11-r,a=Math.floor(i),o=i-a,s=t((o-.34)/.22)*(1-t((o-.66)/.3));return a&1?-s:s}function r(t,n,r,i,a,o,s){let c=Math.abs(a);if(c<1e-4)return t.x=n,t.y=r,t.z=i,t;let l=s*e,u=Math.sin(n*4.1+l*.21+o*6.2831853)*1.7+Math.cos(r*3.3-l*.17)*1.7,d=Math.cos(u),f=Math.sin(u);if(a>0){let e=1+.44*c*(.6+.4*o),a=Math.cos(.38*c),s=Math.sin(.38*c);t.x=(n*a-r*s)*e+d*.13*c,t.y=(n*s+r*a)*e+f*.13*c,t.z=i*e+Math.sin(u*1.3+o*6.2831853)*.1*c}else{let e=1-.58*c*(.55+.45*o),a=Math.cos(-1.05*c),s=Math.sin(-1.05*c);t.x=(n*a-r*s)*e+d*.035*c,t.y=(n*s+r*a)*e+f*.035*c,t.z=i*e}return t}function i(t){let r=t*e;return 1+.1*n(t,-.03)+.018*Math.sin(r*Math.PI*2/(11/3))}const a=`
fn sm(t:f32)->f32{let x=clamp(t,0.,1.);return x*x*x*(x*(x*6.-15.)+10.);}
fn cb(t:f32,g:f32)->f32{let c=t*${e}/11.-g;let i=floor(c);let h=c-i;let s=sm((h-.34)/.22)*(1.-sm((h-.66)/.3));return select(-s,s,fract(i*.5)<.25);}
fn bp(p:vec3f,b:f32,e:f32,t0:f32)->vec3f{let s=abs(b);if(s<.0001){return p;}let t=t0*${e};let w=sin(p.x*4.1+t*.21+e*6.2831853)*1.7+cos(p.y*3.3-t*.17)*1.7;let f=vec2f(cos(w),sin(w));let o=b>0.;let k=select(1.-.58*s*(.55+.45*e),1.+.44*s*(.6+.4*e),o);let a=select(-1.05,.38,o)*s;let c=cos(a);let n=sin(a);return vec3f(vec2f(p.x*c-p.y*n,p.x*n+p.y*c)*k+f*select(.035,.13,o)*s,p.z*k+select(0.,sin(w*1.3+e*6.2831853)*.1*s,o));}
fn cz(t:f32)->f32{return 1.+.1*cb(t,-.03)+.018*sin(t*${e}*6.2831853/(11./3.));}
`,o=5200,s=1600,c=`
struct U{time:f32,energy:f32,aspect:f32,scale:f32,tint:vec4f,clip:vec4f,feather:vec4f};
@group(0)@binding(0)var<uniform>u:U;
${a}
struct Out{@builtin(position)position:vec4f,@location(0)local:vec2f,@location(1)glow:f32,@location(2)white:f32};
fn hash(n:f32)->f32{return fract(sin(n*12.9898)*43758.5453);}
fn rotY(p:vec3f,a:f32)->vec3f{let c=cos(a);let s=sin(a);return vec3f(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
fn rotX(p:vec3f,a:f32)->vec3f{let c=cos(a);let s=sin(a);return vec3f(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
fn rotZ(p:vec3f,a:f32)->vec3f{let c=cos(a);let s=sin(a);return vec3f(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
@vertex
fn vs(@builtin(vertex_index)vertex:u32,@builtin(instance_index)instance:u32)->Out{
let i=f32(instance);
let e0=hash(i);
var p:vec3f;
var br=1.;
var white=0.;
var sb=1.;
var g=0.;
if(instance<${o}u){
let ct=f32(${o});
let y=1.-(i/(ct-1.))*2.;
let ring=sqrt(max(0.,1.-y*y));
let th=2.39996323*i;
let wave=sin(u.time*(.6+u.energy*1.4)+e0*6.2831+y*4.);
let rd=.62+.05*wave*(.4+u.energy)+.12*(e0-.5)*u.energy;
p=rotY(vec3f(cos(th)*ring,y,sin(th)*ring)*rd,u.time*(.08+.22*u.energy));
g=.04+(1.-y)*.07;
}else if(instance<7000u){
let k=i-f32(${o});
let sd=k>=f32(900);
let j=select(k,k-f32(900),sd);
let a=j/f32(900)*6.2831853;
let dir=select(1.,-1.,sd);
let sp=u.time*dir*(.12+.35*u.energy);
let rd=select(.88,.97,sd)+.012*(e0-.5);
p=vec3f(cos(a+sp)*rd,.006*(e0-.5),sin(a+sp)*rd);
p=rotX(p,select(.22,-.3,sd));
p=rotZ(p,select(.38,-.5,sd));
let da=fract(a*select(9.,14.,sd)/6.2831853-u.time*.15*dir);
br=select(.25,1.7,da<select(.55,.35,sd))*(.6+.4*u.energy);
white=.4;
sb=1.1;
g=.17+j/f32(900)*.1;
}else{
let k=i-f32(7000);
let y=1.-(k/f32(499))*2.;
let ring=sqrt(max(0.,1.-y*y));
let th=2.39996323*k;
let pu=1.+.18*sin(u.time*(1.2+2.4*u.energy)+e0*3.)*(.3+u.energy);
p=rotY(vec3f(cos(th)*ring,y,sin(th)*ring)*(.14+.1*e0)*pu,-u.time*.4);
white=.7;
br=.8+.6*u.energy;
sb=1.3;
}
let b=u.tint.w*cb(u.time,e0*.16+g);
p=bp(p,b,hash(i+3.),u.time)*mix(1.,cz(u.time),u.tint.w);
br*=1.-.26*abs(b);
p=rotX(p,.35);
let dp=1./(2.2-p.z);
let cs=array<vec2f,4>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(1.,1.));
let cn=cs[vertex];
let c=vec2f(p.x*dp/u.aspect,p.y*dp)*${(1.9/2).toFixed(3)}*u.scale;
let ed=min(c-u.clip.xy,u.clip.zw-c)/u.feather.xy;
let fd=(1.-smoothstep(.56,.97,length(c*vec2f(u.aspect,1.))))*smoothstep(0.,1.,min(ed.x,ed.y));
let size=(.0035+.006*hash(i+7.))*(1.+u.energy*.6)*u.scale*sb*${(1/2).toFixed(3)}*(.35+.65*fd);
var out:Out;
out.position=select(vec4f(c+cn*vec2f(size/u.aspect,size),0.,1.),vec4f(0.,0.,2.,1.),fd<.002);
out.local=cn;
out.glow=(.35+.65*(p.z*.5+.5))*(.55+.45*u.energy)*br*fd;
out.white=white;
return out;
}
@fragment
fn fs(ip:Out)->@location(0)vec4f{
let d=dot(ip.local,ip.local);
if(d>1.){discard;}
let fo=(1.-smoothstep(.2,.55,d))*.85+exp(-d*5.)*.35;
let co=mix(u.tint.rgb,vec3f(.92,1.,1.),ip.white);
return vec4f(co*fo*ip.glow,fo*ip.glow);
}
`;async function l(e,t){let n=navigator.gpu;if(!n)return null;let r=await n.requestAdapter({powerPreference:`low-power`}).catch(()=>null);if(!r)return null;let i=await r.requestDevice().catch(()=>null);if(!i)return null;let a=e.getContext(`webgpu`);if(!a)return null;let o=n.getPreferredCanvasFormat();a.configure({device:i,format:o,alphaMode:`premultiplied`});let s=i.createShaderModule({code:c}),l=i.createRenderPipeline({layout:`auto`,vertex:{module:s,entryPoint:`vs`},fragment:{module:s,entryPoint:`fs`,targets:[{format:o,blend:{color:{srcFactor:`one`,dstFactor:`one`,operation:`add`},alpha:{srcFactor:`one`,dstFactor:`one-minus-src-alpha`,operation:`add`}}}]},primitive:{topology:`triangle-strip`}}),u=i.createBuffer({size:64,usage:72}),d=i.createBindGroup({layout:l.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:u}}]}),f=new Float32Array(16),p=1,m=!1;return i.lost.then(()=>{m=!0}),{resize:(e,t)=>{p=e/Math.max(1,t)},frame:(e,n,r,o)=>{if(m)return;f.set([e,n,p,Math.min(1,p<1?p*1.25:1),t[0],t[1],t[2],r,...o.rect,...o.feather,0,0]),i.queue.writeBuffer(u,0,f);let s=i.createCommandEncoder(),c=s.beginRenderPass({colorAttachments:[{view:a.getCurrentTexture().createView(),loadOp:`clear`,storeOp:`store`,clearValue:{r:0,g:0,b:0,a:0}}]});c.setPipeline(l),c.setBindGroup(0,d),c.draw(4,7500),c.end(),i.queue.submit([s.finish()])},destroy:()=>{u.destroy(),i.destroy()}}}function u(e,t,a){let o=e.getContext(`2d`);if(!o)return null;let c=`rgb(${t.map(e=>Math.round(e*255)).join(` `)})`,l=1,u=1,d={x:0,y:0,z:0},f=(e,t,n)=>{let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)};return{resize:(e,t)=>{l=e,u=t},frame:(e,t,p,m)=>{o.clearRect(0,0,l,u),o.fillStyle=c,o.globalCompositeOperation=`lighter`;let h=1+(i(e)-1)*p,g=Math.min(l,u)/2,_=g*.6/2*h,v=a(),[y,b,x,S]=m.rect,C=m.feather[0]*l/2,w=m.feather[1]*u/2,T=(e,t)=>(1-f(.56,.97,Math.hypot(e-l/2,t-u/2)/g))*f(0,1,Math.min((e-(y+1)*l/2)/C,((x+1)*l/2-e)/C,(t-(1-S)*u/2)/w,((1-b)*u/2-t)/w)),E=e*(.08+.22*t);for(let i=0;i<s;i+=1){let a=1-i/(s-1)*2,c=Math.sqrt(1-a*a),f=2.39996323*i+E,m=i*.7548776662%1,h=p*n(e,m*.16+.04+(1-a)*.07),g=r(d,Math.cos(f)*c,a,Math.sin(f)*c,h,m,e),y=1+.06*Math.sin(e*(.6+t*1.4)+i+a*4)*(.4+t),b=1/(2.2-g.z),x=Math.min(1,Math.max(0,g.z*.5+.5)),S=l/2+g.x*_*y*b*1.7,C=u/2+g.y*_*y*b*1.7,w=T(S,C);if(w<.002)continue;let D=(1.2+2.4*x)*v*(.8+.4*t)*(.35+.65*w);o.globalAlpha=Math.min(1,(.35+.65*x)*(.6+.4*t)*(1-.26*Math.abs(h))*w),o.fillRect(S-D/2,C-D/2,D,D)}o.strokeStyle=c,o.lineWidth=Math.max(1,v*1.2);for(let[n,[r,i,a]]of[[1.42,.42,9],[1.56,-.55,14]].entries()){let s=n?-1:1,c=Math.PI*2*_*r;o.globalAlpha=.35+.35*t,o.setLineDash([c/a*.5,c/a*.5]),o.lineDashOffset=-s*e*40*(.3+t),o.beginPath(),o.ellipse(l/2,u/2,_*r,_*r*.34,i,0,Math.PI*2),o.stroke()}o.setLineDash([]),o.globalAlpha=1},destroy:()=>{}}}function d(e,t,n,r,i){let a=()=>performance.timeOrigin+performance.now(),o=[.29,.9,.91],s=null,c=`webgpu`,d=!1,f=0,p=n,m=n,h=r,g=!0,_={rect:[-1,-1,1,1],feather:[.08,.08]},v={width:1,height:1,dpr:1},y=1,b=!1,x=()=>{let t=c===`canvas`?2:3,n=Math.max(Math.min(v.dpr,t)*y,Math.min(v.dpr,1.5)),r=3840*2160;v.width*v.height*n*n>r&&(n=Math.sqrt(r/Math.max(1,v.width*v.height)));let a=Math.max(1,Math.round(v.width*n)),o=Math.max(1,Math.round(v.height*n));e.width!==a&&(e.width=a),e.height!==o&&(e.height=o),s?.resize(e.width,e.height),i({type:`info`,quality:y.toFixed(2)})},S=0,C=0,w=0,T=0,E=[],D=e=>{if(T&&E.length<4e4&&E.push(e-T),T=e,S&&e-S<250&&(C+=e-S,w+=1),S=e,w<90)return;let t=C/w;if(C=0,w=0,t>24&&!b){b=!0;return}if(t<15&&b&&y>=1){b=!1;return}let n=t>30?Math.max(.6,y*.9):t<18.5&&y<1?Math.min(1,y*1.12):y;Math.abs(n-y)>.01&&(y=n,x())},O=0,k=e=>{if(d||!s)return;D(e),p+=(m-p)*.04;let n=h?0:(a()-t)/1e3,r=h?0:Math.min(1,Math.max(0,(n-1.2)/3)),i=r*r*(3-2*r);O+=1,b&&O%2==1&&!h||s.frame(n,p,i,_),!h&&g&&(f=requestAnimationFrame(k))},A=()=>{cancelAnimationFrame(f),S=0,T=0,g&&(f=requestAnimationFrame(k))};return(async()=>{if(s=await l(e,o).catch(()=>null),s||=(c=`canvas`,u(e,o,()=>v.dpr)),d||!s){s?.destroy();return}i({type:`info`,backend:c}),x(),A()})(),{send(e){switch(e.type){case`size`:v=e,x(),h&&A();break;case`clip`:_=e.clip;break;case`energy`:m=e.target,h&&(p=m,A());break;case`reduced`:h=e.reduced,A();break;case`visible`:g=e.visible,A();break;case`stats`:i({type:`stats`,intervals:E.splice(0)});break}},destroy(){d=!0,cancelAnimationFrame(f),s?.destroy()}}}const f=self;let p=null;f.onmessage=e=>{let t=e.data;t.type===`init`?p=d(t.canvas,t.startedAt,t.energy,t.reduced,e=>f.postMessage(e)):p?.send(t)},f.postMessage({type:`loaded`});