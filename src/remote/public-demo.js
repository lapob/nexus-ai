/**
 * @module remote/public-ai
 * @description NexusNXS AI pubblica: voce, memoria locale, allegati e download adattivo.
 */

const WINDOWS_DOWNLOAD = 'https://github.com/lapob/nexus-ai/releases/download/v0.3.5-preview.1/NexusNXS-0.3.5-Setup.exe';
const ANDROID_DOWNLOAD = 'https://github.com/lapob/nexus-ai/releases/download/v0.3.5-preview.1/NexusNXS-Android-6.4.0.apk';

const EXPERIENCE_STYLE = `<style>
.brand-lockup{display:flex;align-items:center;gap:10px;min-width:0}.brand-mark{width:36px;height:36px;display:block;flex:0 0 auto;border-radius:11px;object-fit:cover;box-shadow:0 0 0 1px rgba(82,238,240,.1),0 8px 24px rgba(39,207,210,.12)}.identity-actions{display:flex;align-items:center;gap:9px}.shell{width:min(1180px,100%);padding-bottom:calc(112px + env(safe-area-inset-bottom))}.stage{width:min(860px,100%);margin-inline:auto}.lede{display:none}.download-trigger,.keyboard-toggle,.attachment-toggle,.memory-clear,.sheet-close{border:1px solid rgba(111,202,202,.14);color:#8ca8a9;background:rgba(10,24,25,.72);cursor:pointer;transition:transform .18s cubic-bezier(.2,0,0,1),border-color .18s ease,color .18s ease,background .18s ease}.download-trigger{min-height:38px;padding:0 14px;border-radius:999px;font-size:.7rem;font-weight:620;letter-spacing:.02em}.download-trigger:hover,.download-trigger:focus-visible,.keyboard-toggle:hover,.keyboard-toggle:focus-visible,.attachment-toggle:hover,.attachment-toggle:focus-visible{border-color:rgba(91,224,220,.34);color:#d7eeee;background:rgba(29,85,86,.23);outline:0;transform:translateY(-1px)}.download-trigger svg,.keyboard-toggle svg,.sheet-close svg,.send svg{display:block;width:21px;height:21px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}.download-trigger svg{display:none;width:19px;height:19px}.core[data-state=listening] canvas{filter:drop-shadow(0 0 25px rgba(99,235,199,.34))}.core[data-state=speaking] canvas{filter:drop-shadow(0 0 28px rgba(109,180,255,.32))}.core[data-state=error] canvas{filter:drop-shadow(0 0 22px rgba(214,154,88,.27))}.dock{position:fixed;z-index:30;right:0;bottom:max(0px,env(safe-area-inset-bottom));left:0;width:min(720px,calc(100% - 36px));margin:auto;padding:16px 0 8px;background:linear-gradient(transparent,rgba(2,6,7,.96) 30%);contain:layout style}.composer{position:static;display:grid;grid-template-columns:52px minmax(0,1fr) 54px;gap:9px;align-items:end;width:100%;margin:0;padding:0;background:none}.keyboard-toggle{width:52px;height:52px;margin-bottom:2px;border-radius:50%;display:grid;place-items:center}.composer-box,.send{opacity:0;pointer-events:none;transform:translateY(8px) scale(.98);transition:opacity .2s ease,transform .24s cubic-bezier(.2,0,0,1),border-color .18s ease,background .18s ease,box-shadow .18s ease}.keyboard-open .composer-box,.keyboard-open .send{opacity:1;pointer-events:auto;transform:none}.keyboard-open .keyboard-toggle{color:#79dfdc;border-color:rgba(91,224,220,.28);background:rgba(29,85,86,.2)}.composer-box{min-height:54px}.send{width:54px;height:54px;margin:0;display:grid;place-items:center;color:#547273;background:rgba(21,42,43,.82)}.send:not(:disabled){color:#dffafa;border-color:rgba(87,230,224,.44);background:linear-gradient(145deg,rgba(61,190,186,.38),rgba(26,109,111,.24));box-shadow:0 0 0 1px rgba(85,222,219,.06),0 9px 28px rgba(21,125,127,.18)}.send:not(:disabled):hover,.send:not(:disabled):focus-visible{background:linear-gradient(145deg,rgba(68,210,205,.48),rgba(26,119,121,.3))}.send[data-mode=stop]{color:#e9ffff;border-color:rgba(126,229,224,.42);background:rgba(36,82,83,.92)}.send[data-mode=stop] svg{width:18px;height:18px}.send:disabled{opacity:.42}.memory-clear{padding:0;border:0;background:none;color:#577273;font-size:inherit;text-decoration:underline;text-underline-offset:3px}.privacy{max-width:660px;line-height:1.5}.download-sheet{width:min(440px,calc(100% - 28px));margin:auto;border:1px solid rgba(103,206,204,.17);border-radius:26px;padding:0;color:#d9e6e6;background:linear-gradient(160deg,rgba(10,25,26,.985),rgba(3,10,11,.99));box-shadow:0 30px 90px rgba(0,0,0,.62)}.download-sheet::backdrop{background:rgba(0,4,5,.72);backdrop-filter:blur(9px)}.sheet-body{padding:24px}.sheet-top{display:flex;align-items:center;justify-content:space-between;gap:18px}.sheet-label{margin:0;color:#557576;font:600 .63rem ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.13em;text-transform:uppercase}.sheet-close{width:40px;height:40px;border-radius:50%;display:grid;place-items:center}.download-sheet h2{margin:24px 0 0;font-size:1.65rem;font-weight:460;letter-spacing:-.035em}.download-sheet p{margin:10px 0 0;color:#789091;line-height:1.58}.download-action{min-height:54px;margin-top:24px;border-radius:18px;display:flex;align-items:center;justify-content:center;gap:10px;color:#e7ffff;background:linear-gradient(135deg,rgba(53,202,197,.38),rgba(24,111,113,.3));text-decoration:none;font-weight:650;transition:transform .18s ease,filter .18s ease}.download-action:hover,.download-action:focus-visible{outline:0;filter:brightness(1.14);transform:translateY(-1px)}.download-action[hidden],.unavailable[hidden]{display:none}.device-note{font-size:.72rem}.unavailable{margin-top:20px;padding:15px;border:1px solid rgba(125,180,181,.12);border-radius:16px;color:#849b9c;background:rgba(255,255,255,.018);line-height:1.5}@media(max-width:560px){.shell{padding-inline:18px}.brand-mark{width:34px;height:34px;border-radius:10px}.download-trigger{width:38px;padding:0;display:grid;place-items:center}.download-trigger span{display:none}.download-trigger svg{display:block}.composer{grid-template-columns:50px minmax(0,1fr) 54px}.keyboard-toggle{width:50px;height:50px}.send{width:54px;height:54px}.send svg{width:24px;height:24px}.privacy{font-size:.62rem}.stage{padding-bottom:12px}}@media(max-height:650px){.dock{padding-top:8px}.privacy{margin-top:6px}.download-sheet h2{margin-top:14px}}@media(prefers-reduced-motion:reduce){.download-trigger,.keyboard-toggle,.attachment-toggle,.composer-box,.send,.download-action{transition:none}.download-sheet::backdrop{backdrop-filter:none}}
</style>`;

const INTERACTION_VISIBILITY_STYLE = `<style>
html{scrollbar-width:none}
html::-webkit-scrollbar{display:none}
*{-webkit-tap-highlight-color:transparent}
button,a,summary{-webkit-user-select:none;user-select:none;touch-action:manipulation}
button:focus:not(:focus-visible),a:focus:not(:focus-visible),summary:focus:not(:focus-visible){outline:0}
::selection{color:#eaffff;background:rgba(82,238,240,.2)}
.composer .send{opacity:0}
.keyboard-open .composer .send{opacity:1}
.keyboard-open .composer .send:disabled{opacity:.42}
.phase:not(:empty):before{width:.42rem;height:.42rem;margin-right:.62rem;border-radius:50%;background:#78deda;box-shadow:0 0 0 3px rgba(80,211,208,.07),0 0 16px rgba(80,211,208,.46);animation:none}
.answer.streaming:after{width:.42rem;height:.42rem;margin-left:.42rem;border-radius:50%;background:#8ce8e3;vertical-align:.08em;box-shadow:0 0 0 3px rgba(83,221,216,.06),0 0 17px rgba(83,221,216,.58);animation:stream-spark 1.15s cubic-bezier(.2,0,.2,1) infinite}
.generated-image{width:min(560px,100%);margin:18px auto 0;overflow:hidden;border:1px solid rgba(102,220,216,.15);border-radius:24px;background:rgba(8,21,22,.72);box-shadow:0 24px 70px rgba(0,0,0,.34);animation:image-reveal .42s cubic-bezier(.2,.8,.2,1)}
.generated-image[hidden]{display:none}.generated-image img{display:block;width:100%;height:auto;max-height:min(52vh,620px);object-fit:contain}.generated-image figcaption{padding:10px 14px;color:#587879;font:.62rem ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase}
@keyframes stream-spark{0%,100%{opacity:.42;transform:scale(.72)}45%{opacity:1;transform:scale(1.22)}}
@keyframes image-reveal{from{opacity:0;filter:blur(5px);transform:translateY(10px) scale(.985)}}
</style>`;

