(function (global) {
  'use strict';

  var CONFIG = Object.freeze({
    STAR_COUNT: 4000,
    MIN_STAR_RADIUS: 14.0,
    MAX_STAR_RADIUS_SPAN: 160.0,
    STAR_RADIUS_POWER: 1.6,
    STAR_Z_MIN: -500.0,
    STAR_Z_MAX: 10.0,
    STAR_Z_SPAN: 510.0,
    STRETCH_THRESHOLD: 0.25,
    POST_SNAP_THIN_RATIO: 0.6,
    TUNNEL_RADIUS: 18,
    TUNNEL_LENGTH: 600,
    TUNNEL_RADIAL_SEGMENTS: 64,
    TUNNEL_CENTER_Z: -290,
    TUNNEL_ANGULAR_BANDS: 144.0
  });

  function sampleAnnularRadius(randomValue) {
    var r = typeof randomValue === 'number' ? randomValue : Math.random();
    if (r < 0) r = 0;
    if (r > 1) r = 1;
    return CONFIG.MIN_STAR_RADIUS + Math.pow(r, CONFIG.STAR_RADIUS_POWER) * CONFIG.MAX_STAR_RADIUS_SPAN;
  }

  var NOISE_GLSL = [
    'float hsHash12(vec2 p) {',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    '',
    'float hsHash21(vec2 p) {',
    '  return hsHash12(p);',
    '}',
    '',
    'float hsValueNoise(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = hsHash12(i);',
    '  float b = hsHash12(i + vec2(1.0, 0.0));',
    '  float c = hsHash12(i + vec2(0.0, 1.0));',
    '  float d = hsHash12(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',
    '',
    'float hsPeriodicNoise(float u, float freq, float z) {',
    '  float x = u * freq;',
    '  float i0 = mod(floor(x), freq);',
    '  float i1 = mod(i0 + 1.0, freq);',
    '  float fx = fract(x);',
    '  float ux = fx * fx * (3.0 - 2.0 * fx);',
    '  float iz = floor(z);',
    '  float fz = fract(z);',
    '  float uz = fz * fz * (3.0 - 2.0 * fz);',
    '  float a = hsHash12(vec2(i0, iz));',
    '  float b = hsHash12(vec2(i1, iz));',
    '  float c = hsHash12(vec2(i0, iz + 1.0));',
    '  float d = hsHash12(vec2(i1, iz + 1.0));',
    '  return mix(mix(a, b, ux), mix(c, d, ux), uz);',
    '}',
    '',
    'float hsTunnelRibbonNoise(float angleNorm, float longitudinal) {',
    '  float band = floor(angleNorm * 144.0);',
    '  float bandJitter = hsHash12(vec2(band, 17.3));',
    '  float primary = hsValueNoise(vec2(band * 0.73 + bandJitter * 7.0, longitudinal));',
    '  float secondary = hsValueNoise(vec2(band * 1.37 + 19.1, longitudinal * 2.15 - bandJitter * 4.0));',
    '  float cell = hsHash12(vec2(band, floor(longitudinal * 1.5)));',
    '  return clamp(primary * 0.55 + secondary * 0.30 + cell * 0.15, 0.0, 1.0);',
    '}'
  ].join('\n');

  // Layer A: Foreground Annular Star Streaks (Instanced Quad Billboards)
  var STAR_VERTEX_SHADER = [
    'attribute vec3 aCylindricalPos;',
    'attribute float aSpeedOffset;',
    'attribute float aSeed;',
    '',
    'uniform float uTravelZ;',
    'uniform float uStretchLength;',
    'uniform float uPostSnapThinning;',
    'uniform float uStarOpacity;',
    'uniform float uTime;',
    'uniform vec2 uResolution;',
    'uniform vec2 uParallax;',
    '',
    'varying vec2 vUv;',
    'varying float vAlpha;',
    'varying float vIsStreak;',
    '',
    'void main() {',
    '  vUv = vec2(position.x * 0.5 + 0.5, position.y);',
    '',
    '  float zSpan = 510.0;',
    '  float z = mod(aCylindricalPos.z + uTravelZ * aSpeedOffset + 500.0, zSpan) - 500.0;',
    '  float radius = aCylindricalPos.x;',
    '  float theta = aCylindricalPos.y;',
    '',
    '  vec3 headPos = vec3(cos(theta) * radius, sin(theta) * radius, z);',
    '  headPos.xy += uParallax;',
    '  vec4 headClip = projectionMatrix * modelViewMatrix * vec4(headPos, 1.0);',
    '',
    '  if (headClip.w <= 0.1) {',
    '    vAlpha = 0.0;',
    '    vIsStreak = 0.0;',
    '    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);',
    '    return;',
    '  }',
    '',
    '  float zFade = smoothstep(-500.0, -420.0, z) * (1.0 - smoothstep(2.0, 10.0, z));',
    '  float survival = smoothstep(0.56, 0.64, aSeed);',
    '  float thinMask = mix(1.0, survival, clamp(uPostSnapThinning, 0.0, 1.0));',
    '  float twinkle = 0.85 + 0.15 * sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 62.8318);',
    '  vAlpha = zFade * thinMask * uStarOpacity * mix(twinkle, 1.0, step(0.25, uStretchLength));',
    '',
    '  vec2 safeRes = max(uResolution, vec2(1.0));',
    '  vec2 invRes = 1.0 / safeRes;',
    '  vec2 headNDC = headClip.xy / headClip.w;',
    '',
    '  if (uStretchLength < 0.25) {',
    '    vIsStreak = 0.0;',
    '    float pointPx = clamp(240.0 / headClip.w, 1.5, 4.4) * (0.75 + 0.5 * aSeed);',
    '    vec2 local = vec2(position.x, position.y * 2.0 - 1.0);',
    '    vec2 offsetNDC = local * pointPx * invRes * 2.0;',
    '    gl_Position = vec4((headNDC + offsetNDC) * headClip.w, headClip.z, headClip.w);',
    '    return;',
    '  }',
    '',
    '  vIsStreak = 1.0;',
    '  vec3 tailPos = headPos - vec3(0.0, 0.0, uStretchLength * aSpeedOffset);',
    '  vec4 tailClip = projectionMatrix * modelViewMatrix * vec4(tailPos, 1.0);',
    '  float safeTailW = max(tailClip.w, 0.1);',
    '  vec2 tailNDC = tailClip.xy / safeTailW;',
    '',
    '  vec2 deltaPx = (headNDC - tailNDC) * safeRes * 0.5;',
    '  float lenPx = length(deltaPx);',
    '  vec2 dirPx = lenPx > 0.001 ? deltaPx / lenPx : vec2(0.0, 1.0);',
    '  vec2 perpPx = vec2(-dirPx.y, dirPx.x);',
    '',
    '  float headHalfWidthPx = clamp(135.0 / headClip.w, 0.75, 2.2) * (0.8 + 0.4 * aSeed);',
    '  float widthTaper = mix(0.45, 1.0, position.y);',
    '  float halfWidthPx = headHalfWidthPx * widthTaper;',
    '',
    '  vec4 clipPos = mix(tailClip, headClip, position.y);',
    '  float safeClipW = max(clipPos.w, 0.1);',
    '  vec2 ndcPos = clipPos.xy / safeClipW;',
    '  vec2 offsetNDC = perpPx * (position.x * halfWidthPx) * invRes * 2.0;',
    '',
    '  gl_Position = vec4((ndcPos + offsetNDC) * safeClipW, clipPos.z, safeClipW);',
    '}'
  ].join('\n');

  var STAR_FRAGMENT_SHADER = [
    'varying vec2 vUv;',
    'varying float vAlpha;',
    'varying float vIsStreak;',
    '',
    'void main() {',
    '  if (vAlpha <= 0.002) discard;',
    '',
    '  vec3 coreColor = vec3(1.0, 1.0, 1.0);',
    '  vec3 edgeColor = vec3(0.376, 0.647, 0.980);',
    '',
    '  if (vIsStreak < 0.5) {',
    '    vec2 p = vUv * 2.0 - 1.0;',
    '    float d2 = dot(p, p);',
    '    if (d2 > 1.0) discard;',
    '    float core = exp(-d2 * 7.5);',
    '    float halo = exp(-d2 * 2.8);',
    '    vec3 col = mix(edgeColor, coreColor, smoothstep(0.15, 0.65, core));',
    '    gl_FragColor = vec4(col, halo * vAlpha);',
    '    return;',
    '  }',
    '',
    '  float across = abs(vUv.x * 2.0 - 1.0);',
    '  float along = vUv.y;',
    '  float core = exp(-across * across * 14.0);',
    '  float edge = exp(-across * across * 5.0);',
    '  float tailFade = smoothstep(0.0, 0.22, along);',
    '  float headBoost = 0.35 + 0.65 * along;',
    '  float tipSoft = 1.0 - smoothstep(0.94, 1.0, along) * 0.2;',
    '  float alpha = edge * tailFade * headBoost * tipSoft * vAlpha;',
    '',
    '  vec3 col = mix(edgeColor, coreColor, smoothstep(0.14, 0.58, core));',
    '  gl_FragColor = vec4(col, alpha);',
    '}'
  ].join('\n');

  // Layer B: Continuous Procedural Tunnel Wall
  var TUNNEL_VERTEX_SHADER = [
    'varying vec2 vUv;',
    'varying vec2 vScreenNDC;',
    '',
    'void main() {',
    '  vUv = uv;',
    '  vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '  vScreenNDC = clipPos.xy / max(clipPos.w, 0.0001);',
    '  gl_Position = clipPos;',
    '}'
  ].join('\n');

  var TUNNEL_FRAGMENT_SHADER = [
    'uniform float uTime;',
    'uniform float uTunnelIntensity;',
    'uniform float uDropout;',
    'uniform float uMidSwap;',
    'uniform vec2 uResolution;',
    '',
    'varying vec2 vUv;',
    'varying vec2 vScreenNDC;',
    '',
    NOISE_GLSL,
    '',
    'void main() {',
    '  if (uTunnelIntensity <= 0.001) discard;',
    '',
    '  float u = fract(vUv.x);',
    '  float pulsePhase = uMidSwap * 0.6;',
    '',
    '  // Background dark navy negative space (#03081d) & spec palette',
    '  vec3 darkNavy = vec3(0.012, 0.032, 0.115);',
    '  vec3 deepCobalt = vec3(0.08, 0.22, 0.58);',
    '  vec3 electricBlue = vec3(0.28, 0.62, 0.98);',
    '  vec3 blazingWhite = vec3(0.95, 0.99, 1.0);',
    '',
    '  // Tier 1: Broad radial bands (~18 sectors)',
    '  float b1 = hsPeriodicNoise(u, 18.0, vUv.y * 2.2 - uTime * 3.8 - pulsePhase);',
    '  float b2 = hsPeriodicNoise(fract(u + 0.19), 22.0, vUv.y * 2.9 - uTime * 4.9 - pulsePhase);',
    '  float broadNoise = b1 * 0.68 + b2 * 0.32;',
    '  float broadMask = pow(smoothstep(0.32, 0.85, broadNoise), 1.35);',
    '  vec3 broadCol = mix(deepCobalt, electricBlue, broadMask);',
    '',
    '  // Tier 2: Crisp high-frequency white/electric-blue speed lines (320 + 180 grooves)',
    '  float groove320 = mod(floor(u * 320.0), 320.0);',
    '  float groove180 = mod(floor(u * 180.0), 180.0);',
    '  float f1 = hsValueNoise(vec2(groove320 * 1.13 + 7.1, vUv.y * 5.0 - uTime * 9.5 - pulsePhase * 1.4));',
    '  float f2 = hsValueNoise(vec2(groove180 * 1.71 + 19.3, vUv.y * 3.8 - uTime * 7.2 - pulsePhase));',
    '  float fineNoise = max(f1, f2 * 0.92);',
    '  float fineMask = pow(smoothstep(0.62, 0.96, fineNoise), 2.4);',
    '  vec3 fineCol = mix(electricBlue, blazingWhite, smoothstep(0.25, 0.85, fineMask));',
    '',
    '  // Tier 3: Occasional blazing hero white beams (~40 sectors)',
    '  float heroNoise = hsPeriodicNoise(u, 40.0, vUv.y * 2.6 - uTime * 6.0 - pulsePhase);',
    '  float heroMask = smoothstep(0.84, 0.99, heroNoise);',
    '',
    '  // Aspect-corrected crisp circular black central pupil + bright radial corona',
    '  float aspect = uResolution.x / max(uResolution.y, 1.0);',
    '  vec2 ndc = vec2(vScreenNDC.x * aspect, vScreenNDC.y);',
    '  float r = length(ndc);',
    '  float pupilEdge = smoothstep(0.068, 0.105, r);',
    '  float corona = exp(-pow((r - 0.115) / 0.055, 2.0)) * pupilEdge;',
    '',
    '  vec3 wallCol = mix(darkNavy, broadCol, broadMask);',
    '  wallCol = mix(wallCol, fineCol, fineMask);',
    '  wallCol += blazingWhite * heroMask * 1.25;',
    '  wallCol += electricBlue * corona * (0.45 + 0.55 * broadMask);',
    '  wallCol *= (1.0 + uMidSwap * 0.12);',
    '',
    '  float stripId = hsHash21(vec2(floor(u * 36.0), 1.0));',
    '  float dropoutMask = mix(1.0, smoothstep(uDropout - 0.12, uDropout + 0.04, stripId), step(0.001, uDropout));',
    '  float nearFade = smoothstep(1.0, 0.96, vUv.y);',
    '',
    '  vec3 finalCol = mix(vec3(0.0), wallCol, pupilEdge);',
    '  float alpha = clamp(uTunnelIntensity, 0.0, 1.0) * mix(0.98, 0.96, pupilEdge) * nearFade * dropoutMask;',
    '  if (alpha <= 0.002) discard;',
    '',
    '  gl_FragColor = vec4(finalCol, alpha);',
    '}'
  ].join('\n');

  // Layer C: Central Exit Shockwave Ring
  var SHOCKWAVE_VERTEX_SHADER = [
    'varying vec2 vNdc;',
    '',
    'void main() {',
    '  vNdc = position.xy;',
    '  gl_Position = vec4(position.xy, 0.0, 1.0);',
    '}'
  ].join('\n');

  var SHOCKWAVE_FRAGMENT_SHADER = [
    'uniform float uShockwaveProgress;',
    'uniform vec2 uResolution;',
    '',
    'varying vec2 vNdc;',
    '',
    'void main() {',
    '  if (uShockwaveProgress <= 0.001 || uShockwaveProgress >= 0.999) discard;',
    '',
    '  float aspect = uResolution.x / max(uResolution.y, 1.0);',
    '  vec2 p = vec2(vNdc.x * aspect, vNdc.y);',
    '  float dist = length(p);',
    '',
    '  float radius = mix(0.02, 0.14, uShockwaveProgress);',
    '  float thickness = mix(0.012, 0.004, uShockwaveProgress);',
    '  float ring = exp(-pow((dist - radius) / thickness, 2.0));',
    '  float envelope = sin(uShockwaveProgress * 3.14159265) * 0.9;',
    '',
    '  vec3 ringColor = mix(vec3(0.68, 0.72, 0.78), vec3(0.96, 0.98, 1.0), ring);',
    '  float alpha = clamp(ring, 0.0, 1.0) * envelope;',
    '  if (alpha <= 0.002) discard;',
    '',
    '  gl_FragColor = vec4(ringColor, alpha);',
    '}'
  ].join('\n');

  function getDefaultResolution() {
    if (typeof window !== 'undefined' && window.innerWidth && window.innerHeight) {
      return [window.innerWidth, window.innerHeight];
    }
    return [1920, 1080];
  }

  function HyperspaceEngine(scene) {
    var THREE = global.THREE;
    if (!THREE) {
      throw new Error('HyperspaceEngine requires global THREE (three@0.149.0)');
    }

    this.scene = scene || null;
    this.group = new THREE.Group();
    this.group.name = 'HyperspaceEngineGroup';
    this.group.visible = false;

    this._travelZ = 0;
    this._disposed = false;

    var defaultRes = getDefaultResolution();

    // --- Layer B: Continuous Procedural Tunnel Wall ---
    this.tunnelGeometry = new THREE.CylinderGeometry(
      CONFIG.TUNNEL_RADIUS,
      CONFIG.TUNNEL_RADIUS,
      CONFIG.TUNNEL_LENGTH,
      CONFIG.TUNNEL_RADIAL_SEGMENTS,
      1,
      true
    );

    this.tunnelUniforms = {
      uTime: { value: 0.0 },
      uTunnelIntensity: { value: 0.0 },
      uDropout: { value: 0.0 },
      uMidSwap: { value: 0.0 },
      uResolution: { value: new THREE.Vector2(defaultRes[0], defaultRes[1]) }
    };

    this.tunnelMaterial = new THREE.ShaderMaterial({
      uniforms: this.tunnelUniforms,
      vertexShader: TUNNEL_VERTEX_SHADER,
      fragmentShader: TUNNEL_FRAGMENT_SHADER,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });

    this.tunnelMesh = new THREE.Mesh(this.tunnelGeometry, this.tunnelMaterial);
    this.tunnelMesh.name = 'HyperspaceTunnelWall';
    this.tunnelMesh.rotation.x = Math.PI / 2;
    this.tunnelMesh.position.set(0, 0, CONFIG.TUNNEL_CENTER_Z);
    this.tunnelMesh.renderOrder = 1;
    this.tunnelMesh.visible = false;
    this.group.add(this.tunnelMesh);

    // --- Layer A: Foreground Annular Star Streaks (4,000 instanced quads) ---
    this.starGeometry = new THREE.InstancedBufferGeometry();
    var quadPositions = new Float32Array([
      -1, 0, 0,
       1, 0, 0,
       1, 1, 0,
      -1, 1, 0
    ]);
    this.starGeometry.setAttribute('position', new THREE.BufferAttribute(quadPositions, 3));
    this.starGeometry.setIndex([0, 1, 2, 0, 2, 3]);

    var count = CONFIG.STAR_COUNT;
    var cylindricalPos = new Float32Array(count * 3);
    var speedOffsets = new Float32Array(count);
    var seeds = new Float32Array(count);

    for (var i = 0; i < count; i++) {
      var r = sampleAnnularRadius(Math.random());
      var theta = Math.random() * Math.PI * 2;
      var initialZ = -Math.random() * 500.0;

      cylindricalPos[i * 3] = r;
      cylindricalPos[i * 3 + 1] = theta;
      cylindricalPos[i * 3 + 2] = initialZ;

      speedOffsets[i] = 0.65 + Math.random() * 0.85;
      seeds[i] = Math.random();
    }

    this.starGeometry.setAttribute('aCylindricalPos', new THREE.InstancedBufferAttribute(cylindricalPos, 3));
    this.starGeometry.setAttribute('aSpeedOffset', new THREE.InstancedBufferAttribute(speedOffsets, 1));
    this.starGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    var isMob = typeof window !== 'undefined' && (window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test((typeof navigator !== 'undefined' && navigator.userAgent) || ''));
    this.starGeometry.instanceCount = isMob ? Math.min(count, 2000) : count;

    this.starUniforms = {
      uTravelZ: { value: 0.0 },
      uStretchLength: { value: 0.0 },
      uPostSnapThinning: { value: 0.0 },
      uStarOpacity: { value: 1.0 },
      uTime: { value: 0.0 },
      uResolution: { value: new THREE.Vector2(defaultRes[0], defaultRes[1]) },
      uParallax: { value: new THREE.Vector2(0.0, 0.0) }
    };

    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    this.starMesh = new THREE.Mesh(this.starGeometry, this.starMaterial);
    this.starMesh.name = 'StarStreakInstances';
    this.starMesh.frustumCulled = false;
    this.starMesh.renderOrder = 2;
    this.group.add(this.starMesh);

    // --- Layer C: Central Exit Shockwave Ring ---
    this.shockwaveGeometry = new THREE.PlaneGeometry(2, 2);

    this.shockwaveUniforms = {
      uShockwaveProgress: { value: 0.0 },
      uResolution: { value: new THREE.Vector2(defaultRes[0], defaultRes[1]) }
    };

    this.shockwaveMaterial = new THREE.ShaderMaterial({
      uniforms: this.shockwaveUniforms,
      vertexShader: SHOCKWAVE_VERTEX_SHADER,
      fragmentShader: SHOCKWAVE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });

    this.shockwaveMesh = new THREE.Mesh(this.shockwaveGeometry, this.shockwaveMaterial);
    this.shockwaveMesh.name = 'ExitShockwaveRing';
    this.shockwaveMesh.frustumCulled = false;
    this.shockwaveMesh.renderOrder = 3;
    this.shockwaveMesh.visible = false;
    this.group.add(this.shockwaveMesh);

    if (this.scene && typeof this.scene.add === 'function') {
      this.scene.add(this.group);
    }
  }

  HyperspaceEngine.prototype.setVisible = function (visible) {
    if (this._disposed) return;
    this.group.visible = Boolean(visible);
  };

  HyperspaceEngine.prototype.update = function (dt, state) {
    if (this._disposed) return;

    var s = state || {};
    var safeDt = typeof dt === 'number' && isFinite(dt) ? Math.max(-0.1, Math.min(0.1, dt)) : 0;

    var time = typeof s.time === 'number' && isFinite(s.time) ? s.time : this.tunnelUniforms.uTime.value + safeDt;
    var stretchLength = typeof s.stretchLength === 'number' && isFinite(s.stretchLength) ? Math.max(0, s.stretchLength) : 0;
    var tunnelIntensity = typeof s.tunnelIntensity === 'number' && isFinite(s.tunnelIntensity)
      ? Math.max(0, Math.min(1, s.tunnelIntensity))
      : 0;
    var shockwaveProgress = typeof s.shockwaveProgress === 'number' && isFinite(s.shockwaveProgress)
      ? Math.max(0, Math.min(1, s.shockwaveProgress))
      : 0;
    var postSnapThinning = typeof s.postSnapThinning === 'number' && isFinite(s.postSnapThinning)
      ? Math.max(0, Math.min(1, s.postSnapThinning))
      : 0;
    var starDriftSpeed = typeof s.starDriftSpeed === 'number' && isFinite(s.starDriftSpeed) ? s.starDriftSpeed : 0;
    var starOpacity = typeof s.starOpacity === 'number' && isFinite(s.starOpacity)
      ? Math.max(0, Math.min(1, s.starOpacity))
      : 1;
    var rawDropout = typeof s.dropout === 'number' ? s.dropout : s.tunnelDropout;
    var dropout = typeof rawDropout === 'number' && isFinite(rawDropout)
      ? Math.max(0, Math.min(1, rawDropout))
      : 0;
    var midSwap = typeof s.midSwap === 'number' && isFinite(s.midSwap)
      ? Math.max(0, Math.min(1, s.midSwap))
      : 0;

    var px = 0;
    var py = 0;
    if (s.parallax) {
      if (typeof s.parallax.x === 'number' && typeof s.parallax.y === 'number') {
        px = isFinite(s.parallax.x) ? s.parallax.x : 0;
        py = isFinite(s.parallax.y) ? s.parallax.y : 0;
      } else if (Array.isArray(s.parallax) && s.parallax.length >= 2) {
        px = isFinite(s.parallax[0]) ? s.parallax[0] : 0;
        py = isFinite(s.parallax[1]) ? s.parallax[1] : 0;
      }
    }

    this._travelZ += starDriftSpeed * safeDt;

    var resX = this.starUniforms.uResolution.value.x;
    var resY = this.starUniforms.uResolution.value.y;
    if (s.resolution) {
      if (typeof s.resolution.x === 'number' && typeof s.resolution.y === 'number') {
        resX = s.resolution.x;
        resY = s.resolution.y;
      } else if (typeof s.resolution.width === 'number' && typeof s.resolution.height === 'number') {
        resX = s.resolution.width;
        resY = s.resolution.height;
      } else if (Array.isArray(s.resolution) && s.resolution.length >= 2) {
        resX = s.resolution[0];
        resY = s.resolution[1];
      }
    }
    if (resX > 0 && resY > 0) {
      this.starUniforms.uResolution.value.set(resX, resY);
      this.tunnelUniforms.uResolution.value.set(resX, resY);
      this.shockwaveUniforms.uResolution.value.set(resX, resY);
    }

    this.starUniforms.uTravelZ.value = this._travelZ;
    this.starUniforms.uStretchLength.value = stretchLength;
    this.starUniforms.uPostSnapThinning.value = postSnapThinning;
    this.starUniforms.uStarOpacity.value = starOpacity;
    this.starUniforms.uTime.value = time;
    this.starUniforms.uParallax.value.set(px, py);
    this.starMesh.visible = starOpacity > 0.001;

    this.tunnelUniforms.uTime.value = time;
    this.tunnelUniforms.uTunnelIntensity.value = tunnelIntensity;
    this.tunnelUniforms.uDropout.value = dropout;
    this.tunnelUniforms.uMidSwap.value = midSwap;
    this.tunnelMesh.visible = tunnelIntensity > 0.001;

    this.shockwaveUniforms.uShockwaveProgress.value = shockwaveProgress;
    this.shockwaveMesh.visible = shockwaveProgress > 0.001 && shockwaveProgress < 0.999;
  };

  HyperspaceEngine.prototype.dispose = function () {
    if (this._disposed) return;
    this._disposed = true;

    if (this.starGeometry) this.starGeometry.dispose();
    if (this.starMaterial) this.starMaterial.dispose();
    if (this.tunnelGeometry) this.tunnelGeometry.dispose();
    if (this.tunnelMaterial) this.tunnelMaterial.dispose();
    if (this.shockwaveGeometry) this.shockwaveGeometry.dispose();
    if (this.shockwaveMaterial) this.shockwaveMaterial.dispose();

    if (this.scene && typeof this.scene.remove === 'function') {
      this.scene.remove(this.group);
    }

    this.starMesh = null;
    this.tunnelMesh = null;
    this.shockwaveMesh = null;
    this.starGeometry = null;
    this.starMaterial = null;
    this.tunnelGeometry = null;
    this.tunnelMaterial = null;
    this.shockwaveGeometry = null;
    this.shockwaveMaterial = null;
  };

  HyperspaceEngine.CONFIG = CONFIG;
  HyperspaceEngine.NOISE_GLSL = NOISE_GLSL;
  HyperspaceEngine.sampleAnnularRadius = sampleAnnularRadius;

  global.HyperspaceEngine = HyperspaceEngine;
  global.KW = global.KW || {};
  global.KW.HyperspaceEngine = HyperspaceEngine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HyperspaceEngine;
  }
})(typeof window !== 'undefined' ? window : globalThis);
