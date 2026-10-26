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
console.log('Desktop geometry and shared web shaders synchronized.');