const ATTACHMENT_STYLE = `<style>
.attachment-toggle{position:relative}.attachment-toggle:focus{outline:0}.attachment-toggle:focus-visible{border-color:rgba(91,224,220,.34);color:#d7eeee;background:rgba(29,85,86,.23);box-shadow:0 0 0 3px rgba(83,221,216,.055)}
.composer{grid-template-columns:52px 52px minmax(0,1fr) 54px}.attachment-toggle{width:52px;height:52px;margin-bottom:2px;border-radius:50%;display:grid;place-items:center}.attachment-toggle svg{display:block;width:21px;height:21px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}.attachment-toggle[data-count]:not([data-count="0"]){color:#91e9e5;border-color:rgba(91,224,220,.3);background:rgba(29,85,86,.22)}.attachment-toggle[data-count]:not([data-count="0"])::after{content:attr(data-count);position:absolute;min-width:17px;height:17px;margin:-39px 0 0 35px;border:2px solid #020607;border-radius:999px;display:grid;place-items:center;color:#021011;background:#73ded9;font:700 .58rem Inter,system-ui,sans-serif}.attachment-tray{display:flex;flex-wrap:wrap;gap:7px;max-height:76px;margin:0 0 8px 61px;overflow:auto;scrollbar-width:none}.attachment-tray:empty{display:none}.attachment-tray::-webkit-scrollbar{display:none}.attachment-chip{max-width:min(280px,72vw);height:34px;padding:0 8px 0 11px;border:1px solid rgba(101,204,203,.14);border-radius:999px;display:flex;align-items:center;gap:8px;color:#8facad;background:rgba(10,24,25,.78);font-size:.68rem}.attachment-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.attachment-chip button{width:24px;height:24px;border:0;border-radius:50%;color:#6e8c8d;background:transparent;cursor:pointer}.attachment-chip button:hover,.attachment-chip button:focus-visible{outline:0;color:#d8eeee;background:rgba(92,194,193,.12)}@media(max-width:560px){.composer{grid-template-columns:48px 48px minmax(0,1fr) 52px;gap:7px}.keyboard-toggle,.attachment-toggle{width:48px;height:48px}.send{width:52px;height:52px}.attachment-tray{margin-left:55px}}
.keyboard-toggle,.attachment-toggle{position:relative}.keyboard-toggle::before,.attachment-toggle::before{content:attr(data-tooltip);position:absolute;left:50%;bottom:calc(100% + 9px);z-index:8;padding:6px 9px;border:1px solid rgba(104,214,211,.12);border-radius:8px;color:#a9c7c7;background:rgba(4,13,14,.94);box-shadow:0 10px 30px rgba(0,0,0,.34);font:600 .6rem "NexusNXS Inter",Inter,system-ui,sans-serif;letter-spacing:.02em;white-space:nowrap;opacity:0;pointer-events:none;transform:translate(-50%,4px);transition:opacity .15s ease,transform .18s cubic-bezier(.2,0,0,1)}.keyboard-toggle:hover::before,.keyboard-toggle:focus-visible::before,.attachment-toggle:hover::before,.attachment-toggle:focus-visible::before{opacity:1;transform:translate(-50%,0)}
.response-actions{min-height:32px;margin-top:13px;display:flex;flex-wrap:wrap;align-items:center;gap:7px}.response-actions[hidden]{display:none}.response-action,.feedback-action{min-height:32px;padding:0 11px;border:1px solid rgba(99,203,201,.11);border-radius:999px;color:#688687;background:rgba(8,20,21,.62);cursor:pointer;font-size:.64rem;transition:color .16s ease,border-color .16s ease,background .16s ease,transform .16s ease}.response-action:hover,.response-action:focus-visible,.feedback-action:hover,.feedback-action:focus-visible{outline:0;color:#c8e8e7;border-color:rgba(99,220,216,.24);background:rgba(22,64,65,.2);transform:translateY(-1px)}.response-action:disabled,.feedback-action:disabled{cursor:default;transform:none}.response-action[data-done=true]{color:#9ee2df;border-color:rgba(99,220,216,.2)}.feedback-status{color:#547172;font-size:.62rem}
.composer{grid-template-columns:52px 52px minmax(0,1fr) 54px}.attachment-toggle{width:52px;height:52px;margin-bottom:2px;border-radius:50%;display:grid;place-items:center}.attachment-toggle svg{display:block;width:21px;height:21px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}.attachment-toggle[data-count]:not([data-count="0"]){color:#91e9e5;border-color:rgba(91,224,220,.3);background:rgba(29,85,86,.22)}.attachment-toggle[data-count]:not([data-count="0"])::after{content:attr(data-count);position:absolute;min-width:17px;height:17px;margin:-39px 0 0 35px;border:2px solid #020607;border-radius:999px;display:grid;place-items:center;color:#021011;background:#73ded9;font:700 .58rem Inter,system-ui,sans-serif}.attachment-tray{display:flex;flex-wrap:wrap;gap:7px;max-height:76px;margin:0 0 8px 61px;overflow:auto;scrollbar-width:none}.attachment-tray:empty{display:none}.attachment-tray::-webkit-scrollbar{display:none}.attachment-chip{max-width:min(280px,72vw);height:34px;padding:0 8px 0 11px;border:1px solid rgba(101,204,203,.14);border-radius:999px;display:flex;align-items:center;gap:8px;color:#8facad;background:rgba(10,24,25,.78);font-size:.68rem}.attachment-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.attachment-chip button{width:24px;height:24px;border:0;border-radius:50%;color:#6e8c8d;background:transparent;cursor:pointer}.attachment-chip button:hover,.attachment-chip button:focus-visible{outline:0;color:#d8eeee;background:rgba(92,194,193,.12)}@media(max-width:560px){.composer{grid-template-columns:48px 48px minmax(0,1fr) 52px;gap:7px}.keyboard-toggle,.attachment-toggle{width:48px;height:48px}.send{width:52px;height:52px}.attachment-tray{margin-left:55px}.keyboard-toggle::before,.attachment-toggle::before{display:none}}
</style>`;

const RESPONSE_STYLE = `<style>
.answer.rich{display:grid;gap:.68rem}.answer.rich>*{margin:0}.answer.rich h2,.answer.rich h3{color:#edfafa;font-weight:560;letter-spacing:-.025em}.answer.rich h2{margin-top:.55rem;font-size:1.18em}.answer.rich h3{margin-top:.35rem;font-size:1.05em}.answer.rich p,.answer.rich li{color:#cbdada;line-height:1.68}.answer.rich ul,.answer.rich ol{margin:0;padding-left:1.28rem;display:grid;gap:.28rem}.answer.rich pre{max-width:100%;overflow:auto;padding:14px 16px;border:1px solid rgba(102,214,211,.12);border-radius:16px;color:#bfe3e1;background:rgba(5,16,17,.82);font:12.5px/1.62 ui-monospace,SFMono-Regular,Consolas,monospace;scrollbar-width:thin;scrollbar-color:rgba(87,194,193,.24) transparent}.answer.rich a{color:#82e2dd;text-decoration:none;border-bottom:1px solid rgba(130,226,221,.25)}.answer.rich a:hover,.answer.rich a:focus-visible{outline:0;color:#dcffff;border-color:#82e2dd}.answer.rich code:not(pre code){padding:.12em .34em;border-radius:6px;color:#bde4e2;background:rgba(86,190,189,.08);font:inherit}
.artifact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:9px;margin-top:14px}.artifact-grid:empty{display:none}.artifact-card{min-width:0;padding:13px 14px;border:1px solid rgba(102,214,211,.12);border-radius:16px;display:grid;gap:5px;color:#bdd0d0;background:rgba(6,18,19,.72);text-decoration:none;animation:artifact-in .3s cubic-bezier(.2,.8,.2,1)}.artifact-card strong{overflow:hidden;color:#e1eeee;font-size:.78rem;text-overflow:ellipsis;white-space:nowrap}.artifact-card span{overflow:hidden;color:#718c8d;font-size:.68rem;line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}.artifact-card[href]:hover,.artifact-card[href]:focus-visible{outline:0;border-color:rgba(102,214,211,.3);transform:translateY(-1px)}@keyframes artifact-in{from{opacity:0;filter:blur(3px);transform:translateY(7px)}}
</style>`;

const RESPONSE_PRESENTATION_STYLE = `<style>
.web-answer-context{--answer-accent:112,226,220;width:min(760px,100%);margin:2px 0 14px;display:flex;align-items:center;gap:10px;color:rgb(var(--answer-accent))}.web-answer-context[hidden]{display:none}.web-answer-context>i{width:19px;height:19px;flex:0 0 auto;border:1px solid rgba(var(--answer-accent),.34);border-radius:50%;background:radial-gradient(circle at 42% 38%,rgba(235,255,255,.9) 0 4%,rgba(var(--answer-accent),.7) 5% 12%,rgba(var(--answer-accent),.14) 14% 34%,transparent 36%),conic-gradient(from 20deg,transparent,rgba(var(--answer-accent),.6),transparent 35%,rgba(var(--answer-accent),.28),transparent 76%);box-shadow:0 0 17px rgba(var(--answer-accent),.22)}.web-answer-context>span{display:grid;gap:1px}.web-answer-context small{font:650 .56rem ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.13em;text-transform:uppercase}.web-answer-context strong{color:#6f898a;font-size:.64rem;font-weight:510}.web-answer-context[data-kind=code]{--answer-accent:156,181,255}.web-answer-context[data-kind=research]{--answer-accent:111,224,174}.web-answer-context[data-kind=plan]{--answer-accent:198,170,250}.web-answer-context:has(+ .answer.streaming)>i{animation:answer-orbit 1.25s cubic-bezier(.2,0,.2,1) infinite}
.answer.rich{gap:.72rem}.answer.rich h2,.answer.rich h3{font-weight:590;letter-spacing:-.028em}.answer.rich h2{font-size:1.2em}.answer.rich h3{font-size:1.06em}.answer.rich li::marker{color:#63bebb}.answer.rich hr{height:1px;border:0;background:linear-gradient(90deg,transparent,rgba(103,199,197,.19),transparent)}.answer.rich blockquote{margin:0;padding:2px 0 2px 14px;border-left:2px solid rgba(105,216,212,.32);color:#90a8a8}.web-code-card{overflow:hidden;border:1px solid rgba(116,167,229,.16);border-radius:17px;background:linear-gradient(145deg,rgba(8,17,24,.93),rgba(5,13,17,.9));box-shadow:0 18px 48px rgba(0,0,0,.18)}.web-code-card>header{min-height:38px;padding:0 12px 0 15px;border-bottom:1px solid rgba(132,172,216,.1);display:flex;align-items:center;justify-content:space-between;color:#748eaa;background:rgba(118,163,218,.035);font:620 .59rem ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase}.web-code-card pre{margin:0!important;border:0!important;border-radius:0!important;background:transparent!important}.web-code-card button{min-height:28px;padding:0 10px;border:1px solid rgba(134,180,232,.12);border-radius:999px;color:#8ea5bb;background:rgba(86,129,177,.07);cursor:pointer;font:600 .58rem system-ui,sans-serif}.web-code-card button:hover,.web-code-card button:focus-visible{outline:0;color:#dceeff;border-color:rgba(140,191,245,.27);background:rgba(103,154,211,.13)}.tok-comment{color:#657c80}.tok-string{color:#9ad8bd}.tok-number{color:#deb98a}.tok-keyword{color:#a7baff}.web-callout{--callout:111,215,210;padding:13px 15px;border:1px solid rgba(var(--callout),.14);border-left:3px solid rgba(var(--callout),.65);border-radius:4px 15px 15px 4px;display:grid;gap:5px;background:linear-gradient(90deg,rgba(var(--callout),.07),rgba(4,13,14,.36) 68%)}.web-callout[data-tone=tip]{--callout:103,220,169}.web-callout[data-tone=warning]{--callout:235,174,98}.web-callout[data-tone=result]{--callout:140,178,250}.web-callout strong{color:rgb(var(--callout));font-size:.72rem;letter-spacing:.015em}.web-callout p{margin:0!important}.web-table-wrap{max-width:100%;overflow:auto;border:1px solid rgba(105,210,207,.12);border-radius:15px;background:rgba(5,16,17,.62);scrollbar-width:thin}.web-table-wrap table{width:100%;border-collapse:collapse;font-size:.78rem}.web-table-wrap th,.web-table-wrap td{padding:10px 12px;border-bottom:1px solid rgba(105,210,207,.08);text-align:left;vertical-align:top}.web-table-wrap th{color:#dff3f2;background:rgba(94,199,196,.055);font-weight:620}.web-table-wrap td{color:#9db2b2}.web-table-wrap tr:last-child td{border-bottom:0}@keyframes answer-orbit{50%{opacity:.72;filter:brightness(1.2);transform:rotate(180deg) scale(1.08)}to{transform:rotate(360deg)}}
@media(max-width:560px){.web-answer-context{margin-bottom:11px}.answer.rich{gap:.64rem}.answer.rich h2{font-size:1.14em}.web-code-card{border-radius:15px}.web-table-wrap table{min-width:440px}}@media(prefers-reduced-motion:reduce){.web-answer-context:has(+ .answer.streaming)>i{animation:none}}
</style>`;

