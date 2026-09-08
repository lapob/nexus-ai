/** @module shared/desktop-recipes Generated from unchanged desktop sources. */
function createDesktopRecipes() {
// #region Desktop recipes
const PROFILES = {
    booting: {
        mode: 0,
        energy: 0.08,
        coherence: 0.8,
        rotation: 0.03,
        turbulence: 0.08,
        breath: 0.15
    },
    idle: {
        mode: 0,
        energy: 0.17,
        coherence: 0.92,
        rotation: 0.035,
        turbulence: 0.1,
        breath: 0.28
    },
    listening: {
        mode: 1,
        energy: 0.42,
        coherence: 0.76,
        rotation: 0.085,
        turbulence: 0.2,
        breath: 0.46
    },
    speaking: {
        mode: 2,
        energy: 0.76,
        coherence: 0.6,
        rotation: 0.14,
        turbulence: 0.46,
        breath: 0.56
    },
    thinking: {
        mode: 3,
        energy: 0.58,
        coherence: 0.97,
        rotation: 0.17,
        turbulence: 0.29,
        breath: 0.2
    },
    responding: {
        mode: 4,
        energy: 0.68,
        coherence: 0.9,
        rotation: 0.11,
        turbulence: 0.22,
        breath: 0.62
    },
    executing: {
        mode: 5,
        energy: 0.76,
        coherence: 0.72,
        rotation: 0.27,
        turbulence: 0.38,
        breath: 0.2
    },
    permission: {
        mode: 6,
        energy: 0.46,
        coherence: 0.99,
        rotation: 0.018,
        turbulence: 0.06,
        breath: 0.12
    },
    offline: {
        mode: 0,
        energy: 0.04,
        coherence: 0.65,
        rotation: 0.012,
        turbulence: 0.04,
        breath: 0.08
    },
    error: {
        mode: 7,
        energy: 0.48,
        coherence: 0.34,
        rotation: 0.02,
        turbulence: 0.5,
        breath: 0.1
    }
};

const neural = (() => { const vertexShader = `
  precision highp float;
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uMode;
  uniform float uEnergy;
  uniform float uCoherence;
  uniform float uRotation;
  uniform float uTurbulence;
  uniform float uBreath;
  uniform float uStateBlend;
  uniform vec4 uAudio;
  uniform vec3 uAccent;
  uniform float uLuminosity;
  uniform float uPointScale;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  varying float vAlpha;
  varying vec3 vColor;

  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  vec3 rotateY(vec3 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  float stateWeight(float mode) {
    // Una finestra stretta impedisce a due comportamenti adiacenti di
    // deformare contemporaneamente la stessa particella durante le transizioni.
    return (1.0 - smoothstep(0.28, 0.72, abs(uMode - mode))) * uStateBlend;
  }

  void main() {
    vec3 p = position;
    float time = uTime;
    // Il renderer amplifica soprattutto i livelli bassi; la clamp conserva
    // margine visivo durante urla o rumori improvvisi.
    float voice = clamp(uAudio.x * 1.08, 0.0, 0.96);
    float bass = clamp(uAudio.y * 1.08, 0.0, 0.96);
    float mid = clamp(uAudio.z * 1.06, 0.0, 0.96);
    float high = clamp(uAudio.w * 1.04, 0.0, 0.96);

    float breathing = sin(time * 0.42 + aSeed.x * 6.2831) * uBreath;
    float longitudinal = sin(p.x * 0.72 + time * (0.18 + uRotation) + aSeed.y * 2.0);
    float crossWave = cos(p.z * 1.64 - time * 0.24 + aSeed.z * 3.0);
    float fineNoise = sin(p.x * 2.7 + p.z * 3.4 + time * 0.5 + aSeed.w * 9.0);
    float depthWave = sin(length(p.xz * vec2(0.82, 1.34)) * 2.15 - time * 0.56 + aSeed.x * 1.8);

    // Superficie non geometrica: un tessuto orizzontale piegato in più falde.
    p.y += longitudinal * (0.14 + abs(p.z) * 0.04) * uCoherence;
    p.y += crossWave * (0.055 + uTurbulence * 0.14);
    p.z += fineNoise * uTurbulence * 0.08;
    p.y += breathing * (0.055 + aSeed.z * 0.085);
    p.y += depthWave * (0.025 + uEnergy * 0.055) * (0.35 + aSeed.w);

    // Una piega centrale asimmetrica dà alla materia un "centro di attenzione"
    // senza trasformarla in sfera, cerchio o volto.
    float foldedZ = p.z + sin(p.x * 0.44 + time * 0.11) * 0.48;
    float focusFold = exp(-(p.x * p.x * 0.22 + foldedZ * foldedZ * 0.52));
    p.y += focusFold * (0.86 + sin(p.x * 1.3 - time * 0.37) * 0.14);
    p.z += focusFold * sin(p.x * 1.05 + time * 0.21) * 0.28;

    // Filamenti radi e una seconda piega fuori asse rendono la presenza più
    // scenica senza aggiungere oggetti riconoscibili o simmetrie circolari.
    float filament = pow(max(0.0, sin(p.x * 1.46 + p.z * 2.18 - time * 0.31 + aSeed.y * 5.0)), 18.0);
    float sideFocus = exp(-((p.x + 2.15) * (p.x + 2.15) * 0.24 + (p.z - 0.55) * (p.z - 0.55) * 0.7));
    p.y += filament * (0.09 + uEnergy * 0.18) * (0.3 + aSeed.z);
    p.y += sideFocus * sin(time * 0.42 + p.z * 1.7) * (0.1 + uBreath * 0.08);

    // Ascolto: piccole increspature che attraversano il tessuto.
    float listenMix = stateWeight(1.0);
    p.y += listenMix * sin(p.x * 1.8 - time * 1.3 + aSeed.y * 4.0) * (0.06 + voice * 0.18);

    // Voce utente: compressione, espansione e rottura controllata sullo spettro.
    float speechMix = stateWeight(2.0);
    p.x *= 1.0 + speechMix * bass * (0.12 + aSeed.x * 0.16);
    p.z *= 1.0 - speechMix * mid * 0.16;
    p.y += speechMix * (voice * (0.18 + aSeed.z * 0.42)) * sin(p.x * 1.15 + aSeed.w * 12.0);
    p += speechMix * high * 0.065 * vec3(
      sin(aSeed.x * 31.0 + time * 4.0),
      cos(aSeed.y * 27.0 - time * 5.0),
      sin(aSeed.z * 23.0 + time * 3.0)
    );

    // Pensiero: convergenza densa e precisa verso una piega mobile, non una sfera.
    float thinkMix = stateWeight(3.0);
    float thought = sin(abs(p.x) * 1.25 - time * 1.65 + p.z * 0.6);
    p.y += thinkMix * thought * 0.28;
    p.z *= 1.0 - thinkMix * 0.08 * sin(time * 0.7);

    // Risposta: onde armoniche più ampie e coerenti.
    float responseMix = stateWeight(4.0);
    p.y += responseMix * (
      sin(p.x * 0.52 - time * 0.9) * 0.34 +
      cos(p.z * 1.1 + time * 0.48) * 0.16
    );
    p.z += responseMix * sin(p.x * 0.38 + time * 0.62) * 0.22;

    // Esecuzione: impulsi direzionali, più tecnici ma sempre organici.
    float executeMix = stateWeight(5.0);
    float scan = smoothstep(0.82, 1.0, sin(p.x * 1.7 - time * 2.2));
    p.y += executeMix * scan * (0.18 + aSeed.y * 0.32);

    // Permesso: la materia si arresta in una lente ampia e perfettamente
    // coerente. Errore: la stessa trama si spezza in impulsi irregolari.
    float permissionMix = stateWeight(6.0);
    p.x *= 1.0 + permissionMix * 0.08;
    p.z *= 1.0 - permissionMix * 0.22;
    p.y += permissionMix * sin(length(p.xz) * 2.4 - time * 0.8) * 0.09;
    float errorMix = stateWeight(7.0);
    p += errorMix * (0.05 + aSeed.w * 0.09) * vec3(
      sin(time * 8.0 + aSeed.x * 43.0),
      cos(time * 6.7 + aSeed.y * 37.0),
      sin(time * 9.2 + aSeed.z * 31.0)
    );

    float globalPulse = 1.0 + uEnergy * 0.07 + voice * 0.12;
    p.xz *= globalPulse;
    p = rotateY(p, time * uRotation * 0.08 + voice * 0.035);

    // Il dito o il cursore aprono una piccola corrente nella materia. La
    // risposta è locale, continua e torna a riposo senza spostare l'intero Core.
    vec2 pointerPosition = uPointer;
    vec2 pointerDelta = p.xy - pointerPosition;
    float pointerDistance = dot(pointerDelta, pointerDelta);
    float pointerField = exp(-pointerDistance * 1.85) * uPointerStrength;
    vec2 pointerDirection = normalize(pointerDelta + vec2(0.0001));
    p.xy += pointerDirection * pointerField * (0.18 + aSeed.z * 0.15);
    p.z += pointerField * sin(aSeed.w * 18.0 + time * 2.1) * 0.11;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Punti piccoli e separati: la massa deve restare leggibile, mai diventare una fascia bianca.
    float perspective = 14.0 / max(2.0, -mvPosition.z);
    gl_PointSize = clamp((0.54 + aSeed.w * 1.2 + high * 0.74) * uPointScale * perspective, 0.5, 2.65);

    float depthFade = smoothstep(12.0, 2.0, -mvPosition.z);
    float edgeFade = 1.0 - smoothstep(7.0, 9.2, abs(p.x));
    vAlpha = (0.09 + aSeed.x * 0.39) * edgeFade * (0.5 + depthFade * 0.44);
    vAlpha *= 0.68 + uEnergy * 0.38 + voice * 0.24;
    vAlpha *= 1.0 + filament * 0.72 + focusFold * 0.18;

    vec3 teal = vec3(0.035, 0.52, 0.58);
    vec3 cyan = vec3(0.08, 0.76, 0.82);
    vec3 ice = vec3(0.62, 0.86, 0.9);
    float intelligence = clamp(responseMix * 0.45 + thinkMix * 0.3 + high * 0.35 + aSeed.y * 0.22, 0.0, 1.0);
    vColor = mix(teal, cyan, 0.24 + aSeed.z * 0.55);
    vColor = mix(vColor, ice, clamp(intelligence + filament * 0.28 + focusFold * 0.08, 0.0, 1.0));
    vColor = mix(vColor, uAccent, 0.25 + listenMix * 0.12 + speechMix * 0.1
      + executeMix * 0.2 + permissionMix * 0.3 + errorMix * 0.42);
  }
`;
const fragmentShader = `
  precision highp float;
  uniform float uLuminosity;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distanceToCenter = length(point);
    float alpha = smoothstep(0.49, 0.18, distanceToCenter) * vAlpha;
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(vColor * uLuminosity, alpha);
  }
`;
function randomSigned(seed) {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
}
const attributeCache = new Map();
function buildParticleAttributes(particleCount) {
    const cached = attributeCache.get(particleCount);
    if (cached) return cached;
    const positions = new Float32Array(particleCount * 3);
    const seeds = new Float32Array(particleCount * 4);
    for(let index = 0; index < particleCount; index += 1){
        const offset = index * 3;
        const seedOffset = index * 4;
        const s1 = (randomSigned(index * 0.93 + 1.7) + 1) * 0.5;
        const s2 = (randomSigned(index * 1.31 + 8.2) + 1) * 0.5;
        const s3 = (randomSigned(index * 2.17 + 3.4) + 1) * 0.5;
        const s4 = (randomSigned(index * 3.73 + 9.9) + 1) * 0.5;
        const layer = s4 < 0.68 ? 0 : s4 < 0.9 ? 1 : 2;
        const x = (s1 * 2 - 1) * (5.75 + layer * 0.38);
        const zDensity = Math.pow(s2, 1.55) * (s3 < 0.5 ? -1 : 1);
        const z = zDensity * (2.65 + layer * 0.52);
        const ridge = Math.sin(x * 0.58 + z * 1.12) * (0.22 + layer * 0.18);
        const y = ridge + randomSigned(index * 4.19) * (0.08 + layer * 0.16) + (layer - 0.5) * 0.14;
        positions[offset] = x;
        positions[offset + 1] = y;
        positions[offset + 2] = z;
        seeds[seedOffset] = s1;
        seeds[seedOffset + 1] = s2;
        seeds[seedOffset + 2] = s3;
        seeds[seedOffset + 3] = s4;
    }
    const attributes = {
        positions,
        seeds
    };
    attributeCache.set(particleCount, attributes);
    while(attributeCache.size > 3)attributeCache.delete(attributeCache.keys().next().value);
    return attributes;
}
 return {vertexShader, fragmentShader, build: buildParticleAttributes}; })();
const saturn = (() => { const vertexShader = `
  attribute float aSeed;
  attribute float aImportance;
  uniform float uTime;
  uniform float uKind;
  uniform float uStateEnergy;
  uniform float uTransition;
  uniform float uRingVisibility;
  uniform float uDisintegration;
  uniform vec4 uAudio;
  uniform vec3 uAccent;
  uniform float uLuminosity;
  uniform float uPointScale;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  varying float vAlpha;
  varying float vEnergy;
  varying float vKind;
  varying float vShade;

  mat2 rotate2d(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
  }

  void main() {
    vec3 p = position;
    vKind = uKind;
    vShade = 1.0;
    // Saturno reagisce già alle voci leggere, mantenendo però una riserva
    // dinamica per i transienti più forti.
    float voice = clamp(uAudio.x * 1.38, 0.0, 0.9);

    if (uKind < 0.5) {
      // Il nucleo conserva una forma planetaria, ma la superficie respira e
      // viene attraversata dalle frequenze della voce.
      float radius = length(p);
      float latitude = atan(p.y, length(p.xz));
      p.xz = rotate2d(uTime * 0.035 + aSeed * 0.002) * p.xz;
      float surfaceWave = sin(latitude * 19.0 - uTime * 0.75 + aSeed * 5.0);
      p *= 1.0 + voice * 0.06 + uAudio.y * surfaceWave * 0.042
        + uTransition * 0.045 + uStateEnergy * 0.035;
      p += normalize(p) * sin(radius * 13.0 + uTime + aSeed * 8.0) * uAudio.z * 0.04;
      // Una base luminosa costante mantiene leggibile il nucleo anche offline;
      // stato e voce aggiungono energia senza saturare tutte le particelle.
      vAlpha = (0.16 + aSeed * 0.3 + voice * 0.12 + uStateEnergy * 0.14)
        * (0.32 + aImportance * 0.84);
      vec3 surfaceNormal = normalize(p);
      float directional = dot(surfaceNormal, normalize(vec3(-0.38, 0.64, 0.68))) * 0.5 + 0.5;
      float rim = pow(1.0 - abs(surfaceNormal.z), 2.2);
      vShade = 0.34 + directional * 0.5 + rim * 0.2;
    } else if (uKind < 1.5) {
      // Anelli e meteoriti costituiscono il vero spettro: ampiezza, ondulazione
      // e dispersione derivano rispettivamente da volume, medi e alti.
      float angle = atan(p.y, p.x);
      float radius = length(p.xy);
      // Ogni particella nasce sulla superficie del nucleo e raggiunge la sua
      // orbita in un momento leggermente diverso. L'easing cubico evita che la
      // geometria degli anelli appaia già completa durante la transizione.
      float formation = smoothstep(aSeed * 0.24, 0.54 + aSeed * 0.24, uRingVisibility);
      formation = formation * formation * (3.0 - 2.0 * formation);
      vec2 radialDirection = normalize(p.xy);
      vec2 ringTarget = p.xy;
      vec2 surfaceOrigin = radialDirection * (0.88 + aSeed * 0.08);
      p.xy = mix(surfaceOrigin, ringTarget, formation);
      // Conservazione del momento angolare: la materia vicina ruota un poco
      // più rapidamente di quella esterna e non sembra un disco rigido.
      float orbitalSpeed = 0.014 + 0.034 / max(1.0, length(ringTarget));
      p.xy = rotate2d((1.0 - formation) * (0.22 + aSeed * 0.5)
        + uTime * orbitalSpeed * formation) * p.xy;
      p.z = mix((aSeed - 0.5) * 0.035, p.z, formation);
      // In chiusura le orbite non rientrano come un oggetto rigido: ogni
      // particella perde coesione con velocità e direzione determinate dal seed.
      float breakup = uDisintegration * (0.25 + aSeed * 0.75);
      p.xy *= 1.0 + breakup * (0.12 + aSeed * 0.22);
      p.z += sin(aSeed * 37.0 + uTime * 2.6) * breakup * 0.48;
      // La voce attraversa gli anelli come onde concentriche. L'effetto usa
      // fase e seed diversi per non produrre un cerchio rigido da equalizzatore.
      float speechRipple = sin(radius * 8.5 - uTime * 5.2 + aSeed * 2.4);
      float transient = pow(max(0.0, sin(angle * 7.0 + uTime * 3.4 + aSeed * 5.0)), 9.0);
      // Correnti lente e non sincronizzate mantengono vivo il disco anche
      // durante le pause, senza farlo pulsare come un equalizzatore.
      float orbitalBreath = sin(uTime * (0.22 + aSeed * 0.16) + angle * 2.0 + aSeed * 9.0);
      p.xy *= 1.0 + orbitalBreath * (0.004 + aSeed * 0.004) * formation;
      p.xy *= 1.0 + voice * (0.09 + aSeed * 0.12 + speechRipple * 0.035)
        + uTransition * (0.035 + aSeed * 0.025);
      p.z += sin(angle * 3.0 - uTime * 0.32 + aSeed * 8.0) * 0.012 * formation;
      p.z += sin(angle * 10.0 - uTime * 1.25 + radius * 3.0) * uAudio.z * 0.16;
      p.z += (aSeed - 0.5) * uAudio.w * 0.28;
      p.z += transient * uAudio.w * 0.16;
      float survival = smoothstep(uDisintegration * 0.92, 1.0, fract(aSeed * 17.31 + radius * 0.37));
      float livingLight = 0.94 + 0.12 * sin(uTime * (0.34 + aSeed * 0.2) + aSeed * 17.0);
      vAlpha = (0.105 + aSeed * 0.46 + voice * (0.24 + transient * 0.24)
        + abs(uTransition) * 0.1) * aImportance * formation * survival;
      vAlpha *= livingLight;
    } else {
      // La nube esterna rompe la geometria perfetta degli anelli. Il moto è
      // volutamente lento: deve sembrare polvere cosmica, non un equalizzatore.
      float angle = atan(p.y, p.x);
      float radius = length(p.xy);
      // L'alone emerge dopo le orbite interne: prima una corona sottile sulla
      // superficie, poi polvere che si separa dolcemente dal pianeta.
      float formation = smoothstep(0.22 + aSeed * 0.2, 0.72 + aSeed * 0.18, uRingVisibility);
      formation = formation * formation * (3.0 - 2.0 * formation);
      vec2 radialDirection = normalize(p.xy);
      vec2 haloTarget = p.xy;
      p.xy = mix(radialDirection * (0.9 + aSeed * 0.07), haloTarget, formation);
      p.xy = rotate2d((1.0 - formation) * (-0.42 - aSeed * 0.66)
        - uTime * (0.006 + aSeed * 0.009) * formation) * p.xy;
      p.z = mix((aSeed - 0.5) * 0.025, p.z, formation);
      float breakup = uDisintegration * (0.35 + aSeed * 0.9);
      p.xy *= 1.0 + breakup * 0.3;
      p.z += cos(aSeed * 41.0 - uTime * 1.8) * breakup * 0.72;
      p.z += sin(uTime * 0.18 + aSeed * 11.0 + angle) * 0.018 * formation;
      p.z += sin(angle * 5.0 + radius * 2.0 - uTime * 0.45) * (0.05 + uAudio.z * 0.12);
      float haloRipple = sin(radius * 5.0 - uTime * 3.2 + aSeed * 4.0);
      p.xy *= 1.0 + voice * (0.045 + aSeed * 0.06 + haloRipple * 0.025)
        + uTransition * (0.025 + aSeed * 0.02);
      float survival = smoothstep(uDisintegration * 0.88, 1.0, fract(aSeed * 23.17 + radius));
      vAlpha = (0.014 + aSeed * 0.095 + voice * (0.08 + max(0.0, haloRipple) * 0.075))
        * aImportance * formation * survival;
    }

    vec2 pointerPosition = uPointer;
    vec2 pointerDelta = p.xy - pointerPosition;
    float pointerField = exp(-dot(pointerDelta, pointerDelta) * 2.05) * uPointerStrength;
    p.xy += normalize(pointerDelta + vec2(0.0001)) * pointerField * (0.12 + aSeed * 0.11);
    p.z += pointerField * sin(aSeed * 23.0 + uTime * 2.0) * 0.075;

    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float particleScale = uKind < 0.5 ? 1.32 : (uKind < 1.5 ? 0.82 : 0.66);
    gl_PointSize = clamp(
      (0.76 + aSeed * 1.38 + uAudio.w * 1.55 + voice * 0.42 + uStateEnergy * 0.16)
        * particleScale * uPointScale * (12.0 / max(2.0, -viewPosition.z)),
      0.38,
      3.15
    );
    vEnergy = clamp(voice * 0.65 + uAudio.w * 0.35 + uStateEnergy * 0.2 + aImportance * 0.12, 0.0, 1.0);
  }
`;
const fragmentShader = `
  precision highp float;
  uniform vec3 uAccent;
  uniform float uLuminosity;
  varying float vAlpha;
  varying float vEnergy;
  varying float vKind;
  varying float vShade;

  void main() {
    float distanceToCenter = length(gl_PointCoord - 0.5);
    // Bordo inciso e nucleo ottico più compatto: il punto resta leggibile
    // come dettaglio in primo piano invece di fondersi in una macchia.
    float alpha = smoothstep(0.49, 0.19, distanceToCenter) * vAlpha;
    if (alpha < 0.014) discard;
    vec3 deepCyan = vec3(0.0, 0.28, 0.34);
    vec3 electricCyan = vec3(0.08, 0.82, 0.86);
    vec3 color = mix(deepCyan, electricCyan, 0.5 + vEnergy * 0.3);
    color = mix(color, uAccent, 0.2 + vEnergy * 0.16);
    if (vKind < 0.5) {
      // Il nucleo acquista volume con una luce laterale e un bordo atmosferico
      // senza introdurre mesh, texture o ulteriori draw call.
      color *= vShade;
      alpha *= 0.82 + vShade * 0.24;
      color *= 1.03;
      alpha = max(alpha, smoothstep(0.48, 0.2, distanceToCenter) * 0.04);
    }
    gl_FragColor = vec4(color * uLuminosity, alpha);
  }
`;
function randomUnit(seed) {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
}
function createPlanet(count) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const importance = new Float32Array(count);
    for(let index = 0; index < count; index += 1){
        const seed = randomUnit(index * 2.17 + 1.3);
        const longitude = randomUnit(index * 1.31 + 7.1) * Math.PI * 2;
        const vertical = randomUnit(index * 3.73 + 2.9) * 2 - 1;
        const radial = Math.sqrt(1 - vertical * vertical);
        const interior = seed > 0.7;
        const shell = interior ? 0.24 + Math.pow(randomUnit(index * 5.17), 0.45) * 0.73 : 0.94 + (seed - 0.5) * 0.13;
        const radius = 1.12 * shell;
        const turbulence = 1 + Math.sin(longitude * 7 + vertical * 11) * 0.025;
        positions[index * 3] = Math.cos(longitude) * radial * radius * turbulence;
        positions[index * 3 + 1] = vertical * radius;
        positions[index * 3 + 2] = Math.sin(longitude) * radial * radius * turbulence;
        seeds[index] = seed;
        const filament = Math.pow(Math.max(0, Math.sin(longitude * 6 + vertical * 9 + seed * 4)), 8);
        importance[index] = interior ? 0.1 + randomUnit(index * 7.31) * 0.34 + filament * 0.22 : 0.2 + randomUnit(index * 7.31) * 0.34 + filament * 0.5;
    }
    return {
        positions,
        seeds,
        importance
    };
}
function createOrbit(count) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const importance = new Float32Array(count);
    for(let index = 0; index < count; index += 1){
        const seed = randomUnit(index * 2.93 + 0.7);
        const angle = randomUnit(index * 1.67 + 5.4) * Math.PI * 2;
        const radialSeed = Math.pow(randomUnit(index * 5.37 + 0.3), 0.82);
        const continuousRadius = 1.28 + radialSeed * 3.78;
        const broadWarp = Math.sin(angle * 2.0 + radialSeed * 7.4) * (0.04 + radialSeed * 0.09);
        const fineTurbulence = Math.sin(angle * 7.0 - radialSeed * 13.0 + seed * 3.0) * 0.026 + Math.sin(angle * 19.0 + seed * 8.0) * 0.012;
        const radius = continuousRadius + broadWarp + fineTurbulence;
        const thickness = 0.026 + radialSeed * 0.085;
        const spread = (randomUnit(index * 3.21 + 4.6) - 0.5) * thickness;
        positions[index * 3] = Math.cos(angle) * radius;
        positions[index * 3 + 1] = Math.sin(angle) * radius;
        positions[index * 3 + 2] = spread + Math.sin(angle * 2.0 + radialSeed * 5.0) * thickness * 0.28;
        seeds[index] = seed;
        const densityCloud = 0.5 + Math.sin(radialSeed * 31.0 + angle * 0.7) * 0.19 + Math.sin(radialSeed * 73.0 - angle * 1.3) * 0.11;
        const arcEnergy = Math.pow(Math.max(0, Math.sin(angle * 3.0 + radialSeed * 17.0)), 5);
        const gap = Math.sin(radialSeed * 46.0 + 0.8) > 0.91 ? 0.28 : 1;
        importance[index] = (0.2 + densityCloud * 0.42 + arcEnergy * 0.18) * gap;
    }
    return {
        positions,
        seeds,
        importance
    };
}
function createHalo(count) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const importance = new Float32Array(count);
    for(let index = 0; index < count; index += 1){
        const seed = randomUnit(index * 3.71 + 2.2);
        const angle = randomUnit(index * 1.97 + 4.8) * Math.PI * 2;
        const radius = 1.22 + Math.pow(randomUnit(index * 4.83 + 1.1), 0.72) * 4.35;
        const wave = Math.sin(angle * 3 + seed * 8) * 0.16 + Math.sin(angle * 11 - seed * 4) * 0.06;
        positions[index * 3] = Math.cos(angle) * (radius + wave);
        positions[index * 3 + 1] = Math.sin(angle) * (radius + wave);
        positions[index * 3 + 2] = (randomUnit(index * 7.13 + 0.4) - 0.5) * (0.22 + radius * 0.13);
        seeds[index] = seed;
        importance[index] = 0.18 + randomUnit(index * 8.27) * 0.48;
    }
    return {
        positions,
        seeds,
        importance
    };
}
 return {vertexShader, fragmentShader, planet:createPlanet, orbit:createOrbit, halo:createHalo}; })();
