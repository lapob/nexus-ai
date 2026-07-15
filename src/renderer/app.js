const $ = (selector) => document.querySelector(selector);
window.addEventListener('error', (event) => {
  const clock = document.querySelector('#clock');
  if (clock) clock.textContent = `ERR ${String(event.message || 'renderer').slice(0, 36)}`;
});
const messages = [];
const initialWelcome = $('#messages').innerHTML;
let settings;
let generating = false;
let lastQuestion = '';
let selectedNode = null;
const suggestedModels = ['qwen3:8b', 'qwen2.5:7b', 'llama3.2:3b', 'llama3.1:8b', 'mistral:7b', 'deepseek-r1:7b', 'gemma3:4b', 'phi4-mini'];

function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function addMessage(role, content, sources = []) {
  $('.welcome-message')?.remove();
  const article = document.createElement('article');
  article.className = `message ${role}`;
  article.innerHTML = `<div class="role">${role === 'user' ? 'YOU' : 'NEXUS CORE'}</div><div class="bubble">${escapeHtml(content)}</div>`;
  if (sources.length) {
    const row = document.createElement('div'); row.className = 'sources';
    sources.forEach((source, index) => {
      const button = document.createElement('button'); button.className = 'source';
      button.textContent = `◈ ${index + 1} · ${source.title}`;
      button.addEventListener('click', () => window.nexus.openNote(source.relativePath));
      row.append(button);
    });
    article.append(row);
  }
  if (role === 'assistant' && content !== 'Scanning the knowledge universe…') {
    const actions = document.createElement('div'); actions.className = 'message-actions';
    const copy = document.createElement('button'); copy.textContent = '⧉ COPY';
    copy.addEventListener('click', async () => { await window.nexus.copyText(content); copy.textContent = '✓ COPIED'; });
    const retry = document.createElement('button'); retry.textContent = '↻ REGENERATE';
    retry.addEventListener('click', () => { if (lastQuestion && !generating) ask(lastQuestion); });
    actions.append(copy, retry); article.append(actions);
  }
  $('#messages').append(article); $('#messages').scrollTop = $('#messages').scrollHeight;
}

async function addStreamingMessage(content, sources) {
  addMessage('assistant', content, sources);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const article = $('#messages').lastElementChild;
  const bubble = article.querySelector('.bubble');
  const characters = [...String(content)];
  bubble.textContent = '';
  const step = Math.max(3, Math.ceil(characters.length / 90));
  for (let index = 0; index < characters.length; index += step) {
    bubble.textContent = characters.slice(0, index + step).join('');
    $('#messages').scrollTop = $('#messages').scrollHeight;
    await new Promise((resolve) => setTimeout(resolve, 14));
  }
}

function setCognitiveState(state, label) {
  const active = state !== 'ready';
  $('.comms-panel').classList.toggle('thinking', active);
  $('#thinkingIndicator').hidden = !active;
  $('#cognitiveState').textContent = label;
  $('#agentState').textContent = active ? 'WORKING' : 'READY';
}

async function ask(question) {
  if (generating) return;
  generating = true; lastQuestion = question; addMessage('user', question);
  const history = messages.slice(-8); messages.push({ role: 'user', content: question });
  $('#send').textContent = '■'; $('#send').title = 'Interrompi generazione';
  setCognitiveState('retrieval', 'RETRIEVING KNOWLEDGE');
  addMessage('assistant', 'Scanning the knowledge universe…');
  const pending = $('#messages').lastElementChild;
  try {
    const result = await window.nexus.chat({ question, history, mode: $('#reasoningMode').value });
    pending.remove();
    const content = result.answer || `${result.error}\n\nSono state rilevate ${result.sources.length} fonti pertinenti. Verifica il modello locale nelle impostazioni.`;
    setCognitiveState('thinking', 'SYNTHESIZING RESPONSE');
    await addStreamingMessage(content, result.sources); messages.push({ role: 'assistant', content });
  } catch (error) { pending.remove(); addMessage('assistant', `System error: ${error.message}`); }
  finally { generating = false; setCognitiveState('ready', 'COGNITIVE LINK ACTIVE'); $('#send').textContent = '↑'; $('#send').title = 'Invia'; }
}

