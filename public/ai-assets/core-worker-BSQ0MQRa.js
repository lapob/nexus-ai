const e=.8,t=t=>t*e,n=e=>{let t=Math.min(1,Math.max(0,e));return t*t*t*(t*(t*6-15)+10)};function r(e,t){let r=e/11-t,i=Math.floor(r),a=r-i,o=n((a-.34)/.22)*(1-n((a-.66)/.3));return i&1?-o:o}function i(e,t,n,r,i,a,o,s){let c=Math.abs(i);if(c<1e-4)return e.x=t,e.y=n,e.z=r,e;let l=Math.sin(t*4.1+s*.21+a)*1.7+Math.cos(n*3.3-s*.17)*1.7,u=Math.cos(l),d=Math.sin(l);if(i>0){let i=1+.44*c*(.6+.4*o),s=Math.cos(.38*c),f=Math.sin(.38*c);e.x=(t*s-n*f)*i+u*.13*c,e.y=(t*f+n*s)*i+d*.13*c,e.z=r*i+Math.sin(l*1.3+a)*.1*c}else{let i=1-.58*c*(.55+.45*o),a=Math.cos(-1.05*c),s=Math.sin(-1.05*c);e.x=(t*a-n*s)*i+u*.035*c,e.y=(t*s+n*a)*i+d*.035*c,e.z=r*i}return e}function a(e){return 1+.1*r(e,-.03)+.018*Math.sin(e*Math.PI*2/(11/3))}const o=.22;function s(e){return e>=0?1-n(e/1.2):0}function c(e,t,n){let r=e=>Math.max(-1,Math.min(1,e));return[r(e)*o*n,-r(t)*o*n]}const l=[.29,.9,.91],u=[.46,.55,.64];function d(e){let t=Math.max(0,Math.min(1,e));return{tint:l.map((e,n)=>e+(u[n]-e)*t),glow:1-.42*t,energyCap:1-.55*t}}const f=(e,n)=>r(t(e),n),p=(e,n,r,a,o,s,c)=>i(e,n,r,a,o,s*6.2831853,s,t(c)),m=e=>a(t(e)),h=`
fn sm(t:f32)->f32{let x=clamp(t,0.,1.);return x*x*x*(x*(x*6.-15.)+10.);}
fn cb(t:f32,g:f32)->f32{let c=t*${e}/11.-g;let i=floor(c);let h=c-i;let s=sm((h-.34)/.22)*(1.-sm((h-.66)/.3));return select(-s,s,fract(i*.5)<.25);}
fn bp(p:vec3f,b:f32,e:f32,t0:f32)->vec3f{let s=abs(b);if(s<.0001){return p;}let t=t0*${e};let w=sin(p.x*4.1+t*.21+e*6.2831853)*1.7+cos(p.y*3.3-t*.17)*1.7;let f=vec2f(cos(w),sin(w));let o=b>0.;let k=select(1.-.58*s*(.55+.45*e),1.+.44*s*(.6+.4*e),o);let a=select(-1.05,.38,o)*s;let c=cos(a);let n=sin(a);return vec3f(vec2f(p.x*c-p.y*n,p.x*n+p.y*c)*k+f*select(.035,.13,o)*s,p.z*k+select(0.,sin(w*1.3+e*6.2831853)*.1*s,o));}
fn cz(t:f32)->f32{return 1.+.1*cb(t,-.03)+.018*sin(t*${e}*6.2831853/(11./3.));}
`,g=5200,_=1600,v=`
struct U{time:f32,energy:f32,aspect:f32,scale:f32,tint:vec4f,clip:vec4f,feather:vec4f,pointer:vec4f};
@group(0)@binding(0)var<uniform>u:U;
${h}
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
if(instance<${g}u){
let ct=f32(${g});
let y=1.-(i/(ct-1.))*2.;
let ring=sqrt(max(0.,1.-y*y));
let th=2.39996323*i;
let wave=sin(u.time*(.6+u.energy*1.4)+e0*6.2831+y*4.);
let rd=.62+.05*wave*(.4+u.energy)+.12*(e0-.5)*u.energy;
p=rotY(vec3f(cos(th)*ring,y,sin(th)*ring)*rd,u.time*(.08+.22*u.energy));
g=.04+(1.-y)*.07;
}else if(instance<7000u){
let k=i-f32(${g});
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
let ta=clamp(u.pointer.xy,vec2f(-1.),vec2f(1.))*${o}*u.pointer.z;
p=rotX(rotY(p,ta.x),-ta.y);
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
let hd=length((c-u.pointer.xy)*vec2f(u.aspect,1.));
out.glow=(.35+.65*(p.z*.5+.5))*(.55+.45*u.energy)*br*fd*u.pointer.w*(1.+.55*u.pointer.z*exp(-hd*hd*18.));
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
`;async function y(e){let t=navigator.gpu;if(!t)return null;let n=await t.requestAdapter({powerPreference:`low-power`}).catch(()=>null);if(!n)return null;let r=await n.requestDevice().catch(()=>null);if(!r)return null;let i=e.getContext(`webgpu`);if(!i)return null;let a=t.getPreferredCanvasFormat();i.configure({device:r,format:a,alphaMode:`premultiplied`});let o=r.createShaderModule({code:v}),s=r.createRenderPipeline({layout:`auto`,vertex:{module:o,entryPoint:`vs`},fragment:{module:o,entryPoint:`fs`,targets:[{format:a,blend:{color:{srcFactor:`one`,dstFactor:`one`,operation:`add`},alpha:{srcFactor:`one`,dstFactor:`one-minus-src-alpha`,operation:`add`}}}]},primitive:{topology:`triangle-strip`}}),c=r.createBuffer({size:80,usage:72}),l=r.createBindGroup({layout:s.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:c}}]}),u=new Float32Array(20),d=1,f=!1;return r.lost.then(()=>{f=!0}),{resize:(e,t)=>{d=e/Math.max(1,t)},frame:(e,t,n,a,o)=>{if(f)return;let{tint:p}=o;u.set([e,t,d,Math.min(1,d<1?d*1.25:1),p[0],p[1],p[2],n,...a.rect,...a.feather,0,0,o.x,o.y,o.influence,o.glow]),r.queue.writeBuffer(c,0,u);let m=r.createCommandEncoder(),h=m.beginRenderPass({colorAttachments:[{view:i.getCurrentTexture().createView(),loadOp:`clear`,storeOp:`store`,clearValue:{r:0,g:0,b:0,a:0}}]});h.setPipeline(s),h.setBindGroup(0,l),h.draw(4,7500),h.end(),r.queue.submit([m.finish()])},destroy:()=>{c.destroy(),r.destroy()}}}function b(e,t){let n=e.getContext(`2d`);if(!n)return null;let r=1,i=1,a={x:0,y:0,z:0},o=(e,t,n)=>{let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)};return{resize:(e,t)=>{r=e,i=t},frame:(e,s,l,u,d)=>{let h=`rgb(${d.tint.map(e=>Math.round(e*255)).join(` `)})`,[g,v]=c(d.x,d.y,d.influence),y=Math.cos(g),b=Math.sin(g),x=Math.cos(v),S=Math.sin(v),C=(d.x+1)*r/2,w=(1-d.y)*i/2;n.clearRect(0,0,r,i),n.fillStyle=h,n.globalCompositeOperation=`lighter`;let T=1+(m(e)-1)*l,E=Math.min(r,i)/2,D=E*.6/2*T,O=t(),[k,A,j,M]=u.rect,N=u.feather[0]*r/2,P=u.feather[1]*i/2,F=(e,t)=>(1-o(.56,.97,Math.hypot(e-r/2,t-i/2)/E))*o(0,1,Math.min((e-(k+1)*r/2)/N,((j+1)*r/2-e)/N,(t-(1-M)*i/2)/P,((1-A)*i/2-t)/P)),I=e*(.08+.22*s);for(let t=0;t<_;t+=1){let o=1-t/(_-1)*2,c=Math.sqrt(1-o*o),u=2.39996323*t+I,m=t*.7548776662%1,h=l*f(e,m*.16+.04+(1-o)*.07),g=p(a,Math.cos(u)*c,o,Math.sin(u)*c,h,m,e);if(d.influence>0){let e=y*g.x+b*g.z,t=-b*g.x+y*g.z,n=x*g.y-S*t;g.z=S*g.y+x*t,g.x=e,g.y=n}let v=1+.06*Math.sin(e*(.6+s*1.4)+t+o*4)*(.4+s),T=1/(2.2-g.z),E=Math.min(1,Math.max(0,g.z*.5+.5)),k=r/2+g.x*D*v*T*1.7,A=i/2+g.y*D*v*T*1.7,j=F(k,A);if(j<.002)continue;let M=(1.2+2.4*E)*O*(.8+.4*s)*(.35+.65*j),N=d.influence>0?Math.hypot((k-C)/(i/2),(A-w)/(i/2)):9,P=d.glow*(1+.55*d.influence*Math.exp(-N*N*18));n.globalAlpha=Math.min(1,(.35+.65*E)*(.6+.4*s)*(1-.26*Math.abs(h))*j*P),n.fillRect(k-M/2,A-M/2,M,M)}n.strokeStyle=h,n.lineWidth=Math.max(1,O*1.2);for(let[t,[a,o,c]]of[[1.42,.42,9],[1.56,-.55,14]].entries()){let l=t?-1:1,u=Math.PI*2*D*a;n.globalAlpha=(.35+.35*s)*d.glow,n.setLineDash([u/c*.5,u/c*.5]),n.lineDashOffset=-l*e*40*(.3+s),n.beginPath(),n.ellipse(r/2,i/2,D*a,D*a*.34,o,0,Math.PI*2),n.stroke()}n.setLineDash([]),n.globalAlpha=1},destroy:()=>{}}}function x(e,t,n,r,i,a=null){let o=()=>performance.timeOrigin+performance.now(),c=null,l={x:0,y:0,at:-1/0},u=0,f=0,p=0,m={x:0,y:0,influence:0,tint:d(0).tint,glow:1},h=`webgpu`,g=!1,_=0,v=n,x=n,S=r,C=!0,w={rect:[-1,-1,1,1],feather:[.08,.08]},T={width:1,height:1,dpr:1},E=1,D=!1,O=()=>{let t=h===`canvas`?2:3,n=Math.max(Math.min(T.dpr,t)*E,Math.min(T.dpr,1.5)),r=3840*2160;T.width*T.height*n*n>r&&(n=Math.sqrt(r/Math.max(1,T.width*T.height)));let a=Math.max(1,Math.round(T.width*n)),o=Math.max(1,Math.round(T.height*n));e.width!==a&&(e.width=a),e.height!==o&&(e.height=o),c?.resize(e.width,e.height),i({type:`info`,quality:E.toFixed(2)})},k=0,A=0,j=0,M=0,N=[],P=e=>{if(M&&N.length<4e4&&N.push(e-M),M=e,k&&e-k<250&&(A+=e-k,j+=1),k=e,j<90)return;let t=A/j;if(A=0,j=0,t>24&&!D){D=!0;return}if(t<15&&D&&E>=1){D=!1;return}let n=t>30?Math.max(.6,E*.9):t<18.5&&E<1?Math.min(1,E*1.12):E;Math.abs(n-E)>.01&&(E=n,O())},F=0,I=()=>S||a!==null,L=!1,R=e=>{if(g||!c)return;P(e);let n=o(),r=I()||!p?1:1-Math.exp(-Math.min(.25,(n-p)/1e3)*3.5);p=n,f+=(u-f)*r;let h=d(f);v=a===null?v+(x-v)*.04:x;let y=a??(S?0:(n-t)/1e3),b=S?0:Math.min(1,Math.max(0,(y-1.2)/3)),T=b*b*(3-2*b);m.x=l.x,m.y=l.y,m.influence=I()?0:s((n-l.at)/1e3),m.tint=h.tint,m.glow=h.glow,F+=1,D&&F%2==1&&!I()||c.frame(y,Math.min(v,h.energyCap),T,w,m),a!==null&&!L&&(L=!0,i({type:`info`,qa:`ready`})),!I()&&C&&(_=requestAnimationFrame(R))},z=()=>{cancelAnimationFrame(_),k=0,M=0,C&&(_=requestAnimationFrame(R))};return(async()=>{if(c=await y(e).catch(()=>null),c||=(h=`canvas`,b(e,()=>T.dpr)),g||!c){c?.destroy();return}i({type:`info`,backend:h}),O(),z()})(),{send(e){switch(e.type){case`size`:T=e,O(),I()&&z();break;case`clip`:w=e.clip,I()&&z();break;case`energy`:x=e.target,I()&&(v=x,z());break;case`reduced`:S=e.reduced,z();break;case`visible`:C=e.visible,z();break;case`pointer`:I()||(l.x=e.x,l.y=e.y,l.at=o());break;case`mood`:u=+!!e.offline,I()&&z();break;case`stats`:i({type:`stats`,intervals:N.splice(0)});break}},destroy(){g=!0,cancelAnimationFrame(_),c?.destroy()}}}const S=self;let C=null;S.onmessage=e=>{let t=e.data;t.type===`init`?C=x(t.canvas,t.startedAt,t.energy,t.reduced,e=>S.postMessage(e),t.still):C?.send(t)},S.postMessage({type:`loaded`});