const COGNITION_STYLE = `<style>
.cognition{position:relative;width:min(560px,100%);margin:2px 0 15px;padding:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center;color:#486d6e}.cognition[hidden]{display:none}.cognition>span{font:650 .56rem ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.15em;text-transform:uppercase}.cognition ol{position:relative;min-width:0;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));list-style:none}.cognition ol::before{content:"";position:absolute;top:50%;right:5%;left:5%;height:1px;background:linear-gradient(90deg,rgba(91,222,218,.08),rgba(91,222,218,.2),rgba(91,222,218,.08));transform:translateY(-50%)}.cognition li{position:relative;z-index:1;display:grid;place-items:center;gap:5px;color:#3d5c5d;font:600 .5rem ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;transition:color .22s ease}.cognition li::before{content:"";width:5px;height:5px;border-radius:50%;background:#274546;box-shadow:0 0 0 4px #020607;transition:transform .24s cubic-bezier(.22,1,.36,1),background .2s ease,box-shadow .2s ease}.cognition li[data-active=true]{color:#91d9d6}.cognition li[data-active=true]::before{background:#7ce1dc;box-shadow:0 0 0 4px #020607,0 0 16px rgba(94,224,219,.5);transform:scale(1.35)}@media(max-width:560px){.cognition{grid-template-columns:1fr;gap:8px;margin-bottom:12px}.cognition>span{display:none}.cognition li{font-size:.46rem}}@media(prefers-reduced-motion:reduce){.cognition li,.cognition li::before{transition:none}}
</style>`;

/**
 * Unico motore grafico del Core pubblico. Il campo non ricrea oggetti o
 * gradienti a ogni frame: stato, geometria e budget cambiano senza avviare
 * animazioni concorrenti. La metrica esposta serve esclusivamente alla QA.
 */
// #region 01 — Runtime cosmico di NexusNXS AI