$('#composer').addEventListener('submit', (event) => {
  event.preventDefault();
  if (generating) { window.nexus.cancel(); return; }
  const question = $('#question').value.trim();
  if (question) { $('#question').value = ''; ask(question); }
});
$('#question').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#composer').requestSubmit(); }
});
$('#messages').addEventListener('click', (event) => {
  const suggestion = event.target.closest('.suggestions button'); if (suggestion) ask(suggestion.textContent);
});
$('#newChat').addEventListener('click', () => { messages.length = 0; $('#messages').innerHTML = initialWelcome; });
$('#voiceToggle').addEventListener('click', () => {
  const button = $('#voiceToggle'); const active = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(active));
  $('#cognitiveState').textContent = active ? 'VOICE CHANNEL STANDBY' : 'COGNITIVE LINK ACTIVE';
  $('#agentState').textContent = active ? 'LISTENING' : 'READY';
});
const openSettings = () => $('#settingsDialog').showModal();
$('#settingsButton').addEventListener('click', openSettings); $('#dockSettings').addEventListener('click', openSettings);

async function populateModels() {
  const installed = await window.nexus.listModels();
  const models = [...new Set([settings?.model, ...installed, ...suggestedModels].filter(Boolean))];
  $('#modelCatalog').replaceChildren(...models.map((name) => Object.assign(document.createElement('option'), { value: name, label: installed.includes(name) ? `${name} · installed` : `${name} · catalog` })));
  $('#headerModel').replaceChildren(...models.map((name) => Object.assign(document.createElement('option'), { value: name, textContent: installed.includes(name) ? `● ${name}` : name })));
  $('#headerModel').value = settings.model; $('#modelState').textContent = installed.length ? 'READY' : 'LOCAL'; return installed;
}
$('#detectModels').addEventListener('click', async () => { const installed = await populateModels(); $('#settingsError').textContent = installed.length ? `${installed.length} modelli locali rilevati.` : 'Nessun motore locale raggiungibile.'; });
$('#headerModel').addEventListener('change', async () => { try { settings = await window.nexus.saveSettings({ ...settings, model: $('#headerModel').value }); $('#model').value = settings.model; } catch (error) { addMessage('assistant', `Model switch failed: ${error.message}`); } });
$('#settingsForm').addEventListener('submit', async (event) => { event.preventDefault(); $('#settingsError').textContent = ''; try { settings = await window.nexus.saveSettings({ baseUrl: $('#baseUrl').value, model: $('#model').value, temperature: $('#temperature').value }); await populateModels(); $('#settingsDialog').close(); } catch (error) { $('#settingsError').textContent = error.message; } });
$('#reindex').addEventListener('click', async () => { try { const stats = await window.nexus.reindex(); $('#metricNotes').textContent = stats.notes; $('#metricChunks').textContent = stats.chunks; } catch (error) { addMessage('assistant', `Indexing failed: ${error.message}`); } });

