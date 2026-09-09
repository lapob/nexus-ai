/** @module scripts/generate-cosmic-visualizers
 * Extract the real desktop geometry and shaders without changing desktop sources.
 */
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '..');
function extract(file, names) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const found = names.map(name => {
    const start=source.search(new RegExp('^(?:function|const) '+name+'\\b','m'));
    if(start<0)throw new Error(`Missing desktop export: ${file} ${name}`);
    const tail=source.slice(start);
    const end=tail.startsWith('function ')?tail.search(/^}/m)+1:
      tail.includes('/* glsl */',0)&&tail.slice(0,80).includes('/* glsl */')?tail.indexOf('`;')+2:
      tail.split('\n')[0].trimEnd().endsWith(';')?tail.indexOf('\n'):tail.search(/^};/m)+2;
    if(end<=0)throw new Error(`Invalid desktop export boundary: ${name}`);
    return tail.slice(0,end);
  });
  return stripTypeScriptTypes(found.join('\n'),{mode:'transform'});
}
const neural = extract('src/renderer/scene/ParticleEngine.tsx', ['vertexShader','fragmentShader','randomSigned','attributeCache','buildParticleAttributes']);
const saturn = extract('src/renderer/scene/SaturnVisualizer.tsx', ['vertexShader','fragmentShader','randomUnit','createPlanet','createOrbit','createHalo']);
const reactor = extract('src/renderer/scene/NexusCore.tsx', ['random','nexusGeometryCache','buildNexusGeometry']);
const profiles = extract('src/renderer/systems/AnimationController.ts', ['PROFILES']);
const output = `/** @module shared/desktop-recipes Generated from unchanged desktop sources. */
function createDesktopRecipes() {
// #region Desktop recipes
${profiles}
const neural = (() => { ${neural} return {vertexShader, fragmentShader, build: buildParticleAttributes}; })();
const saturn = (() => { ${saturn} return {vertexShader, fragmentShader, planet:createPlanet, orbit:createOrbit, halo:createHalo}; })();
const reactor = (() => {
class BufferAttribute { constructor(array) { this.array = array; } }
class BufferGeometry { setAttribute(name, value) { this[name] = value; } }
${reactor}
return (count, layer) => ({positions:buildNexusGeometry(count,layer).position.array});
})();
// #endregion
// #region Public contract
return {neural,saturn,reactor,profiles:PROFILES};
// #endregion
}
module.exports = {createDesktopRecipes};
`;
function write(relative, content) {
  const file = path.join(root, relative);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n') !== content.replace(/\r\n/g,'\n')) throw new Error(`Stale generated asset: ${relative}`);
  } else { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,content); }
}
write('src/shared/desktop-recipes.js', output);
const renderer = fs.readFileSync(path.join(root,'src/shared/cosmic-visualizers.js'),'utf8').replace(/module\.exports =[^;]+;/,'');
const recipes = output.replace('module.exports = {createDesktopRecipes};','');
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}canvas{position:fixed;width:100%;height:100%}#anchor{position:absolute;left:10%;top:25%;width:80%;height:45%;pointer-events:none}</style><canvas id="scene"></canvas><div id="anchor"></div><script>${recipes}\n${renderer}\nlet input={state:'idle',energy:0,reduced:false};const anchor=document.getElementById('anchor');const core=createCosmicVisualizers(document.getElementById('scene'),{host:anchor,ambient:true,gatherBackground:true,disperseOnHide:true,getState:()=>input.state,getEnergy:()=>input.energy,getReduced:()=>input.reduced,getVisible:()=>input.visible!==false,getPaused:()=>window.nexusPaused===true,getInspection:()=>input.inspection},createDesktopRecipes);window.updateNexusVisual=(next)=>{input=next;if(next.bounds){const b=next.bounds;anchor.style.cssText='position:absolute;left:'+b[0]+'px;top:'+b[1]+'px;width:'+b[2]+'px;height:'+b[3]+'px';}core.refresh();};window.nexusVisualizer=core;</script>`;
write('android/NexusRemote/app/src/main/assets/cosmic-visualizers.html',html);
console.log('Desktop geometry/shaders and Android scene synchronized.');