const reactor = (() => {
class BufferAttribute { constructor(array) { this.array = array; } }
class BufferGeometry { setAttribute(name, value) { this[name] = value; } }
function random(seed) {
    const value = Math.sin(seed * 91.733) * 43758.5453;
    return value - Math.floor(value);
}
const nexusGeometryCache = new Map();
function buildNexusGeometry(count, layer) {
    const cacheKey = `${layer}:${count}`;
    const cached = nexusGeometryCache.get(cacheKey);
    if (cached) return cached;
    const positions = new Float32Array(count * 3);
    for(let index = 0; index < count; index += 1){
        const offset = index * 3;
        const angle = random(index + 0.1) * Math.PI * 2;
        let radius;
        let depth;
        if (layer === 'rings') {
            const ring = index % 6;
            radius = 1.05 + ring * 0.43 + (random(index + 2.4) - 0.5) * 0.045;
            const segment = Math.floor(angle / (Math.PI / 6));
            const gap = (segment + ring) % 4 === 0 && angle % (Math.PI / 6) < 0.075;
            if (gap) radius += 0.18;
            depth = (ring - 2.5) * 0.09 + (random(index + 4.2) - 0.5) * 0.055;
        } else if (layer === 'core') {
            radius = Math.sqrt(random(index + 8.7)) * 0.78;
            depth = (random(index + 5.8) - 0.5) * 0.16;
        } else if (layer === 'scanner') {
            const spoke = index % 12;
            const local = random(index + 11.2);
            const spokeAngle = spoke * Math.PI / 6;
            radius = 3.2 + local * 0.5;
            positions[offset] = Math.cos(spokeAngle) * radius;
            positions[offset + 1] = Math.sin(spokeAngle) * radius;
            positions[offset + 2] = (random(index + 13.1) - 0.5) * 0.12;
            continue;
        } else {
            const latitude = Math.acos(2 * random(index + 17.1) - 1);
            const orbit = 2.05 + random(index + 19.7) * 1.45;
            radius = orbit * Math.sin(latitude);
            depth = Math.cos(latitude) * orbit * 0.34;
            positions[offset] = Math.cos(angle) * radius;
            positions[offset + 1] = Math.sin(angle) * radius * 0.72;
            positions[offset + 2] = depth;
            continue;
        }
        positions[offset] = Math.cos(angle) * radius;
        positions[offset + 1] = Math.sin(angle) * radius;
        positions[offset + 2] = depth;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    nexusGeometryCache.set(cacheKey, geometry);
    return geometry;
}

return (count, layer) => ({positions:buildNexusGeometry(count,layer).position.array});
})();
// #endregion
// #region Public contract
return {neural,saturn,reactor,profiles:PROFILES};
// #endregion
}
module.exports = {createDesktopRecipes};