function publicAiCosmicRuntime(corePalette, presentation) {
  const button = document.getElementById('core');
  const canvas = document.getElementById('coreCanvas');
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  const exchange = document.querySelector('.exchange');
  const userPrompt = document.getElementById('userPrompt');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const connection = navigator.connection || {};
  const memory = Number(navigator.deviceMemory || 4);
  const threads = Number(navigator.hardwareConcurrency || 4);
  const compact = Math.min(innerWidth, innerHeight) < 620;
  const constrained = connection.saveData || memory <= 3 || threads <= 4;
  const tierName = reduced || constrained ? 'efficient' : (memory >= 8 && threads >= 8 && !compact ? 'full' : 'balanced');
  const tier = presentation.qualityTiers[tierName];
  const count = Math.max(42, Math.round((compact ? 104 : 120) * tier.particleScale));
  const linkCount = Math.max(18, Math.round(count * .34));
  const angle = new Float32Array(count);
  const seed = new Float32Array(count);
  const speed = new Float32Array(count);
  const ring = new Uint8Array(count);
  const layer = new Uint8Array(count);
  const positionX = new Float32Array(count);
  const positionY = new Float32Array(count);
  const links = new Uint16Array(linkCount * 2);
  const random = (value) => {
    const generated = Math.sin(value * 91.733) * 43758.5453;
    return generated - Math.floor(generated);
  };
  for (let index = 0; index < count; index += 1) {
    ring[index] = index % 6;
    layer[index] = index % 7 === 0 ? 3 : index % 4 === 0 ? 2 : index % 6 === 0 ? 0 : 1;
    angle[index] = random(index + .1) * Math.PI * 2;
    seed[index] = random(index + 7.3);
    speed[index] = .055 + random(index + 2.1) * .16;
  }
  for (let index = 0; index < linkCount; index += 1) {
    links[index * 2] = index * 3 % count;
    links[index * 2 + 1] = (index * 11 + 17) % count;
  }

  let frame = 0;
  let state = 'idle';
  let energy = .17;
  let color = corePalette.idle;
  let pointerX = 0;
  let pointerY = 0;
  let pointerActive = 0;
  let transitionEnergy = 0;
  let width = 1;
  let height = 1;
  let centerX = .5;
  let centerY = .5;
  let size = 1;
  let lastFrame = 0;
  let lastMetric = performance.now();
  let metricFrames = 0;
  let longFrames = 0;
  let aura = null;
  let lens = null;

  const metrics = { tier: tierName, targetFps: tier.targetFps, sampledFps: 0, longFrames: 0, particleCount: count };
  globalThis.nexusCosmicMetrics = metrics;
  const rgba = (alpha) => `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
  const energyFor = (value) => {
    if (value === 'executing') return .94;
    if (value === 'responding' || value === 'speaking') return .84;
    if (value === 'thinking' || value === 'transcribing') return .72;
    if (value === 'listening') return .62;
    if (value === 'ready') return .44;
    if (value === 'error') return .58;
    return .22;
  };
  const rebuildPaint = () => {
    aura = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, size * .46);
    aura.addColorStop(0, rgba(.14 + energy * .16));
    aura.addColorStop(.22, rgba(.07 + energy * .08));
    aura.addColorStop(.64, rgba(.018 + energy * .025));
    aura.addColorStop(1, rgba(0));
    lens = context.createRadialGradient(centerX - size * .018, centerY - size * .022, 0, centerX, centerY, size * .105);
    lens.addColorStop(0, 'rgba(235,255,255,.96)');
    lens.addColorStop(.08, rgba(.92));
    lens.addColorStop(.28, rgba(.45 + energy * .2));
    lens.addColorStop(.68, rgba(.08 + energy * .09));
    lens.addColorStop(1, rgba(0));
  };
  const readState = () => {
    const next = button.dataset.state || 'idle';
    if (next !== state) {
      state = next;
      energy = energyFor(state);
      transitionEnergy = 1;
      color = corePalette[state] || corePalette.idle;
      rebuildPaint();
    }
  };
  const readExchange = () => document.body.classList.toggle('has-response', Boolean(userPrompt.textContent));
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dprLimit = tierName === 'efficient' ? 1 : tierName === 'balanced' ? 1.35 : 1.55;
    const dpr = Math.min(devicePixelRatio || 1, dprLimit);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    centerX = width / 2;
    centerY = height / 2;
    size = Math.min(width, height);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildPaint();
  };
  const schedule = () => {
    if (!document.hidden) frame = requestAnimationFrame(draw);
  };
  const draw = (now) => {
    const elapsed = now - lastFrame;
    const interval = reduced ? 1000 : 1000 / tier.targetFps;
    if (elapsed + .35 < interval) return schedule();
    lastFrame = now - (elapsed % interval);
    metricFrames += 1;
    if (elapsed > 34) longFrames += 1;
    if (now - lastMetric >= 1000) {
      metrics.sampledFps = Math.round(metricFrames * 1000 / (now - lastMetric));
      metrics.longFrames = longFrames;
      metricFrames = 0;
      longFrames = 0;
      lastMetric = now;
    }
    const time = reduced ? 0 : now / 1000;
    transitionEnergy = reduced ? 0 : Math.max(0, transitionEnergy - elapsed / 620);
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = 'lighter';
    context.fillStyle = aura;
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 5; index += 1) {
      context.save();
      context.translate(centerX, centerY);
      context.rotate(time * (index % 2 ? -.024 : .018) * (1 + energy) + index * .41);
      context.scale(1, index % 2 ? .82 : .94);
      context.beginPath();
      context.setLineDash(index % 2 ? [size * .025, size * .045] : [size * .09, size * .025]);
      context.lineDashOffset = time * (index % 2 ? 5 : -3);
      context.strokeStyle = rgba(.035 + energy * .026);
      context.lineWidth = .48 + index * .05;
      context.arc(0, 0, size * (.14 + index * .077), 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
    for (let index = 0; index < count; index += 1) {
      const pointLayer = layer[index];
      const direction = ring[index] % 2 ? 1 : -1;
      const turn = angle[index] + time * speed[index] * direction * (.72 + energy * .72);
      const base = pointLayer === 0 ? .045 + seed[index] * .125
        : pointLayer === 2 ? .12 + seed[index] * .22
          : pointLayer === 3 ? .39 + seed[index] * .095
            : .205 + ring[index] * .047 + (seed[index] - .5) * .012;
      const pulse = 1 + Math.sin(time * (1.15 + energy * 2.5) + seed[index] * 8) * (.01 + energy * .026) + transitionEnergy * Math.sin(seed[index] * 19 + time * 4.2) * .045;
      const radius = size * base * pulse;
      const flatten = pointLayer === 3 ? .72 : pointLayer === 2 ? .9 : 1;
      const rawX = centerX + Math.cos(turn) * radius;
      const rawY = centerY + Math.sin(turn) * radius * flatten;
      const deltaX = rawX - pointerX;
      const deltaY = rawY - pointerY;
      const distance = pointerActive ? Math.hypot(deltaX, deltaY) : size;
      const influence = pointerActive * Math.max(0, 1 - distance / (size * .33));
      const shift = (pointLayer === 3 ? 3 : 7) * influence;
      positionX[index] = rawX + (distance ? deltaX / distance : 0) * shift;
      positionY[index] = rawY + (distance ? deltaY / distance : 0) * shift;
    }
    for (let index = 0; index < linkCount; index += 1) {
      const from = links[index * 2];
      const to = links[index * 2 + 1];
      const deltaX = positionX[from] - positionX[to];
      const deltaY = positionY[from] - positionY[to];
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < size * .34 && (layer[from] === 2 || layer[to] === 2 || distance < size * .18)) {
        context.beginPath();
        context.strokeStyle = rgba(Math.max(.018, .12 + energy * .08 - distance / size * .45));
        context.lineWidth = .38 + energy * .18;
        context.moveTo(positionX[from], positionY[from]);
        context.lineTo(positionX[to], positionY[to]);
        context.stroke();
      }
    }
    for (let index = 0; index < count; index += 1) {
      const pointLayer = layer[index];
      const dot = (pointLayer === 0 ? 1.1 + energy * .8 : pointLayer === 2 ? .82 + energy * .42 : pointLayer === 3 ? .5 : .66 + energy * .26) + transitionEnergy * .34;
      const alpha = Math.min(.92, (pointLayer === 3 ? .1 + energy * .07 : pointLayer === 2 ? .24 + energy * .28 : .19 + energy * .25) + transitionEnergy * .16);
      context.beginPath();
      context.fillStyle = rgba(alpha);
      context.arc(positionX[index], positionY[index], dot, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = lens;
    context.beginPath();
    context.arc(centerX, centerY, size * .105, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = 'source-over';
    schedule();
  };

  button.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointerX = event.clientX - rect.left;
    pointerY = event.clientY - rect.top;
    pointerActive = tier.pointerScale;
  }, { passive: true });
  button.addEventListener('pointerleave', () => { pointerActive = 0; }, { passive: true });
  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(readExchange).observe(exchange, { subtree: true, childList: true, characterData: true });
  new MutationObserver(readState).observe(button, { attributes: true, attributeFilter: ['data-state'] });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(frame);
    if (!document.hidden) {
      lastFrame = performance.now();
      schedule();
    }
  });
  resize();
  readState();
  readExchange();
  schedule();
}

// #endregion

// #region 02 — Composizione e pubblicazione della pagina

function publicAiCosmicCoreScript({ palette, presentation }) {
  return `<script>(${publicAiCosmicRuntime.toString()})(${JSON.stringify(palette)},${JSON.stringify(presentation)});</script>`;
}

/** Renderer DOM sicuro condiviso dalla generazione e dalla risposta conclusa. */
function publicAnswerPresentationRuntime(answer) {
  const context = document.getElementById('answerContext');
  const contextKind = document.getElementById('answerKind');
  const contextStatus = document.getElementById('answerStatus');
  const kindOf = (text) => /```|\b(?:function|class|const|SELECT|CREATE TABLE|def )\b/u.test(text) ? 'code'
    : /\[[^\]]+\]\(https:\/\/|\b(?:fonti|sources|ricerca web)\b/iu.test(text) ? 'research'
      : /^#{1,4}\s|(?:^|\n)\s*(?:\d+[.)]|[-*])\s+/mu.test(text) ? 'plan' : 'answer';
  const labels = { answer: 'Risposta', plan: 'Percorso', research: 'Ricerca', code: 'Codice' };
  const updateContext = (text, streaming) => {
    const kind = kindOf(text);
    context.hidden = !text.trim();
    context.dataset.kind = kind;
    contextKind.textContent = labels[kind];
    contextStatus.textContent = streaming ? 'In composizione' : 'Risposta pronta';
  };
  const hideAnswerContext = () => { context.hidden = true; };
  const safeStreaming = (text) => {
    let safe = String(text || '');
    for (const token of ['**', '`']) {
      if ((safe.split(token).length - 1) % 2) {
        const at = safe.lastIndexOf(token);
        safe = safe.slice(0, at) + safe.slice(at + token.length);
      }
    }
    const stars = [...safe.matchAll(/(?<!\*)\*(?!\*)/g)];
    if (stars.length % 2) {
      const at = stars.at(-1).index;
      safe = safe.slice(0, at) + safe.slice(at + 1);
    }
    return safe;
  };
  const appendInline = (parent, text) => {
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)|https:\/\/[^\s<>()]+)/g;
    let cursor = 0;
    for (const match of String(text).matchAll(pattern)) {
      if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
      const raw = match[0];
      let node;
      if (raw.startsWith('`')) { node = document.createElement('code'); node.textContent = raw.slice(1, -1); }
      else if (raw.startsWith('**')) { node = document.createElement('strong'); node.textContent = raw.slice(2, -2); }
      else if (raw.startsWith('*')) { node = document.createElement('em'); node.textContent = raw.slice(1, -1); }
      else { node = document.createElement('a'); node.href = match[3] || raw; node.target = '_blank'; node.rel = 'noopener noreferrer'; node.textContent = match[2] || raw; }
      parent.append(node);
      cursor = match.index + raw.length;
    }
    if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
  };
  const appendHighlightedCode = (parent, code) => {
    const pattern = /(\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|for|while|class|interface|type|import|from|export|async|await|try|catch|throw|new|true|false|null|undefined|def|self|elif|except|with|as|SELECT|FROM|WHERE|JOIN|CREATE|TABLE|INSERT|UPDATE|DELETE)\b|\b\d+(?:\.\d+)?\b)/gmi;
    let cursor = 0;
    for (const match of code.matchAll(pattern)) {
      if (match.index > cursor) parent.append(document.createTextNode(code.slice(cursor, match.index)));
      const token = match[0];
      const span = document.createElement('span');
      span.className = /^(?:\/\/|#)/.test(token) ? 'tok-comment' : /^["']/.test(token) ? 'tok-string' : /^\d/.test(token) ? 'tok-number' : 'tok-keyword';
      span.textContent = token;
      parent.append(span);
      cursor = match.index + token.length;
    }
    if (cursor < code.length) parent.append(document.createTextNode(code.slice(cursor)));
  };
  const appendCode = (fragment, language, code) => {
    const card = document.createElement('section'); card.className = 'web-code-card';
    const meta = document.createElement('header'); const label = document.createElement('span'); const copy = document.createElement('button');
    label.textContent = language || 'codice'; copy.type = 'button'; copy.textContent = 'Copia';
    copy.onclick = async () => { try { await navigator.clipboard.writeText(code); copy.textContent = 'Copiato'; } catch { copy.textContent = 'Non riuscito'; } setTimeout(() => { copy.textContent = 'Copia'; }, 1400); };
    meta.append(label, copy); const pre = document.createElement('pre'); const codeNode = document.createElement('code'); appendHighlightedCode(codeNode, code); pre.append(codeNode); card.append(meta, pre); fragment.append(card);
  };
  const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
  const formatAnswer = (text, options = {}) => {
    const streaming = Boolean(options.streaming);
    const source = streaming ? safeStreaming(text) : String(text || '');
    updateContext(source, streaming);
    const fragment = document.createDocumentFragment();
    const lines = source.replace(/\r/g, '').split('\n');
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index += 1; continue; }
      const fence = line.match(/^```([\w#+.-]*)\s*$/);
      if (fence) { const code = []; index += 1; while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]); if (index < lines.length) index += 1; appendCode(fragment, fence[1], code.join('\n')); continue; }
      const callout = line.match(/^>\s*\[!(NOTE|TIP|WARNING|RESULT)\]\s*(.*)$/i);
      if (callout) { const card = document.createElement('aside'); card.className = 'web-callout'; card.dataset.tone = callout[1].toLowerCase(); const title = document.createElement('strong'); title.textContent = callout[2] || ({ note: 'Nota', tip: 'Suggerimento', warning: 'Attenzione', result: 'Risultato' })[card.dataset.tone]; card.append(title); index += 1; const body = []; while (index < lines.length && /^>\s?/.test(lines[index])) body.push(lines[index++].replace(/^>\s?/, '')); if (body.length) { const paragraph = document.createElement('p'); appendInline(paragraph, body.join(' ')); card.append(paragraph); } fragment.append(card); continue; }
      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) { const node = document.createElement(heading[1].length === 1 ? 'h2' : 'h3'); appendInline(node, heading[2]); fragment.append(node); index += 1; continue; }
      if (/^\s*---+\s*$/.test(line)) { fragment.append(document.createElement('hr')); index += 1; continue; }
      if (line.includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1]) && lines[index + 1].includes('|')) { const table = document.createElement('table'); const head = document.createElement('thead'); const headRow = document.createElement('tr'); const headers = cells(line); for (const value of headers) { const cell = document.createElement('th'); appendInline(cell, value); headRow.append(cell); } head.append(headRow); table.append(head); index += 2; const body = document.createElement('tbody'); while (index < lines.length && lines[index].includes('|') && lines[index].trim()) { const row = document.createElement('tr'); const values = cells(lines[index++]); for (let cellIndex = 0; cellIndex < headers.length; cellIndex += 1) { const cell = document.createElement('td'); appendInline(cell, values[cellIndex] || ''); row.append(cell); } body.append(row); } table.append(body); const wrap = document.createElement('div'); wrap.className = 'web-table-wrap'; wrap.append(table); fragment.append(wrap); continue; }
      const bullet = line.match(/^\s*([-*]|\d+[.)])\s+(.+)$/);
      if (bullet) { const ordered = /^\d/.test(bullet[1]); const list = document.createElement(ordered ? 'ol' : 'ul'); while (index < lines.length) { const itemMatch = lines[index].match(/^\s*([-*]|\d+[.)])\s+(.+)$/); if (!itemMatch || /^\d/.test(itemMatch[1]) !== ordered) break; const item = document.createElement('li'); appendInline(item, itemMatch[2]); list.append(item); index += 1; } fragment.append(list); continue; }
      if (/^>\s?/.test(line)) { const quote = document.createElement('blockquote'); const values = []; while (index < lines.length && /^>\s?/.test(lines[index])) values.push(lines[index++].replace(/^>\s?/, '')); appendInline(quote, values.join(' ')); fragment.append(quote); continue; }
      const paragraph = document.createElement('p'); const values = [line.trim()]; index += 1;
      while (index < lines.length && lines[index].trim() && !/^(?:```|#{1,4}\s|>\s|\s*---+\s*$|\s*(?:[-*]|\d+[.)])\s+)/.test(lines[index]) && !(lines[index].includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1]))) values.push(lines[index++].trim());
      appendInline(paragraph, values.join(' ')); fragment.append(paragraph);
    }
    answer.replaceChildren(fragment); answer.classList.add('rich'); answer.dataset.kind = kindOf(source);
  };
  return { formatAnswer, hideAnswerContext };
}

