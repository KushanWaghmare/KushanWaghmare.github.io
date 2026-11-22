(function (global) {
  'use strict';

  var MAX_ROLL_RAD = 0.17453292519943295;  // +/- 10 deg
  var MAX_PITCH_RAD = 0.08726646259971647; // +/- 5 deg
  var MAX_BUFFET_ROLL_RAD = 1.8 * Math.PI / 180.0; // +/- 1.8 deg
  var SPRING_STIFFNESS = 28.0;
  var SPRING_DAMPING = 9.5;
  var EMPTY_STATE = {};

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function grad1D(ix) {
    var n = Math.sin(ix * 127.1 + 311.7) * 43758.5453123;
    return (n - Math.floor(n)) * 2.0 - 1.0;
  }

  function perlin1D(x) {
    var i0 = Math.floor(x);
    var f = x - i0;
    var u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    var g0 = grad1D(i0) * f;
    var g1 = grad1D(i0 + 1) * (f - 1.0);
    return g0 + (g1 - g0) * u;
  }

  function normalizeSectionId(sectionId) {
    if (sectionId === 0 || sectionId === '0') return 'laniakea';
    if (sectionId === 1 || sectionId === '1') return 'math';
    if (sectionId === 2 || sectionId === '2') return 'physics';
    if (sectionId === 3 || sectionId === '3') return 'datascience';
    if (sectionId === 4 || sectionId === '4') return 'quant';
    if (sectionId === 5 || sectionId === '5') return 'cs';
    if (sectionId === 6 || sectionId === '6') return 'contact';
    if (!sectionId) return 'math';
    var s = String(sectionId).toLowerCase().trim();
    if (s.indexOf('domain-') === 0) s = s.slice(7);
    if (s.indexOf('about-') === 0) s = s.slice(6);
    if (s === 'laniakea' || s === 'intro') return 'laniakea';
    if (s === 'data-science' || s === 'ds') return 'datascience';
    if (s === 'quant-finance' || s === 'finance') return 'quant';
    if (s === 'computer-science') return 'cs';
    if (s === 'math' || s === 'physics' || s === 'datascience' || s === 'quant' || s === 'cs' || s === 'contact') {
      return s;
    }
    return 'math';
  }

  // ---- Dynamic Ion Thruster Plume Shader ----

  var PLUME_VERT = [
    'varying float vAxial;',
    'varying vec3 vNormalV;',
    'varying vec3 vViewDir;',
    'void main() {',
    '  vAxial = clamp(-position.z, 0.0, 1.0);',
    '  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);',
    '  vNormalV = normalize(normalMatrix * normal);',
    '  vViewDir = normalize(-mvPos.xyz);',
    '  gl_Position = projectionMatrix * mvPos;',
    '}'
  ].join('\n');

  var PLUME_FRAG = [
    'uniform float uTime;',
    'uniform float uThrusterPower;',
    'uniform float uSonarPulse;',
    'uniform float uIsCore;',
    'varying float vAxial;',
    'varying vec3 vNormalV;',
    'varying vec3 vViewDir;',
    'void main() {',
    '  float edge = pow(abs(dot(normalize(vNormalV), normalize(vViewDir))), uIsCore > 0.5 ? 1.15 : 1.65);',
    '  float axialFade = pow(max(1.0 - vAxial, 0.0), uIsCore > 0.5 ? 1.45 : 1.85);',
    '  float nozzleEntry = smoothstep(0.0, 0.06, vAxial);',
    '  float power = clamp(uThrusterPower, 0.0, 1.0);',
    '  float pulse = clamp(uSonarPulse, 0.0, 1.0);',
    '  float wave = 0.5 + 0.5 * sin(vAxial * 22.0 - uTime * (16.0 + 34.0 * power));',
    '  float machDiamonds = pow(wave, 2.4) * (0.25 + 0.95 * power) * (1.0 - vAxial * 0.65);',
    '  vec3 idleCyan = vec3(0.220, 0.741, 0.973);',
    '  vec3 hotIce = vec3(0.878, 0.969, 1.000);',
    '  vec3 whiteHot = vec3(1.0, 1.0, 1.0);',
    '  vec3 col = mix(idleCyan, hotIce, smoothstep(0.05, 0.85, power));',
    '  col = mix(col, whiteHot, clamp(machDiamonds * 0.75 + uIsCore * power * 0.65, 0.0, 1.0));',
    '  float intensity = (0.42 + power * 0.95 + pulse * 0.55) * (0.75 + machDiamonds * 0.55);',
    '  float alpha = edge * axialFade * nozzleEntry * intensity * (uIsCore > 0.5 ? 0.95 : 0.68);',
    '  gl_FragColor = vec4(col * alpha, alpha);',
    '}'
  ].join('\n');

  function createPlumeMaterial(sharedUniforms, isCore) {
    var THREE = global.THREE;
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: sharedUniforms.uTime,
        uThrusterPower: sharedUniforms.uThrusterPower,
        uSonarPulse: sharedUniforms.uSonarPulse,
        uIsCore: { value: isCore ? 1.0 : 0.0 }
      },
      vertexShader: PLUME_VERT,
      fragmentShader: PLUME_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
  }

  function buildPlumeConeGeometry(radius) {
    var THREE = global.THREE;
    var geom = new THREE.ConeGeometry(radius, 1.0, 16, 6, true);
    // Orient base at z = 0 and tip at z = -1.0
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, 0, -0.5);
    return geom;
  }

  // ---- SpacecraftController ----

  function SpacecraftController(scene) {
    var THREE = global.THREE;
    this.scene = scene || null;
    this.group = new THREE.Group();
    this.group.name = 'HyperspaceInterceptor';
    this.group.visible = false;

    this.attitudeGroup = new THREE.Group();
    this.group.add(this.attitudeGroup);

    this._geometries = [];
    this._materials = [];
    this._plumes = [];
    this._nozzleCores = [];

    this._uniforms = {
      uTime: { value: 0 },
      uTunnelRimIntensity: { value: 0 },
      uDomainLightIntensity: { value: 0 },
      uDomainAmbientColor: { value: new THREE.Color(0x38bdf8) },
      uThrusterPower: { value: 0 },
      uSonarPulse: { value: 0 }
    };

    // Banking, attitude & live kinematics state
    this.currentVelocity = new THREE.Vector3();
    this._prevPosition = new THREE.Vector3();
    this._hasPrevPosition = false;
    this._hasExplicitVelocity = false;
    this._pointerX = 0;
    this._pointerY = 0;
    this._bankRoll = 0;
    this._bankRollVel = 0;
    this._bankPitch = 0;
    this._bankPitchVel = 0;
    this._extraRoll = 0;
    this._extraPitch = 0;
    this._buffetRoll = 0;
    this._tmpVec = new THREE.Vector3();
    this._tmpColor = new THREE.Color();
    this._dockPos = new THREE.Vector3();
    this._dockVel = new THREE.Vector3();
    this._dockLookAt = new THREE.Vector3();
    this._dockDir = new THREE.Vector3();
    this._dockPose = {
      position: this._dockPos,
      velocity: this._dockVel,
      lookAt: this._dockLookAt,
      roll: 0
    };
    this._idleCyan = new THREE.Color(0x38bdf8);
    this._hotWhite = new THREE.Color(0xeefaff);
    this._disposed = false;

    this._buildThrusters();
    this._loadCustomModel('spacecraft.glb');

    if (this.scene && typeof this.scene.add === 'function') {
      this.scene.add(this.group);
    }
  }

  SpacecraftController.prototype._trackGeo = function (geo) {
    this._geometries.push(geo);
    return geo;
  };

  SpacecraftController.prototype._trackMat = function (mat) {
    this._materials.push(mat);
    return mat;
  };

  SpacecraftController.prototype._buildThrusters = function () {
    var THREE = global.THREE;
    var root = this.attitudeGroup;

    var nozzleCowlMat = this._trackMat(new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.88,
      roughness: 0.28
    }));

    // Twin recessed ion thruster nozzles + additive plumes
    var cowlGeo = this._trackGeo(new THREE.CylinderGeometry(0.115, 0.135, 0.22, 16, 1, true));
    cowlGeo.rotateX(Math.PI / 2);

    var throatGeo = this._trackGeo(new THREE.CircleGeometry(0.095, 16));
    throatGeo.rotateY(Math.PI); // face aft (-Z)

    var outerPlumeGeo = this._trackGeo(buildPlumeConeGeometry(0.115));
    var innerPlumeGeo = this._trackGeo(buildPlumeConeGeometry(0.058));
    var outerPlumeMat = this._trackMat(createPlumeMaterial(this._uniforms, false));
    var innerPlumeMat = this._trackMat(createPlumeMaterial(this._uniforms, true));

    var nozzleOffsets = [-0.20, 0.20];
    for (var i = 0; i < nozzleOffsets.length; i++) {
      var nx = nozzleOffsets[i];
      var cowl = new THREE.Mesh(cowlGeo, nozzleCowlMat);
      cowl.position.set(nx, -0.015, -0.96);
      root.add(cowl);

      var throatMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      var throat = new THREE.Mesh(throatGeo, throatMat);
      throat.position.set(nx, -0.015, -1.03);
      root.add(throat);
      this._nozzleCores.push(throatMat);

      var outerPlume = new THREE.Mesh(outerPlumeGeo, outerPlumeMat);
      outerPlume.position.set(nx, -0.015, -1.03);
      outerPlume.frustumCulled = false;
      root.add(outerPlume);

      var innerPlume = new THREE.Mesh(innerPlumeGeo, innerPlumeMat);
      innerPlume.position.set(nx, -0.015, -1.03);
      innerPlume.frustumCulled = false;
      root.add(innerPlume);

      this._plumes.push({ outer: outerPlume, inner: innerPlume });
    }
  };

  SpacecraftController.prototype._loadCustomModel = function (url) {
    var THREE = global.THREE;
    if (!THREE || typeof THREE.GLTFLoader !== 'function') return;

    var self = this;
    var loader = new THREE.GLTFLoader();
    loader.load(
      url,
      function (gltf) {
        var model = gltf && gltf.scene;
        if (!model) return;

        var trackMeshResources = function (rootObj, intoList) {
          rootObj.traverse(function (obj) {
            if (!obj.isMesh) return;
            if (obj.geometry) intoList ? self._trackGeo(obj.geometry) : obj.geometry.dispose();
            if (obj.material) {
              var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
              for (var m = 0; m < mats.length; m++) {
                if (intoList) self._trackMat(mats[m]);
                else mats[m].dispose();
              }
            }
          });
        };

        if (self._disposed) {
          trackMeshResources(model, false);
          return;
        }

        // Centre and normalise to match the procedural interceptor's ~2.2-unit footprint
        var box = new THREE.Box3().setFromObject(model);
        var size = new THREE.Vector3();
        var centre = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(centre);
        var maxDim = Math.max(size.x, size.y, size.z, 1e-4);
        var scale = 2.2 / maxDim;

        model.scale.setScalar(scale);
        model.position.set(-centre.x * scale, -centre.y * scale, -centre.z * scale);
        model.name = 'CustomSpacecraftGLB';

        trackMeshResources(model, true);
        self.attitudeGroup.add(model);
        self._customModel = model;
      },
      undefined,
      function (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('SpacecraftController: failed to load custom GLB.', err);
        }
      }
    );
  };

  SpacecraftController.prototype.setVisible = function (bool) {
    if (this._disposed) return;
    var vis = Boolean(bool);
    this.group.visible = vis;
    if (!vis) {
      this._hasPrevPosition = false;
      this._hasExplicitVelocity = false;
      this.currentVelocity.set(0, 0, 0);
    }
  };

  SpacecraftController.prototype.getKinematics = function () {
    return {
      position: this.group.position.clone(),
      quaternion: this.group.quaternion.clone(),
      velocity: this.currentVelocity.clone()
    };
  };

  SpacecraftController.prototype.setPointer = function (nx, ny) {
    this._pointerX = clamp(Number(nx) || 0, -1, 1);
    this._pointerY = clamp(Number(ny) || 0, -1, 1);
  };

  SpacecraftController.prototype.samplePerlinRollBuffet = function (time) {
    var t = Number(time) || 0;
    var n = 0.55 * perlin1D(t * 4.2) + 0.30 * perlin1D(t * 9.7 + 17.3) + 0.15 * perlin1D(t * 19.3 + 43.1);
    return clamp(n, -1.0, 1.0) * MAX_BUFFET_ROLL_RAD;
  };

  SpacecraftController.prototype._applyAttitude = function () {
    // Nose is +Z, left is +X, up is +Y.
    // Positive roll around +Z banks right wing down; negative pitch around +X pitches nose up.
    this.attitudeGroup.rotation.order = 'ZXY';
    this.attitudeGroup.rotation.x = this._extraPitch + this._bankPitch;
    this.attitudeGroup.rotation.y = 0;
    this.attitudeGroup.rotation.z = this._extraRoll + this._bankRoll + this._buffetRoll;
  };

  SpacecraftController.prototype._syncVelocityHint = function (velocity) {
    if (velocity) {
      this.currentVelocity.set(velocity.x, velocity.y, velocity.z);
      this._hasExplicitVelocity = true;
    }
    if (!this._hasPrevPosition) {
      this._prevPosition.copy(this.group.position);
      this._hasPrevPosition = true;
    }
  };

  SpacecraftController.prototype.setPose = function (position, lookAtTarget, extraRollRad, extraPitchRad, velocity) {
    if (this._disposed) return;
    if (position) {
      this.group.position.set(position.x, position.y, position.z);
    }
    if (lookAtTarget) {
      this._tmpVec.set(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z);
      if (this._tmpVec.distanceToSquared(this.group.position) > 1e-8) {
        this.group.lookAt(this._tmpVec);
      }
    }
    this._extraRoll = extraRollRad || 0;
    this._extraPitch = extraPitchRad || 0;
    this._applyAttitude();
    this._syncVelocityHint(velocity);
  };

  SpacecraftController.prototype.setPoseQuat = function (position, quaternion, bankRollRad, extraPitchRad, velocity) {
    if (this._disposed) return;
    if (position) {
      this.group.position.set(position.x, position.y, position.z);
    }
    if (quaternion) {
      this.group.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    }
    this._extraRoll = bankRollRad || 0;
    this._extraPitch = extraPitchRad || 0;
    this._applyAttitude();
    this._syncVelocityHint(velocity);
  };

  SpacecraftController.prototype.getEntryDockingPose = function (sectionId, time) {
    var sec = normalizeSectionId(sectionId);
    var t = Number(time) || 0;
    var px, py, pz, vx, vy, vz, roll;
    var hasExplicitLookAt = false;

    if (sec === 'laniakea') {
      // 0 Laniakea: parked at alignment altitude y = -0.15 facing -Z
      px = 0.0;
      py = -0.15;
      pz = -8.0;
      vx = 0.0;
      vy = 0.0;
      vz = 0.0;
      roll = 0.0;
      this._dockLookAt.set(0.0, -0.15, -22.0);
      hasExplicitLookAt = true;
    } else if (sec === 'math') {
      // 1 Math: Lissajous equatorial orbit around the central structure
      var wm = 0.24;
      px = 8.2 * Math.sin(wm * t);
      py = 3.6 * Math.sin(2.0 * wm * t + 0.5);
      pz = -22.0 + 4.5 * Math.cos(wm * t);
      vx = 8.2 * wm * Math.cos(wm * t);
      vy = 3.6 * 2.0 * wm * Math.cos(2.0 * wm * t + 0.5);
      vz = -4.5 * wm * Math.sin(wm * t);
      roll = -0.22 * Math.sin(wm * t);
    } else if (sec === 'physics') {
      // 2 Physics: 15-deg inclined Keplerian elliptical orbit
      var wp = 0.28;
      var theta = wp * t + 0.22 * Math.sin(wp * t);
      var dTheta = wp * (1.0 + 0.22 * Math.cos(wp * t));
      var a = 9.2;
      var b = 5.2;
      var inc = 0.2617993877991494; // 15 deg
      var sinInc = Math.sin(inc);
      var cosInc = Math.cos(inc);
      px = a * Math.cos(theta);
      py = b * Math.sin(theta) * sinInc + 0.6 * Math.cos(2.0 * theta);
      pz = -22.0 + b * Math.sin(theta) * cosInc;
      vx = (-a * Math.sin(theta)) * dTheta;
      vy = (b * Math.cos(theta) * sinInc - 1.2 * Math.sin(2.0 * theta)) * dTheta;
      vz = (b * Math.cos(theta) * cosInc) * dTheta;
      roll = 0.32 * (1.0 + 0.25 * Math.cos(wp * t));
    } else if (sec === 'datascience') {
      // 3 Data Science: slow linear drift through the cluster manifold
      var wd = 0.08;
      px = 9.0 * Math.sin(wd * t);
      py = 1.8 * Math.cos(0.7 * wd * t) + 0.5 * Math.sin(0.5 * wd * t);
      pz = -22.0 + 2.8 * Math.sin(1.2 * wd * t);
      vx = 9.0 * wd * Math.cos(wd * t);
      vy = -1.8 * 0.7 * wd * Math.sin(0.7 * wd * t) + 0.5 * 0.5 * wd * Math.cos(0.5 * wd * t);
      vz = 2.8 * 1.2 * wd * Math.cos(1.2 * wd * t);
      roll = -0.08 * Math.sin(wd * t);
    } else if (sec === 'quant') {
      // 4 Quant Finance: tangential crest glide across the volatility surface
      var wq = 0.22;
      px = 9.5 * Math.cos(wq * t);
      py = -1.2 + 1.2 * Math.sin(2.0 * wq * t) + 1.1 * Math.sin(0.7 * wq * t);
      pz = -22.0 + 4.0 * Math.sin(wq * t);
      vx = -9.5 * wq * Math.sin(wq * t);
      vy = 1.2 * 2.0 * wq * Math.cos(2.0 * wq * t) + 1.1 * 0.7 * wq * Math.cos(0.7 * wq * t);
      vz = 4.0 * wq * Math.cos(wq * t);
      roll = 0.24 * Math.cos(wq * t);
    } else if (sec === 'cs') {
      // 5 CS: outer perimeter patrol around the graph topology
      var wc = 0.20;
      var rad = 9.6 + 0.75 * Math.cos(3.0 * wc * t);
      var dRad = -0.75 * 3.0 * wc * Math.sin(3.0 * wc * t);
      var cosW = Math.cos(wc * t);
      var sinW = Math.sin(wc * t);
      px = rad * cosW;
      py = 2.2 * Math.sin(2.0 * wc * t);
      pz = -22.0 + 5.0 * sinW;
      vx = dRad * cosW - rad * wc * sinW;
      vy = 2.2 * 2.0 * wc * Math.cos(2.0 * wc * t);
      vz = 5.0 * wc * cosW;
      roll = 0.20 + 0.06 * Math.sin(3.0 * wc * t);
    } else {
      // 6 Contact: stationary hover at the edge of the node/sonar network
      var wk = 0.55;
      px = 6.8 + 0.35 * Math.sin(0.6 * wk * t);
      py = -1.6 + 0.45 * Math.sin(wk * t);
      pz = -22.0 + 0.25 * Math.cos(0.8 * wk * t);
      vx = 0.35 * 0.6 * wk * Math.cos(0.6 * wk * t);
      vy = 0.45 * wk * Math.cos(wk * t);
      vz = -0.25 * 0.8 * wk * Math.sin(0.8 * wk * t);
      roll = -0.08 + 0.04 * Math.cos(0.7 * wk * t);
      this._dockLookAt.set(0, 0, -22.0);
      hasExplicitLookAt = true;
    }

    this._dockPos.set(px, py, pz);
    this._dockVel.set(vx, vy, vz);

    if (!hasExplicitLookAt) {
      this._dockDir.copy(this._dockVel);
      if (this._dockDir.lengthSq() > 1e-6) {
        this._dockDir.normalize().multiplyScalar(6.0);
      } else {
        this._dockDir.set(0, 0, -6.0);
      }
      this._dockLookAt.copy(this._dockPos).add(this._dockDir);
    }

    this._dockPose.roll = roll;
    return this._dockPose;
  };

  SpacecraftController.prototype.update = function (dt, state) {
    if (this._disposed) return;
    var s = state || EMPTY_STATE;
    var step = clamp(Number(dt) || 0, 0, 0.05);

    var time = s.time != null ? Number(s.time) : (this._uniforms.uTime.value + step);
    var tunnelRim = clamp(Number(s.tunnelRimIntensity) || 0, 0, 1);
    var domainLight = clamp(Number(s.domainLightIntensity) || 0, 0, 1);
    var thrusterPower = clamp(Number(s.thrusterPower) || 0, 0, 1);
    var sonarPulse = clamp(Number(s.sonarPulse) || 0, 0, 1);
    var enableBanking = Boolean(s.enablePointerBanking);

    // 0. Live velocity update via finite difference when no explicit velocity was supplied
    if (step > 1e-5) {
      if (!this._hasExplicitVelocity && this._hasPrevPosition) {
        this.currentVelocity.set(
          (this.group.position.x - this._prevPosition.x) / step,
          (this.group.position.y - this._prevPosition.y) / step,
          (this.group.position.z - this._prevPosition.z) / step
        );
      }
      this._prevPosition.copy(this.group.position);
      this._hasPrevPosition = true;
    }
    this._hasExplicitVelocity = false;

    // 1. Update Fresnel & shader uniforms
    this._uniforms.uTime.value = time;
    this._uniforms.uTunnelRimIntensity.value = tunnelRim;
    this._uniforms.uDomainLightIntensity.value = domainLight;
    this._uniforms.uThrusterPower.value = thrusterPower;
    this._uniforms.uSonarPulse.value = sonarPulse;

    if (s.domainAmbientColor != null) {
      if (s.domainAmbientColor.isColor) {
        this._uniforms.uDomainAmbientColor.value.copy(s.domainAmbientColor);
      } else {
        this._uniforms.uDomainAmbientColor.value.set(s.domainAmbientColor);
      }
    }

    // 2. Spring-damped pointer banking (+/- 10 deg roll, +/- 5 deg pitch)
    var targetRoll = enableBanking ? (this._pointerX * MAX_ROLL_RAD) : 0;
    var targetPitch = enableBanking ? (-this._pointerY * MAX_PITCH_RAD) : 0;

    if (step > 0) {
      var rollAcc = (targetRoll - this._bankRoll) * SPRING_STIFFNESS - this._bankRollVel * SPRING_DAMPING;
      this._bankRollVel += rollAcc * step;
      this._bankRoll += this._bankRollVel * step;

      var pitchAcc = (targetPitch - this._bankPitch) * SPRING_STIFFNESS - this._bankPitchVel * SPRING_DAMPING;
      this._bankPitchVel += pitchAcc * step;
      this._bankPitch += this._bankPitchVel * step;
    }

    var vibAmp = s.vibrationAmp != null ? clamp(Number(s.vibrationAmp) || 0, 0, 0.1) : 0;
    if (vibAmp > 0) {
      this.attitudeGroup.position.set(
        vibAmp * Math.sin(time * 47.0),
        vibAmp * Math.cos(time * 53.0),
        0
      );
    } else {
      this.attitudeGroup.position.set(0, 0, 0);
    }

    var buffetAmp = s.rollBuffetAmp != null ? clamp(Number(s.rollBuffetAmp) || 0, 0, 1) : 0;
    this._buffetRoll = buffetAmp > 0 ? this.samplePerlinRollBuffet(time) * buffetAmp : 0;

    this._applyAttitude();

    // 3. Dynamic ion thruster plume scaling & nozzle throat color temperature
    var shimmer = 1.0 + 0.035 * Math.sin(time * 47.0);
    var outerLen = (0.44 + thrusterPower * 2.15 + sonarPulse * 0.55) * shimmer;
    var outerRad = 0.85 + thrusterPower * 0.45 + sonarPulse * 0.20;
    var innerLen = (0.28 + thrusterPower * 1.65 + sonarPulse * 0.35) * shimmer;
    var innerRad = 0.80 + thrusterPower * 0.50 + sonarPulse * 0.18;

    for (var i = 0; i < this._plumes.length; i++) {
      var p = this._plumes[i];
      p.outer.scale.set(outerRad, outerRad, outerLen);
      p.inner.scale.set(innerRad, innerRad, innerLen);
    }

    var tempMix = clamp(thrusterPower * 0.9 + sonarPulse * 0.35, 0, 1);
    this._tmpColor.copy(this._idleCyan).lerp(this._hotWhite, tempMix);
    for (var j = 0; j < this._nozzleCores.length; j++) {
      this._nozzleCores[j].color.copy(this._tmpColor);
      this._nozzleCores[j].opacity = clamp(0.65 + thrusterPower * 0.35 + sonarPulse * 0.25, 0, 1);
    }
  };

  SpacecraftController.prototype.dispose = function () {
    if (this._disposed) return;
    this._disposed = true;

    for (var i = 0; i < this._geometries.length; i++) {
      this._geometries[i].dispose();
    }
    for (var j = 0; j < this._materials.length; j++) {
      this._materials[j].dispose();
    }
    this._geometries.length = 0;
    this._materials.length = 0;
    this._plumes.length = 0;
    this._nozzleCores.length = 0;

    if (this.scene && typeof this.scene.remove === 'function') {
      this.scene.remove(this.group);
    }
    this.scene = null;
  };

  SpacecraftController.normalizeSectionId = normalizeSectionId;

  global.SpacecraftController = SpacecraftController;
  global.KW = global.KW || {};
  global.KW.SpacecraftController = SpacecraftController;
})(typeof window !== 'undefined' ? window : this);