// Graph-first UI: coordinate normalizzate, nessuna dipendenza dal backend.
const graphNodes = [
  { id: 'core', label: 'NEXUS CORE', kind: 'core', x: .52, y: .49, size: 108, meta: 'Personal cognitive system', description: 'Il centro operativo della tua conoscenza.' },
  { id: 'vault', label: 'NEXUS VAULT', kind: 'vault', x: .25, y: .34, size: 28, meta: 'Knowledge source', description: 'Note Markdown, proprietà e collegamenti Obsidian.', path: '00_Home/Nexus Dashboard.md' },
  { id: 'agents', label: 'AI AGENTS', kind: 'agent', x: .52, y: .19, size: 29, meta: '8 cognitive entities', description: 'Assistenti specializzati con permessi controllati.', path: '06_AI_Assistant/Nexus AI.md' },
  { id: 'projects', label: 'PROJECTS', kind: 'project', x: .76, y: .31, size: 27, meta: 'Active workspace', description: 'Obiettivi, attività e documentazione operativa.', path: '04_Progetti/Progetti Attivi.md' },
  { id: 'labs', label: 'LABS', kind: 'lab', x: .78, y: .66, size: 25, meta: 'Cyber range', description: 'Esercitazioni e prove riproducibili.', path: '02_Cybersecurity/Labs/MOC - Labs.md' },
  { id: 'university', label: 'UNIVERSITY', kind: 'study', x: .52, y: .79, size: 25, meta: 'Learning system', description: 'Percorsi formativi e progressione personale.', path: '00_Home/Curriculum completo.md' },
  { id: 'cybersecurity', label: 'CYBERSECURITY', kind: 'knowledge', x: .25, y: .69, size: 29, meta: '46 knowledge nodes', description: 'Fondamenti, blue team, ethical hacking e laboratori.', path: '02_Cybersecurity/MOC - Cybersecurity.md' },
  { id: 'research', label: 'RESEARCH', kind: 'knowledge', x: .15, y: .52, size: 20, meta: 'Research layer', description: 'Fonti, idee e connessioni emergenti.', path: '05_Risorse/MOC - Risorse.md' },
  { id: 'models', label: 'AI MODELS', kind: 'model', x: .66, y: .83, size: 21, meta: 'Local inference', description: 'Modelli locali gestiti tramite Ollama.', path: '06_AI_Assistant/Modelli Locali.md' },
  { id: 'tutor', label: 'NEXUS TUTOR', kind: 'agent', x: .68, y: .13, size: 15, meta: 'Agent · ready', description: 'Costruisce percorsi di studio contestuali.' },
  { id: 'mentor', label: 'CYBER MENTOR', kind: 'agent', x: .86, y: .47, size: 15, meta: 'Agent · ready', description: 'Guida attività di cybersecurity controllate.' },
  { id: 'manager', label: 'KNOWLEDGE MANAGER', kind: 'agent', x: .35, y: .14, size: 15, meta: 'Agent · read only', description: 'Organizza e connette la knowledge base.' }
];
const edges = [['core','vault'],['core','agents'],['core','projects'],['core','labs'],['core','university'],['core','cybersecurity'],['core','research'],['core','models'],['agents','tutor'],['agents','mentor'],['agents','manager'],['vault','research'],['vault','cybersecurity'],['projects','labs'],['university','cybersecurity'],['models','agents']];
const palette = { core: '#ff6b16', vault: '#ff9a39', agent: '#e948a8', project: '#ff6b16', lab: '#745cff', study: '#c84ccf', knowledge: '#9b5cff', model: '#7058ff' };
const nodeIcons = { vault: '◇', agent: '✦', project: '⬡', lab: '△', study: '⌁', knowledge: '◎', model: '◈' };
const canvas = $('#knowledgeCanvas'); const ctx = canvas.getContext('2d');
let viewport = { x: 0, y: 0, zoom: 1 }; let pointer = { x: 0, y: 0 }; let drag = null; let frame = 0; let hoverNode = null;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stars = Array.from({ length: 115 }, (_, i) => ({ x: ((i * 73) % 997) / 997, y: ((i * 131) % 991) / 991, r: .25 + (i % 5) * .18, phase: i * .37 }));
const deepStars = Array.from({ length: 90 }, (_, i) => ({ x: ((i * 181) % 983) / 983, y: ((i * 211) % 977) / 977, r: .18 + (i % 3) * .13, phase: i * .51 }));
const coreParticles = Array.from({ length: 420 }, (_, i) => { const phi = Math.acos(1 - 2 * (i + .5) / 420); const theta = Math.PI * (1 + Math.sqrt(5)) * i; return { x: Math.cos(theta) * Math.sin(phi), y: Math.sin(theta) * Math.sin(phi), z: Math.cos(phi), phase: i * .21 }; });
function resizeCanvas() { const rect = canvas.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
function screenPoint(node) { const rect = canvas.getBoundingClientRect(); return { x: rect.width / 2 + (node.x - .5) * rect.width * viewport.zoom + viewport.x, y: rect.height / 2 + (node.y - .5) * rect.height * viewport.zoom + viewport.y, size: node.size * Math.max(.72, viewport.zoom) }; }
function draw(time = 0) {
  const rect = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, rect.width, rect.height); const t = reduceMotion ? 0 : time * .00025;
  const nebulaA = ctx.createRadialGradient(rect.width*.54+pointer.x*.015,rect.height*.48+pointer.y*.015,10,rect.width*.54,rect.height*.48,rect.width*.32); nebulaA.addColorStop(0,'rgba(108,24,70,.12)');nebulaA.addColorStop(.5,'rgba(54,12,55,.055)');nebulaA.addColorStop(1,'transparent');ctx.fillStyle=nebulaA;ctx.fillRect(0,0,rect.width,rect.height);
  const nebulaB = ctx.createRadialGradient(rect.width*.28-pointer.x*.009,rect.height*.68-pointer.y*.009,0,rect.width*.28,rect.height*.68,rect.width*.22);nebulaB.addColorStop(0,'rgba(93,45,16,.07)');nebulaB.addColorStop(1,'transparent');ctx.fillStyle=nebulaB;ctx.fillRect(0,0,rect.width,rect.height);
  for (const star of deepStars) { ctx.fillStyle='rgba(139,111,163,.12)';ctx.beginPath();ctx.arc(star.x*rect.width-pointer.x*.002,star.y*rect.height-pointer.y*.002,star.r,0,Math.PI*2);ctx.fill(); }
  for (const star of stars) { const alpha = .16 + Math.sin(t * 2 + star.phase) * .08; ctx.fillStyle = `rgba(255,210,185,${alpha})`; ctx.beginPath(); ctx.arc(star.x * rect.width + pointer.x * .006, star.y * rect.height + pointer.y * .006, star.r, 0, Math.PI * 2); ctx.fill(); }
  edges.forEach(([aId,bId], index) => { const aNode=graphNodes.find(n=>n.id===aId),bNode=graphNodes.find(n=>n.id===bId);const a=screenPoint(aNode),b=screenPoint(bNode);const bend=Math.sin(index*2.1)*24;const cx=(a.x+b.x)/2+bend,cy=(a.y+b.y)/2-bend;const gradient=ctx.createLinearGradient(a.x,a.y,b.x,b.y);gradient.addColorStop(0,`${palette[aNode.kind]}66`);gradient.addColorStop(1,`${palette[bNode.kind]}33`);ctx.strokeStyle=gradient;ctx.lineWidth=index<8?.9:.55;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(cx,cy,b.x,b.y);ctx.stroke();for(let flow=0;flow<2;flow++){const q=(t*.42+index*.093+flow*.5)%1;const inv=1-q;const fx=inv*inv*a.x+2*inv*q*cx+q*q*b.x,fy=inv*inv*a.y+2*inv*q*cy+q*q*b.y;ctx.shadowColor=palette[bNode.kind];ctx.shadowBlur=9;ctx.fillStyle=palette[bNode.kind];ctx.beginPath();ctx.arc(fx,fy,index<8?1.7:1.1,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;} });
  const core = screenPoint(graphNodes[0]); const breathe=1+(reduceMotion?0:Math.sin(t*2.2)*.035);const radius=core.size*.95*breathe;
  ctx.save();ctx.translate(core.x,core.y);ctx.rotate(t*.17);ctx.strokeStyle='#ff6b162b';ctx.lineWidth=.7;[[radius*1.3,radius*.52],[radius*1.48,radius*.7],[radius*1.62,radius*.93]].forEach((orbit,i)=>{ctx.save();ctx.rotate(i*1.03);ctx.beginPath();ctx.ellipse(0,0,orbit[0],orbit[1],0,0,Math.PI*2);ctx.stroke();const angle=t*(1.2-i*.17)+i*2;ctx.fillStyle=i===1?'#e948a8':'#ff8536';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(Math.cos(angle)*orbit[0],Math.sin(angle)*orbit[1],2.2,0,Math.PI*2);ctx.fill();ctx.restore();});ctx.restore();
  const coreGlow=ctx.createRadialGradient(core.x,core.y,0,core.x,core.y,radius*1.25);coreGlow.addColorStop(0,'rgba(255,107,22,.13)');coreGlow.addColorStop(.55,'rgba(233,72,168,.06)');coreGlow.addColorStop(1,'transparent');ctx.fillStyle=coreGlow;ctx.beginPath();ctx.arc(core.x,core.y,radius*1.25,0,Math.PI*2);ctx.fill();
  for (const particle of coreParticles) { const rotX=particle.x*Math.cos(t)-particle.z*Math.sin(t);const depth=particle.x*Math.sin(t)+particle.z*Math.cos(t);const px=core.x+rotX*radius,py=core.y+particle.y*radius;const alpha=.12+(depth+1)*.31;ctx.fillStyle=depth>.18?`rgba(255,116,32,${alpha})`:`rgba(228,66,174,${alpha})`;ctx.beginPath();ctx.arc(px,py,.45+(depth+1)*.63,0,Math.PI*2);ctx.fill(); }
  graphNodes.forEach((node) => { const p=screenPoint(node);if(node.id==='core'){ctx.strokeStyle='#ff6b1644';ctx.lineWidth=1;[1.05,1.18].forEach(scale=>{ctx.beginPath();ctx.arc(p.x,p.y,radius*scale,0,Math.PI*2);ctx.stroke();});}
    else {const hovered=hoverNode?.id===node.id;const pulse=reduceMotion?0:Math.sin(t*5+node.x*10)*2.3;const clusterRadius=p.size*(hovered?.67:.58)+pulse;ctx.shadowColor=palette[node.kind];ctx.shadowBlur=selectedNode?.id===node.id?30:hovered?24:14;ctx.fillStyle=`${palette[node.kind]}18`;ctx.strokeStyle=palette[node.kind];ctx.lineWidth=selectedNode?.id===node.id||hovered?1.6:.75;ctx.beginPath();ctx.arc(p.x,p.y,clusterRadius,0,Math.PI*2);ctx.fill();ctx.stroke();for(let s=0;s<9;s++){const angle=s*.698+t*(.45+(s%3)*.1);const orbit=clusterRadius+6+(s%3)*4;ctx.globalAlpha=.25+(s%4)*.12;ctx.fillStyle=palette[node.kind];ctx.beginPath();ctx.arc(p.x+Math.cos(angle)*orbit,p.y+Math.sin(angle)*orbit,1+(s%2)*.45,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.fillStyle=palette[node.kind];ctx.font='15px "Segoe UI Symbol"';ctx.textAlign='center';ctx.fillText(nodeIcons[node.kind]||'•',p.x,p.y+5);ctx.fillStyle=selectedNode?.id===node.id?'#53e6a6':'#ff8b49';ctx.beginPath();ctx.arc(p.x+clusterRadius*.72,p.y-clusterRadius*.72,2,0,Math.PI*2);ctx.fill();}
    ctx.textAlign='center';ctx.fillStyle=node.id==='core'?'#ff9b5e':'#d6cfd4';ctx.font=`${node.id==='core'?600:500} ${node.id==='core'?15:9}px Consolas`;ctx.fillText(node.label,p.x,p.y+(node.id==='core'?4:p.size*.86));if(node.id==='core'){ctx.fillStyle='#9a8189';ctx.font='9px Consolas';ctx.fillText('KNOWLEDGE UNIVERSE · ACTIVE',p.x,p.y+21);} });
  if (!reduceMotion) frame = requestAnimationFrame(draw);
}
function pickNode(x,y) { return graphNodes.map(node => ({ node, p: screenPoint(node) })).sort((a,b)=>b.node.size-a.node.size).find(({node,p}) => Math.hypot(x-p.x,y-p.y) < Math.max(20,p.size*.65))?.node; }
function selectNode(node, dockFocus = node.id) { selectedNode = node; $('#nodeTitle').textContent = node.label; $('#nodeMeta').textContent = node.meta; $('#nodeDescription').textContent = node.description; $('#openSelectedNote').hidden = !node.path; document.querySelectorAll('.dock-item[data-focus]').forEach(button => button.classList.toggle('active', button.dataset.focus === dockFocus)); }
canvas.addEventListener('pointerdown', (event) => { const rect=canvas.getBoundingClientRect(); const x=event.clientX-rect.left,y=event.clientY-rect.top; const node=pickNode(x,y); if(node){selectNode(node);return;} drag={x:event.clientX,y:event.clientY,vx:viewport.x,vy:viewport.y}; canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging'); });
canvas.addEventListener('pointermove', (event) => { const rect=canvas.getBoundingClientRect(); const localX=event.clientX-rect.left,localY=event.clientY-rect.top;pointer={x:localX-rect.width/2,y:localY-rect.height/2};hoverNode=pickNode(localX,localY)||null;canvas.style.cursor=hoverNode?'pointer':drag?'grabbing':'grab';if(drag){viewport.x=drag.vx+event.clientX-drag.x;viewport.y=drag.vy+event.clientY-drag.y;if(reduceMotion)draw();} });
canvas.addEventListener('pointerup', () => { drag=null;canvas.classList.remove('dragging'); });
canvas.addEventListener('wheel', (event) => { event.preventDefault();viewport.zoom=Math.max(.65,Math.min(1.8,viewport.zoom*(event.deltaY>0?.92:1.08)));if(reduceMotion)draw(); },{passive:false});
function setZoom(value){viewport.zoom=Math.max(.65,Math.min(1.8,value));if(reduceMotion)draw();}
$('#zoomIn').addEventListener('click',()=>setZoom(viewport.zoom*1.15)); $('#zoomOut').addEventListener('click',()=>setZoom(viewport.zoom*.87)); $('#resetGraph').addEventListener('click',()=>{viewport={x:0,y:0,zoom:1};selectNode(graphNodes[0], 'graph');if(reduceMotion)draw();});
$('#openSelectedNote').addEventListener('click',()=>{if(selectedNode?.path)window.nexus.openNote(selectedNode.path);});
$('#graphSearch').addEventListener('input',(event)=>{const value=event.target.value.trim().toLowerCase();const found=value&&graphNodes.find(n=>`${n.label} ${n.meta}`.toLowerCase().includes(value));if(found)selectNode(found);});
document.addEventListener('keydown',(event)=>{if(event.key==='/'&&document.activeElement!==$('#question')){event.preventDefault();$('#graphSearch').focus();}});
document.querySelectorAll('.dock-item[data-focus]').forEach(button=>button.addEventListener('click',()=>{const target=button.dataset.focus==='graph'?graphNodes[0]:graphNodes.find(n=>n.id===button.dataset.focus);if(target)selectNode(target, button.dataset.focus);else{const query={vault:'Esplora il Nexus Vault',agents:'Mostrami gli agenti Nexus',projects:'Mostrami i progetti attivi',labs:'Mostrami i laboratori',university:'Mostrami il percorso di studio'}[button.dataset.focus];if(query)ask(query);}}));
const updateClock=()=>{$('#clock').textContent=new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(new Date())};updateClock();setInterval(updateClock,30000);
window.addEventListener('resize',()=>{resizeCanvas();if(reduceMotion)draw();});resizeCanvas();selectNode(graphNodes[0]);draw();

(async () => {
  try {
    const data = await window.nexus.bootstrap(); settings = data.settings;
    $('#baseUrl').value = settings.baseUrl; $('#model').value = settings.model; $('#temperature').value = settings.temperature;
    $('#displayName').textContent = `${data.profile?.displayName || 'User'}.`;
    $('#metricNotes').textContent = data.stats.notes; $('#metricChunks').textContent = data.stats.chunks;
    await populateModels();
  } catch (error) { addMessage('assistant', `Initialization incomplete: ${error.message}`); }
})();