function experienceScript({ windowsDownload = WINDOWS_DOWNLOAD, androidDownload = ANDROID_DOWNLOAD } = {}) {
  const script = `<script>
(()=>{const byId=id=>document.getElementById(id),prompt=byId('prompt'),userPrompt=byId('userPrompt'),answer=byId('answer'),phase=byId('phase'),send=byId('send'),keyboard=byId('keyboard'),core=byId('core'),download=byId('download'),sheet=byId('downloadSheet'),installLink=byId('installLink'),unavailable=byId('unavailable'),memoryClear=byId('memoryClear');let token='',busy=false,turns=[],recording=null,recordingTimer=0,currentAudio=null,rafFlush=0,pendingAnswer='';const runtime={voiceState:'idle'};globalThis.nexusDemoState=runtime;const language=()=>String(navigator.language||'it-IT').slice(0,16);const setVoiceState=value=>{runtime.voiceState=value;document.body.dataset.voiceState=value;core.dataset.state=value;const labels={idle:'Core pronto',requesting:'Autorizza il microfono',listening:'Ti ascolto',transcribing:'Comprendo la voce',thinking:'Sto ragionando',responding:'Sto rispondendo',speaking:'Sto parlando',ready:'Risposta pronta',error:'Non disponibile'};requestAnimationFrame(()=>{const caption=byId('coreCaption');if(caption)caption.textContent=labels[value]||labels.idle})};const setPhase=(value,error=false)=>{phase.textContent=value;phase.className=error?'phase error':'phase';if(error)setVoiceState('error')};const installation=()=>{let id=localStorage.getItem('nxs.demo.installation');if(!id){id=globalThis.crypto?.randomUUID?.()||('019fa53a-'+Date.now().toString(16)+'-'+Math.random().toString(16).slice(2));localStorage.setItem('nxs.demo.installation',id)}return id};const openDb=()=>new Promise((resolve,reject)=>{if(!globalThis.indexedDB)return reject(new Error('IndexedDB non disponibile'));const request=indexedDB.open('nexusnxs-demo',1);request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});async function memoryRead(){try{const db=await openDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('state','readonly'),request=tx.objectStore('state').get('turns');request.onsuccess=()=>resolve(Array.isArray(request.result)?request.result:[]);request.onerror=()=>reject(request.error)})}catch{try{return JSON.parse(localStorage.getItem('nxs.demo.memory')||'[]')}catch{return[]}}}async function memoryWrite(){turns=turns.slice(-24).map(turn=>({role:turn.role==='assistant'?'assistant':'user',content:String(turn.content||'').slice(0,4000)}));try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(turns,'turns');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{localStorage.setItem('nxs.demo.memory',JSON.stringify(turns))}}async function memoryReset(){turns=[];try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').delete('turns');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{}localStorage.removeItem('nxs.demo.memory');userPrompt.textContent='';answer.textContent='';setPhase('Memoria locale cancellata');setTimeout(()=>setPhase(''),1300)}async function restore(){turns=await memoryRead();const recentUser=[...turns].reverse().find(turn=>turn.role==='user'),recentAnswer=[...turns].reverse().find(turn=>turn.role==='assistant');if(recentUser&&recentAnswer){userPrompt.textContent=recentUser.content;answer.textContent=recentAnswer.content;setPhase('Continuità ripristinata');setVoiceState('ready');setTimeout(()=>setPhase(''),1300)}}async function session(){if(token)return token;setPhase('Preparo la sessione…');const response=await fetch('/api/guest/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({installationId:installation()})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Servizio momentaneamente non disponibile');token=data.token;return token}function flushAnswer(){rafFlush=0;if(pendingAnswer){answer.textContent+=pendingAnswer;pendingAnswer=''}}function queueAnswer(value){pendingAnswer+=String(value||'');if(!rafFlush)rafFlush=requestAnimationFrame(flushAnswer)}async function speak(text){if(!text)return;try{setVoiceState('speaking');setPhase('Risposta vocale…');const credential=await session(),response=await fetch('/api/guest/voice/synthesize',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify({text:text.slice(0,4000),language:language()})});if(!response.ok)throw new Error('Voce non disponibile');const url=URL.createObjectURL(await response.blob()),audio=new Audio(url);currentAudio=audio;await new Promise((resolve,reject)=>{audio.onended=resolve;audio.onerror=reject;audio.play().catch(reject)});URL.revokeObjectURL(url);currentAudio=null;setVoiceState('ready');setPhase('')}catch{currentAudio=null;setVoiceState('ready');setPhase('Risposta pronta')}}async function ask(value,{voice=false}={}){const text=String(value??prompt.value).trim();if(!text||busy)return;busy=true;send.disabled=true;document.body.classList.remove('keyboard-open');prompt.blur();userPrompt.textContent=text;answer.textContent='';pendingAnswer='';answer.classList.add('streaming');prompt.value='';prompt.style.height='auto';setVoiceState('thinking');setPhase('Comprendo la richiesta…');const previous=turns.slice(-24);try{const credential=await session();const response=await fetch('/api/guest/messages/stream',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify({text,history:previous,model:'nexus-fast',clientMessageId:globalThis.crypto?.randomUUID?.()})});if(!response.ok){const data=await response.json().catch(()=>({}));if(response.status===401)token='';throw new Error(data.error||'Servizio momentaneamente non disponibile')}if(!response.body)throw new Error('Streaming non disponibile');const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';while(true){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});const lines=buffer.split('\\n');buffer=lines.pop()||'';for(const line of lines){if(!line.trim())continue;const frame=JSON.parse(line);if(frame.type==='phase'){setVoiceState(frame.activity?.phase==='done'?'ready':'thinking');setPhase(frame.activity?.text||'NexusNXS sta lavorando…')}if(frame.type==='token'){setVoiceState('responding');queueAnswer(frame.token)}if(frame.type==='complete'&&!answer.textContent&&!pendingAnswer)queueAnswer(frame.message||'');if(frame.type==='error')throw new Error(frame.error||'Risposta non completata')}}flushAnswer();const responseText=answer.textContent.trim();turns.push({role:'user',content:text},{role:'assistant',content:responseText});await memoryWrite();answer.classList.remove('streaming');setVoiceState('ready');setPhase('Risposta pronta');if(voice)await speak(responseText);else setTimeout(()=>{if(!busy)setPhase('')},1200)}catch(error){answer.classList.remove('streaming');setPhase(error.message||'Servizio momentaneamente non disponibile',true)}finally{busy=false;send.disabled=!prompt.value.trim()}}function encodeWav(buffer){const rate=16000,channels=buffer.numberOfChannels,sourceRate=buffer.sampleRate,length=Math.max(1,Math.floor(buffer.length*rate/sourceRate)),wav=new ArrayBuffer(44+length*2),view=new DataView(wav);const write=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))};write(0,'RIFF');view.setUint32(4,36+length*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,length*2,true);const source=Array.from({length:channels},(_,index)=>buffer.getChannelData(index));for(let i=0;i<length;i++){const position=i*sourceRate/rate,low=Math.floor(position),high=Math.min(buffer.length-1,low+1),mix=source.reduce((sum,channel)=>sum+channel[low]+(channel[high]-channel[low])*(position-low),0)/channels;view.setInt16(44+i*2,Math.max(-1,Math.min(1,mix))*32767,true)}return new Blob([wav],{type:'audio/wav'})}async function transcribe(blob){try{setVoiceState('transcribing');setPhase('Comprendo la voce…');const context=new (globalThis.AudioContext||globalThis.webkitAudioContext)({sampleRate:16000}),decoded=await context.decodeAudioData(await blob.arrayBuffer()),wav=encodeWav(decoded);await context.close();const credential=await session(),response=await fetch('/api/guest/voice/transcribe',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'audio/wav'},body:wav});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Non ho riconosciuto la frase');await ask(data.text,{voice:true})}catch(error){setPhase(error.message||'Voce non disponibile',true)}}async function toggleVoice(){if(currentAudio){currentAudio.pause();currentAudio=null;setVoiceState('ready');setPhase('');return}if(recording?.state==='recording'){recording.stop();return}if(busy)return;if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder||!(globalThis.AudioContext||globalThis.webkitAudioContext)){document.body.classList.add('keyboard-open');prompt.focus();setPhase('Il microfono non è disponibile in questo browser',true);return}try{setVoiceState('requesting');setPhase('Autorizza il microfono…');const stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}}),chunks=[],recorder=new MediaRecorder(stream,{audioBitsPerSecond:64000});recording=recorder;recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};recorder.onstop=()=>{clearTimeout(recordingTimer);stream.getTracks().forEach(track=>track.stop());recording=null;transcribe(new Blob(chunks,{type:recorder.mimeType||'audio/webm'}))};recorder.start(250);setVoiceState('listening');setPhase('Ti ascolto · tocca ancora per inviare');recordingTimer=setTimeout(()=>recorder.state==='recording'&&recorder.stop(),10000)}catch(error){setPhase(error?.name==='NotAllowedError'?'Microfono non autorizzato':'Microfono non disponibile',true)}}function toggleKeyboard(){const open=document.body.classList.toggle('keyboard-open');if(open)setTimeout(()=>prompt.focus(),120);else prompt.blur()}function detectDevice(){const ua=navigator.userAgent||'',platform=navigator.userAgentData?.platform||navigator.platform||'';if(/android/i.test(ua))return{title:'NexusNXS per Android',note:'Android 10 o successivo · APK Preview',label:'Scarica per Android',url:'${androidDownload}'};if(/windows|win32|win64/i.test(platform+' '+ua))return{title:'NexusNXS per Windows',note:'Windows 11 x64 · Installer Preview',label:'Scarica per Windows',url:'${windowsDownload}'};const name=/iphone|ipad|ipod/i.test(ua)?'iOS':/mac/i.test(platform)?'macOS':/linux/i.test(platform)?'Linux':'questo dispositivo';return{title:'App non ancora disponibile',note:'La demo web resta utilizzabile su '+name+'.',label:'',url:''}}function prepareDownload(){const device=detectDevice();byId('sheetTitle').textContent=device.title;byId('deviceNote').textContent=device.note;if(device.url){installLink.hidden=false;unavailable.hidden=true;installLink.href=device.url;installLink.textContent=device.label}else{installLink.hidden=true;unavailable.hidden=false;unavailable.textContent='NexusNXS non è ancora distribuito per questo sistema. Puoi continuare a usare questa demo dal browser.'}}function openDownload(){prepareDownload();if(sheet.showModal)sheet.showModal();else sheet.setAttribute('open','')}function closeDownload(){if(sheet.close)sheet.close();else sheet.removeAttribute('open')}core.addEventListener('click',event=>{event.stopImmediatePropagation();core.animate([{transform:'scale(1)'},{transform:'scale(.965)'},{transform:'scale(1)'}],{duration:220,easing:'cubic-bezier(.2,0,0,1)'});toggleVoice()},{capture:true});keyboard.addEventListener('click',toggleKeyboard);send.addEventListener('click',()=>ask());prompt.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();ask()}});prompt.addEventListener('input',()=>{prompt.style.height='auto';prompt.style.height=Math.min(prompt.scrollHeight,126)+'px';send.disabled=!prompt.value.trim()});download.addEventListener('click',openDownload);byId('sheetClose').addEventListener('click',closeDownload);sheet.addEventListener('click',event=>{if(event.target===sheet)closeDownload()});memoryClear.addEventListener('click',memoryReset);send.disabled=true;prepareDownload();restore();setVoiceState('idle')})();
</script>`;
  const voiceMonitor = "function stopVoiceMonitor(){if(!voiceMonitor)return;cancelAnimationFrame(voiceMonitor.frame);try{voiceMonitor.source.disconnect();voiceMonitor.analyser.disconnect()}catch{}voiceMonitor.context.close().catch(()=>{});voiceMonitor=null}function monitorVoice(stream,recorder){stopVoiceMonitor();const AudioEngine=globalThis.AudioContext||globalThis.webkitAudioContext,context=new AudioEngine(),source=context.createMediaStreamSource(stream),analyser=context.createAnalyser(),samples=new Uint8Array(512),startedAt=performance.now();let heardSpeech=false,lastSpeechAt=startedAt,noiseFloor=.009,voicedFor=0;analyser.fftSize=1024;analyser.smoothingTimeConstant=.3;source.connect(analyser);const sample=()=>{if(recorder.state!=='recording')return stopVoiceMonitor();analyser.getByteTimeDomainData(samples);let power=0;for(const value of samples){const centered=(value-128)/128;power+=centered*centered}const level=Math.sqrt(power/samples.length),now=performance.now(),elapsed=now-startedAt;if(elapsed<420){noiseFloor=noiseFloor*.86+level*.14}else{const threshold=Math.max(.016,Math.min(.065,noiseFloor*2.35+.006));if(level>threshold){voicedFor+=16;if(voicedFor>=160){heardSpeech=true;lastSpeechAt=now}}else{voicedFor=Math.max(0,voicedFor-24);if(!heardSpeech)noiseFloor=noiseFloor*.985+level*.015}}if(heardSpeech&&now-lastSpeechAt>780&&elapsed>720)return recorder.stop();voiceMonitor.frame=requestAnimationFrame(sample)};voiceMonitor={context,source,analyser,frame:requestAnimationFrame(sample)}}";
  const attachmentRuntime = "function renderAttachments(){attachmentTray.replaceChildren();for(const [index,file]of pendingAttachments.entries()){const chip=document.createElement('div'),name=document.createElement('span'),remove=document.createElement('button');chip.className='attachment-chip';name.textContent=file.name;remove.type='button';remove.setAttribute('aria-label','Rimuovi '+file.name);remove.textContent='×';remove.onclick=()=>{pendingAttachments.splice(index,1);renderAttachments()};chip.append(name,remove);attachmentTray.append(chip)}attachment.dataset.count=String(pendingAttachments.length)}function resetAttachments(){pendingAttachments=[];attachmentInput.value='';renderAttachments()}function readAttachment(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:String(file.name||'allegato').slice(0,120),mime:file.type||'application/octet-stream',data:String(reader.result||'').split(',').pop()||''});reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)})}async function chooseAttachments(){const accepted=[...attachmentInput.files].slice(0,2);if(!accepted.length)return;try{for(const file of accepted){if(file.size>1500000)throw new Error('Ogni allegato può pesare al massimo 1,5 MB');const allowed=/^(image\/(?:jpeg|png|webp)|application\/(?:pdf|json|xml)|text\/(?:plain|markdown|csv|xml))$/i;if(!allowed.test(file.type))throw new Error('Formato allegato non supportato');}pendingAttachments=await Promise.all(accepted.map(readAttachment));renderAttachments();setPhase(pendingAttachments.length===1?'Allegato pronto':'Allegati pronti');document.body.classList.add('keyboard-open');prompt.focus()}catch(error){resetAttachments();setPhase(error.message||'Allegato non valido',true)}}attachment.onclick=()=>attachmentInput.click();attachmentInput.onchange=chooseAttachments;renderAttachments();";
  const feedbackRuntime = "function showFeedback(){responseActions.hidden=!(userPrompt.textContent.trim()&&answer.textContent.trim());feedbackAction.disabled=false;feedbackAction.textContent='Migliora NexusNXS';feedbackStatus.textContent='';settleAnswerPosition()}async function contributeFeedback(){if(feedbackAction.disabled||!userPrompt.textContent.trim()||!answer.textContent.trim())return;feedbackAction.disabled=true;feedbackStatus.textContent='Invio…';try{const credential=await session(),response=await fetch('/api/guest/feedback',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify({prompt:userPrompt.textContent.trim(),response:answer.textContent.trim(),model:'nexus-fast',mode:'fast',consent:true})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Contributo non disponibile');feedbackAction.textContent='Contributo inviato';feedbackStatus.textContent='In revisione'}catch(error){feedbackAction.disabled=false;feedbackStatus.textContent=error.message||'Riprova più tardi'}}feedbackAction.addEventListener('click',contributeFeedback);";
  const responseActionsRuntime = "function answerSource(){return String(rawAnswer||answer.textContent||'').trim()}function markAction(button,label){button.dataset.done='true';button.textContent=label;setTimeout(()=>{button.dataset.done='false';button.textContent=button.dataset.label},1300)}async function copyAnswer(){const text=answerSource();if(!text)return;try{await navigator.clipboard.writeText(text);markAction(copyResponse,'Copiato')}catch{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();document.execCommand('copy');area.remove();markAction(copyResponse,'Copiato')}}function deepenAnswer(){if(busy||!answerSource())return;ask('Approfondisci la risposta precedente con maggiori dettagli pratici, mantenendo una struttura chiara e senza ripetizioni.')}function exportAnswer(){const text=answerSource();if(!text)return;const blob=new Blob([text+'\\n'],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='nexusnxs-risposta.md';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);markAction(exportResponse,'Esportato')}copyResponse.addEventListener('click',copyAnswer);deepenResponse.addEventListener('click',deepenAnswer);exportResponse.addEventListener('click',exportAnswer);";
  const artifactRuntime = "function capability(id){return runtime.capabilities[id]?.state||'unavailable'}function renderArtifacts(values){artifacts.replaceChildren();for(const item of Array.isArray(values)?values:[]){const card=document.createElement(item.url?'a':'article');card.className='artifact-card';if(item.url){card.href=item.url;card.target='_blank';card.rel='noopener noreferrer'}const title=document.createElement('strong'),content=document.createElement('span');title.textContent=String(item.title||'Risultato');content.textContent=String(item.content||'').slice(0,240);card.append(title,content);artifacts.append(card)}}";
  const streamFollowRuntime = "const sendArrow='<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 19V5m0 0-6 6m6-6 6 6\"/></svg>',sendStop='<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"7\" y=\"7\" width=\"10\" height=\"10\" rx=\"2\"/></svg>';function setSendMode(stopping){send.dataset.mode=stopping?'stop':'send';send.setAttribute('aria-label',stopping?'Interrompi risposta':'Invia');send.innerHTML=stopping?sendStop:sendArrow;send.disabled=stopping?false:!prompt.value.trim()}async function stopGeneration(){if(!busy)return;stopRequested=true;requestAbort?.abort();const id=requestMessageId;if(token&&id)fetch('/api/guest/messages/cancel',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({clientMessageId:id}),keepalive:true}).catch(()=>{})}function answerBottom(){return Math.max(0,document.documentElement.scrollHeight-innerHeight)}function followAnswer(){if(!followStream)return;const now=performance.now();if(now-lastAnswerScroll<96)return;lastAnswerScroll=now;requestAnimationFrame(()=>window.scrollTo({top:answerBottom(),behavior:'auto'}))}function settleAnswerPosition(){if(!followStream)return;requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:answerBottom(),behavior:'auto'})))}window.addEventListener('wheel',()=>{if(busy)followStream=false},{passive:true});window.addEventListener('touchstart',()=>{if(busy)followStream=false},{passive:true});window.addEventListener('keydown',event=>{if(busy&&['PageUp','Home','ArrowUp'].includes(event.key))followStream=false});";
  const answerFormattingRuntime = `const {formatAnswer,hideAnswerContext}=(${publicAnswerPresentationRuntime.toString()})(answer);`;
  return script
    .replace('globalThis.nexusDemoState=runtime', 'globalThis.nexusAiState=runtime')
    .replace("pendingAnswer='';const runtime", "pendingAnswer='',rawAnswer='',followStream=true,lastAnswerScroll=0,requestAbort=null,requestMessageId='',stopRequested=false;const runtime")
    .replace("function flushAnswer(){rafFlush=0;if(pendingAnswer){answer.textContent+=pendingAnswer;pendingAnswer=''}}", "function flushAnswer(){rafFlush=0;if(pendingAnswer){rawAnswer+=pendingAnswer;pendingAnswer='';answer.classList.remove('rich');answer.textContent=rawAnswer;followAnswer()}}")
    .replace("answer.textContent=recentAnswer.content;setPhase", "rawAnswer=recentAnswer.content;answer.textContent=recentAnswer.content;setPhase")
    .replace("const runtime={voiceState:'idle'}", "const runtime={voiceState:'idle',capabilities:{}}")
    .replace("async function memoryRead(){try{", "async function memoryRead(){return[];try{")
    .replace("async function memoryWrite(){turns=turns.slice(-24).map", "async function memoryWrite(){turns=turns.slice(-24).map")
    .replace("));try{const db=await openDb();await new Promise", "));return;try{const db=await openDb();await new Promise")
    .replace("async function restore(){turns=await memoryRead();", "async function restore(){await memoryReset();turns=[];")
    .replace("const setPhase=(value,error=false)=>{phase.textContent=value;phase.className=error?'phase error':'phase';if(error)setVoiceState('error')};", "const cognition=byId('cognition');const cognitiveStep=value=>{const message=String(value||'').toLowerCase();if(/rispond|output|gener|parl|pront/.test(message))return'respond';if(/verif|controll|valid|conferm/.test(message))return'verify';if(/cerc|web|font|document|allegat|recuper/.test(message))return'retrieve';if(/pian|prepar|strument|agent|azione|sessione/.test(message))return'plan';return'understand'};const setCognition=(value,error=false)=>{const message=String(value||''),running=Boolean(message)&&!error&&!/(?:risposta pronta|memoria locale cancellata|continuità ripristinata|non disponibile)/i.test(message),step=cognitiveStep(message);cognition.hidden=!running;cognition.dataset.step=error?'error':step;cognition.querySelectorAll('li').forEach(item=>item.dataset.active=String(item.dataset.step===step))};const setPhase=(value,error=false)=>{phase.textContent=value;phase.className=error?'phase error':'phase';setCognition(value,error);if(error)setVoiceState('error')};")
    .replace("token=data.token;return token", "token=data.token;runtime.capabilities=Object.fromEntries((data.capabilities?.capabilities||[]).map(item=>[item.id,item]));return token")
    .replace("userPrompt.textContent='';answer.textContent='';setPhase('Memoria locale cancellata')", "userPrompt.textContent='';answer.textContent='';rawAnswer='';hideAnswerContext();responseActions.hidden=true;feedbackStatus.textContent='';setPhase('Memoria locale cancellata')")
    .replace('La demo web resta utilizzabile su ', 'NexusNXS AI resta disponibile nel browser su ')
    .replace('continuare a usare questa demo dal browser.', 'continuare a usare NexusNXS AI dal browser.')
    .replace("send.disabled=true;prepareDownload();restore();setVoiceState('idle')", "send.disabled=true;prepareDownload();restore();setVoiceState('idle');if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/service-worker.js').catch(()=>{})")
    .replace("memoryClear=byId('memoryClear');let", "memoryClear=byId('memoryClear'),imageResult=byId('imageResult'),imageOutput=byId('imageOutput'),attachment=byId('attachment'),attachmentInput=byId('attachmentInput'),attachmentTray=byId('attachmentTray'),artifacts=byId('artifacts'),responseActions=byId('responseActions'),copyResponse=byId('copyResponse'),deepenResponse=byId('deepenResponse'),exportResponse=byId('exportResponse'),feedbackAction=byId('feedbackAction'),feedbackStatus=byId('feedbackStatus');let imageObjectUrl='',pendingAttachments=[],")
    .replace("async function ask(value", "function isImageRequest(text){return /^\\s*(?:genera|crea|disegna|realizza|generate|create|draw)\\b[\\s\\S]{0,80}\\b(?:immagine|foto|illustrazione|image|picture|illustration)\\b/i.test(text)}async function generateImage(text,credential){setVoiceState('thinking');setPhase('Genero l’immagine sul server…');const response=await fetch('/api/guest/images/generate',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify({prompt:text,size:'1024x1024'})});if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'Generazione immagine non disponibile')}if(imageObjectUrl)URL.revokeObjectURL(imageObjectUrl);imageObjectUrl=URL.createObjectURL(await response.blob());imageOutput.src=imageObjectUrl;imageOutput.alt='Immagine generata da NexusNXS';imageResult.hidden=false;answer.textContent='Immagine generata.';setVoiceState('ready');setPhase('Immagine pronta');return answer.textContent}async function ask(value")
    .replace('function isImageRequest', attachmentRuntime + answerFormattingRuntime + artifactRuntime + feedbackRuntime + responseActionsRuntime + streamFollowRuntime + 'function isImageRequest')
    .replace("const allowed=/^(image/(?:jpeg|png|webp)|application/(?:pdf|json|xml)|text/(?:plain|markdown|csv|xml))$/i;if(!allowed.test(file.type))", "const allowed=['image/jpeg','image/png','image/webp','application/pdf','application/json','application/xml','text/plain','text/markdown','text/csv','text/xml'];if(!allowed.includes(String(file.type).toLowerCase()))")
    .replace("const pieces=String(text).split(/(https://[^\\s<>()]+)/g)", "const pieces=String(text).match(/\\S+|\\s+/g)||[]")
    .replace("if(/^https:///.test(piece))", "if(piece.startsWith('https://'))")
    .replace("answer.textContent='';pendingAnswer='';answer.classList.add", "answer.textContent='';pendingAnswer='';rawAnswer='';followStream=true;lastAnswerScroll=0;hideAnswerContext();responseActions.hidden=true;feedbackStatus.textContent='';answer.classList.remove('rich');imageResult.hidden=true;answer.classList.add")
    .replace("if(!text||busy)return;busy=true;send.disabled=true;", "if(!text||busy)return;busy=true;stopRequested=false;requestAbort=new AbortController();requestMessageId=globalThis.crypto?.randomUUID?.()||('019fa53a-'+Date.now().toString(16)+'-'+Math.random().toString(16).slice(2));setSendMode(true);")
    .replace("const credential=await session();const response=await fetch('/api/guest/messages/stream'", "const credential=await session();if(isImageRequest(text)&&capability('image-generation')==='available'){const responseText=await generateImage(text,credential);turns.push({role:'user',content:text},{role:'assistant',content:responseText});await memoryWrite();answer.classList.remove('streaming');return}const response=await fetch('/api/guest/messages/stream'")
    .replace("clientMessageId:globalThis.crypto?.randomUUID?.()", "clientMessageId:requestMessageId,attachments:pendingAttachments")
    .replace("fetch('/api/guest/messages/stream',{method:'POST'", "fetch('/api/guest/messages/stream',{method:'POST',signal:requestAbort.signal")
    .replace("if(!response.body)throw new Error('Streaming non disponibile')", "resetAttachments();if(!response.body)throw new Error('Streaming non disponibile')")
    .replace("const responseText=answer.textContent.trim();turns.push({role:'user',content:text},{role:'assistant',content:responseText});await memoryWrite();answer.classList.remove('streaming')", "const responseText=(rawAnswer||answer.textContent).trim();turns.push({role:'user',content:text},{role:'assistant',content:responseText});await memoryWrite();formatAnswer(responseText);showFeedback();answer.classList.remove('streaming')")
    .replace("if(frame.type==='complete'&&!answer.textContent&&!pendingAnswer)queueAnswer(frame.message||'')", "if(frame.type==='complete'){if(!answer.textContent&&!pendingAnswer)queueAnswer(frame.message||'');renderArtifacts(frame.artifacts)}")
    .replace("const response=await fetch('/api/guest/messages/stream',{method:'POST',signal:requestAbort.signal", "let streamComplete=false,streamCursor=0,streamAttempt=0;while(!streamComplete&&streamAttempt<3){try{const response=await fetch('/api/guest/messages/stream',{method:'POST',signal:requestAbort.signal")
    .replace("clientMessageId:requestMessageId,attachments:pendingAttachments})", "clientMessageId:requestMessageId,attachments:pendingAttachments,cursor:streamCursor})")
    .replace("if(frame.type==='token'){setVoiceState('responding');queueAnswer(frame.token)}", "if(frame.type==='token'){setVoiceState('responding');streamCursor=Math.max(streamCursor,Number(frame.cursor)||streamCursor+String(frame.token||'').length);queueAnswer(frame.token)}")
    .replace("if(frame.type==='complete'){if(!answer.textContent&&!pendingAnswer)queueAnswer(frame.message||'');renderArtifacts(frame.artifacts)}", "if(frame.type==='complete'){streamComplete=true;streamCursor=Math.max(streamCursor,Number(frame.cursor)||0);if(!answer.textContent&&!pendingAnswer)queueAnswer(frame.message||'');renderArtifacts(frame.artifacts)}")
    .replace("if(frame.type==='error')throw new Error(frame.error||'Risposta non completata')}}flushAnswer();", "if(frame.type==='error'){const frameError=new Error(frame.error||'Risposta non completata');frameError.retryable=false;throw frameError}}}if(!streamComplete)throw new Error('Connessione interrotta durante la risposta')}catch(streamError){if(stopRequested||streamError?.name==='AbortError'||streamError?.retryable===false||++streamAttempt>=3)throw streamError;setVoiceState('thinking');setPhase('Riprendo la risposta…');await new Promise(resolve=>setTimeout(resolve,250*streamAttempt))}}flushAnswer();")
    .replace("catch(error){answer.classList.remove('streaming');setPhase(error.message||'Servizio momentaneamente non disponibile',true)}finally{busy=false;send.disabled=!prompt.value.trim()}", "catch(error){flushAnswer();answer.classList.remove('streaming');if(stopRequested||error?.name==='AbortError'){const responseText=(rawAnswer||answer.textContent).trim();if(responseText){formatAnswer(responseText);turns.push({role:'user',content:text},{role:'assistant',content:responseText});await memoryWrite();showFeedback()}setVoiceState('ready');setPhase('Generazione interrotta')}else setPhase(error.message||'Servizio momentaneamente non disponibile',true)}finally{busy=false;requestAbort=null;requestMessageId='';setSendMode(false)}")
    .replace('rawAnswer=recentAnswer.content;answer.textContent=recentAnswer.content;setPhase', 'rawAnswer=recentAnswer.content;formatAnswer(recentAnswer.content);showFeedback();setPhase')
    .replace("recordingTimer=0,currentAudio", "recordingTimer=0,voiceMonitor=null,currentAudio")
    .replace("audio.onended=resolve;audio.onerror=reject;audio.play().catch(reject)", "let settled=false;const finish=()=>{if(settled)return;settled=true;resolve()};audio.onended=finish;audio.onpause=finish;audio.onerror=reject;audio.play().catch(reject)")
    .replace("if(currentAudio){currentAudio.pause();currentAudio=null;setVoiceState('ready');setPhase('');return}", "if(currentAudio){const audio=currentAudio;currentAudio=null;audio.pause();setVoiceState('ready');setPhase('');setTimeout(()=>toggleVoice(),0);return}")
    .replace("send.addEventListener('click',()=>ask())", "send.addEventListener('click',()=>busy?stopGeneration():ask())")
    .replace("send.disabled=!prompt.value.trim()", "send.disabled=busy?false:!prompt.value.trim()")
    .replace("async function toggleVoice()", voiceMonitor + "async function toggleVoice()")
    .replace("if(busy)return;if(!navigator.mediaDevices", "if(busy)return;if(capability('voice-input')==='unavailable'){document.body.classList.add('keyboard-open');prompt.focus();setPhase('La voce non è disponibile: puoi scrivere',true);return}if(!navigator.mediaDevices")
    .replace("recorder.onstop=()=>{clearTimeout(recordingTimer);stream.getTracks()", "recorder.onstop=()=>{clearTimeout(recordingTimer);stopVoiceMonitor();stream.getTracks()")
    .replace("recorder.start(250);setVoiceState('listening');setPhase('Ti ascolto · tocca ancora per inviare');recordingTimer=setTimeout(()=>recorder.state==='recording'&&recorder.stop(),10000)", "recorder.start(250);monitorVoice(stream,recorder);setVoiceState('listening');setPhase('Ti ascolto');recordingTimer=setTimeout(()=>recorder.state==='recording'&&recorder.stop(),15000)");
}

