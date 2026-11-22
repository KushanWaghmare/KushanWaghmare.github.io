(function (global) {
    "use strict";

    /**
     * Timeline-locked Web Audio synthesiser for the 12-second hyperspace jump.
     * Attaches to the persistent global AudioContext exposed by window.SOUND / window.KW.audio.
     */
    class HyperspaceAudio {
        constructor() {
            this._ctx = null;
            this._masterGain = null;
            this._pinkNoiseBuffer = null;
            this._softClipCurve = null;

            this._active = false;
            this._lastMuted = null;

            // Idempotent timeline phase flags
            this._alignTriggered = false;
            this._spoolTriggered = false;
            this._slamTriggered = false;
            this._dropoutTriggered = false;
            this._vacuumTriggered = false;
            this._snapTriggered = false;

            // Active continuous voices
            this._align = null;
            this._spool = null;
            this._roar = null;

            // Tracked one-shot sources/nodes for clean stop() and dispose()
            this._oneShots = new Set();
        }

        _resolveContext() {
            if (this._ctx && this._ctx.state !== "closed") {
                return this._ctx;
            }
            const sound = global.SOUND || (global.KW && global.KW.audio);
            let ctx = null;
            if (sound && typeof sound.getContext === "function") {
                try {
                    ctx = sound.getContext();
                } catch (_) {
                    ctx = null;
                }
            }
            if (ctx && ctx.state !== "closed") {
                this._ctx = ctx;
                return this._ctx;
            }
            return null;
        }

        _isMuted() {
            const sound = global.SOUND || (global.KW && global.KW.audio);
            if (sound && typeof sound.isMuted === "function") {
                try {
                    return Boolean(sound.isMuted());
                } catch (_) {}
            }
            if (sound && typeof sound.isEnabled === "function") {
                try {
                    return !sound.isEnabled();
                } catch (_) {}
            }
            try {
                if (typeof localStorage !== "undefined") {
                    return localStorage.getItem("kw_audio_muted") === "true";
                }
            } catch (_) {}
            return false;
        }

        _ensureMasterGain() {
            const ctx = this._resolveContext();
            if (!ctx) return null;

            if (!this._masterGain || this._masterGain.context !== ctx) {
                if (this._masterGain) {
                    try { this._masterGain.disconnect(); } catch (_) {}
                }
                const gain = ctx.createGain();
                const muted = this._isMuted();
                gain.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
                gain.connect(ctx.destination);
                this._masterGain = gain;
                this._lastMuted = muted;
            }
            return this._masterGain;
        }

        _syncMuteState() {
            if (!this._ctx || !this._masterGain) return;
            const muted = this._isMuted();
            if (muted !== this._lastMuted) {
                this._lastMuted = muted;
                const now = this._ctx.currentTime;
                try {
                    this._masterGain.gain.cancelScheduledValues(now);
                    this._masterGain.gain.setTargetAtTime(muted ? 0 : 1, now, 0.02);
                } catch (_) {}
            }
            if (!muted && this._ctx.state === "suspended") {
                try {
                    this._ctx.resume().catch(() => {});
                } catch (_) {}
            }
        }

        _getPinkNoiseBuffer(ctx) {
            const sr = ctx.sampleRate || 44100;
            if (this._pinkNoiseBuffer && this._pinkNoiseBuffer.sampleRate === sr) {
                return this._pinkNoiseBuffer;
            }
            const length = Math.floor(sr * 3.0);
            const buffer = ctx.createBuffer(1, length, sr);
            const out = buffer.getChannelData(0);

            // Paul Kellet pink noise filter
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            let peak = 0.001;
            for (let i = 0; i < length; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                const sample = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                b6 = white * 0.115926;
                out[i] = sample;
                const abs = Math.abs(sample);
                if (abs > peak) peak = abs;
            }

            const norm = 0.85 / peak;
            for (let i = 0; i < length; i++) {
                out[i] *= norm;
            }

            this._pinkNoiseBuffer = buffer;
            return buffer;
        }

        _getSoftClipCurve() {
            if (this._softClipCurve) return this._softClipCurve;
            const n = 1024;
            const curve = new Float32Array(n);
            const drive = 2.4;
            const denom = Math.tanh(drive);
            for (let i = 0; i < n; i++) {
                const x = (i * 2) / (n - 1) - 1;
                curve[i] = Math.tanh(x * drive) / denom;
            }
            this._softClipCurve = curve;
            return curve;
        }

        _registerOneShot(source, nodes) {
            const entry = { source, nodes };
            this._oneShots.add(entry);
            source.onended = () => {
                this._oneShots.delete(entry);
                for (let i = 0; i < nodes.length; i++) {
                    try { nodes[i].disconnect(); } catch (_) {}
                }
            };
        }

        /**
         * Phase 1 (0.0s–1.8s): Departure alignment 40Hz sine hum panning softly
         * with lateral movement.
         */
        _startAlignment(t, pan) {
            const ctx = this._ctx;
            const master = this._masterGain;
            if (!ctx || !master) return;

            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            osc.type = "sine";
            osc.frequency.setValueAtTime(40, now);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.12, now + 0.14);

            let panner = null;
            if (typeof ctx.createStereoPanner === "function") {
                panner = ctx.createStereoPanner();
                panner.pan.setValueAtTime(0, now);
                osc.connect(panner);
                panner.connect(gain);
            } else {
                osc.connect(gain);
            }
            gain.connect(master);
            osc.start(now);

            this._align = {
                osc,
                panner,
                gain,
                fadingOut: false
            };

            this._updateAlignment(t, pan);
        }

        _updateAlignment(t, pan) {
            if (!this._align || !this._ctx || this._align.fadingOut) return;
            const now = this._ctx.currentTime;
            const p = Math.max(0, Math.min(1, t / 1.8));
            const level = 0.12 * (0.65 + 0.35 * Math.sin(p * Math.PI));
            this._align.gain.gain.setTargetAtTime(level, now, 0.04);

            if (this._align.panner) {
                const rawPan = typeof pan === "number"
                    ? pan
                    : Math.sin(p * Math.PI) * 0.35;
                const clampedPan = Math.max(-0.65, Math.min(0.65, rawPan));
                this._align.panner.pan.setTargetAtTime(clampedPan, now, 0.05);
            }
        }

        _stopAlignment(fadeSeconds) {
            const align = this._align;
            if (!align) return;
            this._align = null;
            align.fadingOut = true;

            const ctx = this._ctx;
            const fade = Math.max(0.015, fadeSeconds || 0.15);
            const nodes = align.panner
                ? [align.osc, align.panner, align.gain]
                : [align.osc, align.gain];

            if (!ctx) {
                for (let i = 0; i < nodes.length; i++) {
                    try { nodes[i].disconnect(); } catch (_) {}
                }
                return;
            }

            const now = ctx.currentTime;
            try {
                align.gain.gain.cancelScheduledValues(now);
                align.gain.gain.setTargetAtTime(0.0001, now, fade * 0.3);
                align.osc.stop(now + fade + 0.03);
                this._registerOneShot(align.osc, nodes);
            } catch (_) {
                for (let i = 0; i < nodes.length; i++) {
                    try { nodes[i].disconnect(); } catch (__) {}
                }
            }
        }

        /**
         * Phase 2–3 (1.8s–3.5s): Engine spool bandpass-filtered sawtooth sweep
         * 120Hz->450Hz (Q=3.5) during 1.8s–2.5s (continuing through 3.5s)
         * + rising pink-noise air hiss.
         */
        _startSpool(t) {
            const ctx = this._ctx;
            const master = this._masterGain;
            if (!ctx || !master) return;

            if (this._align) {
                this._stopAlignment(0.16);
            }

            const now = ctx.currentTime;

            // Sawtooth turbine voice
            const osc = ctx.createOscillator();
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(120, now);
            const bp = ctx.createBiquadFilter();
            bp.type = "bandpass";
            bp.frequency.setValueAtTime(222, now);
            bp.Q.setValueAtTime(3.5, now);
            const oscGain = ctx.createGain();
            oscGain.gain.setValueAtTime(0.0001, now);

            osc.connect(bp);
            bp.connect(oscGain);
            oscGain.connect(master);

            // Rising pink-noise turbulence
            const noiseSrc = ctx.createBufferSource();
            noiseSrc.buffer = this._getPinkNoiseBuffer(ctx);
            noiseSrc.loop = true;

            const noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = "bandpass";
            noiseFilter.frequency.setValueAtTime(280, now);
            noiseFilter.Q.setValueAtTime(1.2, now);
            const noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(0.0001, now);

            noiseSrc.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(master);

            osc.start(now);
            noiseSrc.start(now);

            this._spool = {
                osc,
                bp,
                oscGain,
                noiseSrc,
                noiseFilter,
                noiseGain,
                fadingOut: false
            };

            this._updateSpool(t);
        }

        _updateSpool(t) {
            if (!this._spool || !this._ctx || this._spool.fadingOut) return;
            const now = this._ctx.currentTime;

            let freq;
            let progress;
            if (t <= 2.5) {
                const p1 = Math.max(0, Math.min(1, (t - 1.8) / 0.7));
                freq = 120 * Math.pow(450 / 120, p1);
                progress = p1 * 0.5;
            } else {
                const p2 = Math.max(0, Math.min(1, (t - 2.5) / 1.0));
                freq = 450 * Math.pow(1100 / 450, p2);
                progress = 0.5 + p2 * 0.5;
            }

            const bpCutoff = Math.min(3600, freq * 1.85);
            const turbineLevel = 0.02 + progress * 0.14;
            const turbCutoff = 280 + progress * 1250;
            const turbLevel = 0.015 + Math.pow(progress, 1.4) * 0.16;

            this._spool.osc.frequency.setTargetAtTime(freq, now, 0.025);
            this._spool.bp.frequency.setTargetAtTime(bpCutoff, now, 0.025);
            this._spool.oscGain.gain.setTargetAtTime(turbineLevel, now, 0.03);

            this._spool.noiseFilter.frequency.setTargetAtTime(turbCutoff, now, 0.03);
            this._spool.noiseGain.gain.setTargetAtTime(turbLevel, now, 0.035);
        }

        _stopSpool(fadeSeconds) {
            const spool = this._spool;
            if (!spool) return;
            this._spool = null;
            spool.fadingOut = true;

            const ctx = this._ctx;
            const fade = Math.max(0.015, fadeSeconds || 0.18);
            const nodes = [
                spool.osc, spool.bp, spool.oscGain,
                spool.noiseSrc, spool.noiseFilter, spool.noiseGain
            ];

            if (!ctx) {
                for (let i = 0; i < nodes.length; i++) {
                    try { nodes[i].disconnect(); } catch (_) {}
                }
                return;
            }

            const now = ctx.currentTime;
            try {
                spool.oscGain.gain.cancelScheduledValues(now);
                spool.oscGain.gain.setTargetAtTime(0.0001, now, fade * 0.3);
                spool.noiseGain.gain.cancelScheduledValues(now);
                spool.noiseGain.gain.setTargetAtTime(0.0001, now, fade * 0.3);
                spool.osc.stop(now + fade + 0.03);
                spool.noiseSrc.stop(now + fade + 0.03);
                this._registerOneShot(spool.osc, nodes);
            } catch (_) {
                for (let i = 0; i < nodes.length; i++) {
                    try { nodes[i].disconnect(); } catch (__) {}
                }
            }
        }

        /**
         * Phase 4 (3.5s–6.5s): Ignition & tunnel roar: 40Hz sine drop impact
         * transitioning into low-pass filtered wind roar (80Hz–250Hz).
         */
        _startTunnelSlamAndRoar(t) {
            const ctx = this._ctx;
            const master = this._masterGain;
            if (!ctx || !master) return;

            if (this._align) {
                this._stopAlignment(0.12);
            }
            // Crossfade spool out cleanly into the slam
            if (this._spool) {
                this._stopSpool(0.22);
            }

            const now = ctx.currentTime;

            // 1. 40Hz sub-bass impact one-shot (only if entering near 3.5s)
            if (t < 4.5) {
                const subOsc = ctx.createOscillator();
                subOsc.type = "sine";
                subOsc.frequency.setValueAtTime(62, now);
                subOsc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
                subOsc.frequency.setValueAtTime(40, now + 0.85);

                const subGain = ctx.createGain();
                subGain.gain.setValueAtTime(0.0001, now);
                subGain.gain.linearRampToValueAtTime(0.42, now + 0.015);
                subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.92);

                subOsc.connect(subGain);
                subGain.connect(master);
                subOsc.start(now);
                subOsc.stop(now + 0.95);
                this._registerOneShot(subOsc, [subOsc, subGain]);
            }

            // 2. Hollow low-pass filtered wind roar (80Hz–250Hz)
            const roarSrc = ctx.createBufferSource();
            roarSrc.buffer = this._getPinkNoiseBuffer(ctx);
            roarSrc.loop = true;

            const lp = ctx.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.setValueAtTime(220, now);
            lp.Q.setValueAtTime(2.6, now);

            const roarGain = ctx.createGain();
            roarGain.gain.setValueAtTime(0.0001, now);
            roarGain.gain.linearRampToValueAtTime(0.26, now + 0.14);

            roarSrc.connect(lp);
            lp.connect(roarGain);
            roarGain.connect(master);
            roarSrc.start(now);

            this._roar = {
                src: roarSrc,
                lp,
                gain: roarGain
            };
        }

        _updateRoar(t) {
            if (!this._roar || !this._ctx) return;
            const now = this._ctx.currentTime;
            // Subtle hollow undulation strictly bounded within 80Hz–250Hz
            const mod = Math.sin((t - 3.5) * 1.9) * 55 + Math.sin((t - 3.5) * 0.75) * 25;
            const cutoff = Math.max(80, Math.min(250, 165 + mod));
            this._roar.lp.frequency.setTargetAtTime(cutoff, now, 0.06);
        }

        /**
         * Phase 5 (6.5s–7.8s): Vacuum choke: exponential volume decay into
         * 100ms near-silence dip right before t=8.0s (7.9s–8.0s).
         */
        _startDropout() {
            const ctx = this._ctx;
            const master = this._masterGain;
            if (!ctx || !master) return;

            if (this._align) {
                this._stopAlignment(0.08);
            }
            if (this._spool) {
                this._stopSpool(0.12);
            }

            // If fast-forwarded before roar started, spawn a brief wind-down bed to choke
            if (!this._roar) {
                const now = ctx.currentTime;
                const src = ctx.createBufferSource();
                src.buffer = this._getPinkNoiseBuffer(ctx);
                src.loop = true;

                const lp = ctx.createBiquadFilter();
                lp.type = "lowpass";
                lp.frequency.setValueAtTime(180, now);
                lp.Q.setValueAtTime(2.4, now);

                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.linearRampToValueAtTime(0.18, now + 0.04);

                src.connect(lp);
                lp.connect(gain);
                gain.connect(master);
                src.start(now);

                this._roar = { src, lp, gain };
            }
        }

        _updateDropout(t) {
            if (!this._roar || !this._ctx) return;
            const now = this._ctx.currentTime;
            const p = Math.max(0, Math.min(1, (t - 6.5) / 1.3)); // 6.5s -> 7.8s
            // Rapid exponential filter choke from 200Hz down to 35Hz
            const cutoff = 200 * Math.pow(35 / 200, Math.pow(p, 0.75));
            // Exponential volume decay toward near-silence by 7.8s
            const level = Math.max(0.0001, 0.24 * Math.pow(0.0004, p));

            this._roar.lp.frequency.setTargetAtTime(cutoff, now, 0.025);
            this._roar.gain.gain.setTargetAtTime(level, now, 0.025);
        }

        _enterVacuumDip() {
            if (this._align) {
                this._stopAlignment(0.02);
            }
            if (this._spool) {
                this._stopSpool(0.02);
            }
            const roar = this._roar;
            if (!roar) return;
            this._roar = null;

            const ctx = this._ctx;
            const nodes = [roar.src, roar.lp, roar.gain];
            if (!ctx) {
                for (let i = 0; i < nodes.length; i++) {
                    try { nodes[i].disconnect(); } catch (_) {}
                }
                return;
            }

            const now = ctx.currentTime;
            try {
                roar.gain.gain.cancelScheduledValues(now);
                roar.gain.gain.setTargetAtTime(0.0001, now, 0.012);
                roar.src.stop(now + 0.05);
                this._registerOneShot(roar.src, nodes);
            } catch (_) {
                for (let i = 0; i < nodes.length; i++) {
                    try { nodes[i].disconnect(); } catch (__) {}
                }
            }
        }

        /**
         * Phase 6 (t=8.0s): Exit snap: 2.4kHz mechanical click (35ms decay)
         * + 90Hz->25Hz sub-bass pitch drop with soft-clipping WaveShaperNode.
         */
        _triggerHardSnap() {
            const ctx = this._ctx;
            const master = this._masterGain;
            if (!ctx || !master) return;

            this._enterVacuumDip();
            const now = ctx.currentTime;

            // 1. Massive sub-bass pitch drop (90Hz -> 25Hz) through soft-clipping WaveShaperNode
            const subOsc = ctx.createOscillator();
            subOsc.type = "sine";
            subOsc.frequency.setValueAtTime(90, now);
            subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.58);

            const shaper = ctx.createWaveShaper();
            shaper.curve = this._getSoftClipCurve();
            shaper.oversample = "2x";

            const subGain = ctx.createGain();
            subGain.gain.setValueAtTime(0.0001, now);
            subGain.gain.linearRampToValueAtTime(0.52, now + 0.008);
            subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.88);

            subOsc.connect(shaper);
            shaper.connect(subGain);
            subGain.connect(master);

            subOsc.start(now);
            subOsc.stop(now + 0.92);
            this._registerOneShot(subOsc, [subOsc, shaper, subGain]);

            // 2. Crisp 2.4kHz mechanical transient snap (35ms decay)
            const snapOsc = ctx.createOscillator();
            snapOsc.type = "triangle";
            snapOsc.frequency.setValueAtTime(2400, now);
            snapOsc.frequency.exponentialRampToValueAtTime(1650, now + 0.035);

            const snapOscGain = ctx.createGain();
            snapOscGain.gain.setValueAtTime(0.28, now);
            snapOscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

            snapOsc.connect(snapOscGain);
            snapOscGain.connect(master);
            snapOsc.start(now);
            snapOsc.stop(now + 0.045);
            this._registerOneShot(snapOsc, [snapOsc, snapOscGain]);

            const snapNoise = ctx.createBufferSource();
            snapNoise.buffer = this._getPinkNoiseBuffer(ctx);

            const snapBp = ctx.createBiquadFilter();
            snapBp.type = "bandpass";
            snapBp.frequency.setValueAtTime(2400, now);
            snapBp.Q.setValueAtTime(4.0, now);

            const snapNoiseGain = ctx.createGain();
            snapNoiseGain.gain.setValueAtTime(0.32, now);
            snapNoiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

            snapNoise.connect(snapBp);
            snapBp.connect(snapNoiseGain);
            snapNoiseGain.connect(master);
            snapNoise.start(now);
            snapNoise.stop(now + 0.045);
            this._registerOneShot(snapNoise, [snapNoise, snapBp, snapNoiseGain]);
        }

        startJump(startTime = 0) {
            this.stop();

            this._alignTriggered = false;
            this._spoolTriggered = false;
            this._slamTriggered = false;
            this._dropoutTriggered = false;
            this._vacuumTriggered = false;
            this._snapTriggered = false;
            this._active = true;

            this._ensureMasterGain();
            this._syncMuteState();

            this.update(startTime > 0 ? startTime : 0);
        }

        update(t, pan) {
            if (!this._active) return;

            if (!this._masterGain) {
                this._ensureMasterGain();
            }
            this._syncMuteState();
            if (!this._ctx || !this._masterGain) return;

            // Phase 1: 0.0s–1.8s Departure alignment 40Hz sine hum with lateral pan
            if (t >= 0 && t < 1.8) {
                if (!this._alignTriggered) {
                    this._alignTriggered = true;
                    this._startAlignment(t, pan);
                } else {
                    this._updateAlignment(t, pan);
                }
            }

            // Phase 2–3: 1.8s–3.5s Engine spool & acceleration
            if (t >= 1.8 && t < 3.5) {
                this._alignTriggered = true;
                if (!this._spoolTriggered) {
                    this._spoolTriggered = true;
                    this._startSpool(t);
                } else {
                    this._updateSpool(t);
                }
            }

            // Phase 4: 3.5s–6.5s Ignition & tunnel roar
            if (t >= 3.5 && t < 6.5) {
                if (!this._slamTriggered) {
                    this._alignTriggered = true;
                    this._spoolTriggered = true;
                    this._slamTriggered = true;
                    this._startTunnelSlamAndRoar(t);
                } else {
                    this._updateRoar(t);
                }
            }

            // Phase 5: 6.5s–7.8s Vacuum choke
            if (t >= 6.5 && t < 7.9) {
                if (!this._dropoutTriggered) {
                    this._alignTriggered = true;
                    this._spoolTriggered = true;
                    this._slamTriggered = true;
                    this._dropoutTriggered = true;
                    this._startDropout();
                }
                if (t < 7.8) {
                    this._updateDropout(t);
                } else if (!this._vacuumTriggered) {
                    this._updateDropout(7.8);
                }
            }

            // 7.9s–8.0s: 100ms near-silence dip right before Exit snap
            if (t >= 7.9 && t < 8.0 && !this._vacuumTriggered) {
                this._vacuumTriggered = true;
                this._enterVacuumDip();
            }

            // Phase 6: t=8.0s Exit snap
            if (t >= 8.0 && !this._snapTriggered) {
                this._alignTriggered = true;
                this._spoolTriggered = true;
                this._slamTriggered = true;
                this._dropoutTriggered = true;
                this._vacuumTriggered = true;
                this._snapTriggered = true;
                this._triggerHardSnap();
            }
        }

        fastForwardTo(t) {
            if (!this._active) return;
            const target = typeof t === "number" ? t : 6.5;

            if (!this._masterGain) {
                this._ensureMasterGain();
            }
            this._syncMuteState();

            if (this._align) {
                this._stopAlignment(0.06);
            }
            // Cleanly silence/ramp any active spool before entering dropout
            if (this._spool) {
                this._stopSpool(0.08);
            }

            if (target >= 6.5 && target < 8.0) {
                this._alignTriggered = true;
                this._spoolTriggered = true;
                this._slamTriggered = true;
                if (!this._dropoutTriggered) {
                    this._dropoutTriggered = true;
                    this._startDropout();
                }
                if (target < 7.9) {
                    this._updateDropout(Math.min(target, 7.8));
                } else if (!this._vacuumTriggered) {
                    this._vacuumTriggered = true;
                    this._enterVacuumDip();
                }
            } else if (target >= 8.0) {
                this._alignTriggered = true;
                this._spoolTriggered = true;
                this._slamTriggered = true;
                this._dropoutTriggered = true;
                this._vacuumTriggered = true;
                this._enterVacuumDip();
                if (!this._snapTriggered) {
                    this._snapTriggered = true;
                    this._triggerHardSnap();
                }
            } else {
                this.update(target);
            }
        }

        stop() {
            this._active = false;

            if (this._align) {
                const a = this._align;
                this._align = null;
                try { a.osc.stop(); } catch (_) {}
                [a.osc, a.panner, a.gain].forEach((n) => {
                    if (n) {
                        try { n.disconnect(); } catch (_) {}
                    }
                });
            }

            if (this._spool) {
                const s = this._spool;
                this._spool = null;
                try { s.osc.stop(); } catch (_) {}
                try { s.noiseSrc.stop(); } catch (_) {}
                [s.osc, s.bp, s.oscGain, s.noiseSrc, s.noiseFilter, s.noiseGain].forEach((n) => {
                    try { n.disconnect(); } catch (_) {}
                });
            }

            if (this._roar) {
                const r = this._roar;
                this._roar = null;
                try { r.src.stop(); } catch (_) {}
                [r.src, r.lp, r.gain].forEach((n) => {
                    try { n.disconnect(); } catch (_) {}
                });
            }

            this._oneShots.forEach((entry) => {
                try { entry.source.onended = null; } catch (_) {}
                try { entry.source.stop(); } catch (_) {}
                for (let i = 0; i < entry.nodes.length; i++) {
                    try { entry.nodes[i].disconnect(); } catch (_) {}
                }
            });
            this._oneShots.clear();
        }

        dispose() {
            this.stop();
            if (this._masterGain) {
                try { this._masterGain.disconnect(); } catch (_) {}
                this._masterGain = null;
            }
            // Never close the shared AudioContext; only release our references and cached buffers
            this._ctx = null;
            this._pinkNoiseBuffer = null;
            this._softClipCurve = null;
            this._lastMuted = null;
        }
    }

    global.HyperspaceAudio = HyperspaceAudio;
    global.KW = global.KW || {};
    global.KW.HyperspaceAudio = HyperspaceAudio;
})(typeof window !== "undefined" ? window : globalThis);