function enhancePublicAiHtml({ base, coreStyle, coreScript, windowsDownload, androidDownload }) {
  const withoutLegacyScript = base.replace(/<script>[\s\S]*?<\/script><\/body><\/html>$/, '</body></html>');
  const unifiedMotionBase = withoutLegacyScript
    .replace('background:radial-gradient(circle,#61d9d4 1.4px,transparent 2px) 0 50%/6px 6px repeat-x;animation:flow .95s steps(3) infinite', 'background:#78deda;box-shadow:0 0 0 3px rgba(80,211,208,.07),0 0 16px rgba(80,211,208,.46)')
    .replace('@keyframes flow{50%{opacity:.34;transform:translateX(3px)}}', '');
  return unifiedMotionBase
    .replace('<div class="identity"><span class="wordmark">NexusNXS</span><span class="state">Operativo</span></div>', '<div class="identity"><span class="brand-lockup"><img class="brand-mark" src="/nexus-icon.png" width="36" height="36" alt=""><span class="wordmark">NexusNXS AI</span></span><div class="identity-actions"><span class="state">Operativo</span><button id="download" class="download-trigger" type="button" aria-label="Scarica NexusNXS AI"><span>Scarica</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14"/></svg></button></div></div>')
    .replace('Una sessione essenziale per provare risposte rapide, ragionamento guidato e continuità naturale.', 'Parla al Core. Se preferisci, passa alla tastiera. La continuità resta su questo dispositivo.')
    .replace('<div class="core" aria-hidden="true"><span class="ring"></span><span class="node"></span></div>', '<button id="core" class="core" type="button" aria-label="Attiva NexusNXS"><canvas id="coreCanvas" aria-hidden="true"></canvas><span class="core-glyph" aria-hidden="true"></span><span id="coreCaption" class="core-caption">Core pronto</span></button>')
    .replace('<div class="composer"><div class="composer-box"><textarea id="prompt" rows="1" maxlength="12000" aria-label="Scrivi a NexusNXS" placeholder="Scrivi a NexusNXS…"></textarea></div><button id="send" class="send" type="button" aria-label="Invia">↑</button></div>', '<div class="dock"><div class="composer"><button id="keyboard" class="keyboard-toggle" type="button" data-tooltip="Tastiera" aria-label="Apri o chiudi la tastiera"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/></svg></button><div class="composer-box"><textarea id="prompt" rows="1" maxlength="12000" aria-label="Scrivi a NexusNXS" placeholder="Scrivi a NexusNXS…"></textarea></div><button id="send" class="send" type="button" aria-label="Invia" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m0 0-6 6m6-6 6 6"/></svg></button></div></div>')
    .replace('<div class="dock"><div class="composer">', '<div class="dock"><div id="attachmentTray" class="attachment-tray" aria-live="polite"></div><input id="attachmentInput" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/markdown,text/csv,application/json,application/xml,text/xml" multiple hidden><div class="composer"><button id="attachment" class="attachment-toggle" type="button" data-count="0" data-tooltip="Allegati" aria-label="Allega file"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12.5l5.2-5.2a3 3 0 114.2 4.2l-7.1 7.1a5 5 0 01-7.1-7.1l7.4-7.4"/></svg></button>')
    .replace('<p class="privacy">Nessun account. La sessione è temporanea e riparte pulita alla visita successiva. · <a href="https://nexusnxs.com/">Scopri NexusNXS</a></p>', '<p class="privacy">Sessione temporanea. Uscendo dalla pagina, la conversazione viene dimenticata. <button id="memoryClear" class="memory-clear" type="button">Cancella ora</button> · <a href="https://nexusnxs.com/">Scopri NexusNXS AI</a></p>')
    .replace('<p id="answer" class="answer"></p>', '<div id="cognition" class="cognition" data-step="understand" hidden aria-hidden="true"><span>Attività</span><ol><li data-step="understand">Comprende</li><li data-step="plan">Pianifica</li><li data-step="retrieve">Ricerca</li><li data-step="verify">Verifica</li><li data-step="respond">Risponde</li></ol></div><header id="answerContext" class="web-answer-context" data-kind="answer" hidden><i aria-hidden="true"></i><span><small id="answerKind">Risposta</small><strong id="answerStatus">Risposta pronta</strong></span></header><p id="answer" class="answer"></p><div id="responseActions" class="response-actions" hidden><button id="copyResponse" class="response-action" data-label="Copia" type="button">Copia</button><button id="deepenResponse" class="response-action" data-label="Approfondisci" type="button">Approfondisci</button><button id="exportResponse" class="response-action" data-label="Esporta" type="button">Esporta</button><button id="feedbackAction" class="feedback-action" type="button" title="Condividi volontariamente questa risposta per la revisione e il miglioramento di NexusNXS">Migliora NexusNXS</button><span id="feedbackStatus" class="feedback-status" role="status" aria-live="polite"></span></div><div id="artifacts" class="artifact-grid"></div><figure id="imageResult" class="generated-image" hidden><img id="imageOutput" alt=""><figcaption>Creato da NexusNXS</figcaption></figure>')
    .replace('</head>', `${coreStyle}${EXPERIENCE_STYLE}${INTERACTION_VISIBILITY_STYLE}${ATTACHMENT_STYLE}${RESPONSE_STYLE}${RESPONSE_PRESENTATION_STYLE}${COGNITION_STYLE}</head>`)
    .replace('</body>', `<dialog id="downloadSheet" class="download-sheet"><div class="sheet-body"><div class="sheet-top"><p class="sheet-label">DOWNLOAD ADATTIVO</p><button id="sheetClose" class="sheet-close" type="button" aria-label="Chiudi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></button></div><h2 id="sheetTitle">NexusNXS</h2><p id="deviceNote" class="device-note"></p><a id="installLink" class="download-action" href="#" rel="noreferrer">Scarica NexusNXS</a><div id="unavailable" class="unavailable" hidden></div></div></dialog>${experienceScript({ windowsDownload, androidDownload })}${coreScript}</body>`);
}

// Nomi pubblici canonici. Gli alias storici restano esportati per una release,
// così gli aggiornamenti già distribuiti non perdono compatibilità.
const enhancePublicDemoHtml = enhancePublicAiHtml;
const publicDemoCosmicCoreScript = publicAiCosmicCoreScript;

module.exports = {
  enhancePublicAiHtml,
  publicAiCosmicCoreScript,
  enhancePublicDemoHtml,
  publicDemoCosmicCoreScript,
  WINDOWS_DOWNLOAD,
  ANDROID_DOWNLOAD
};

// #endregion
