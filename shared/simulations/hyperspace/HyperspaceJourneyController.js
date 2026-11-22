/* Laniakea-to-Orbit 12-Second Hyperspace Journey & Spacecraft Orchestrator
   (shared/simulations/hyperspace/HyperspaceJourneyController.js)
   Exposes window.HyperspaceJourneyController and window.KW.HyperspaceJourneyController. */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory(root);
    } else {
        var api = factory(root);
        root.HyperspaceJourneyController = api;
        root.KW = root.KW || {};
        root.KW.HyperspaceJourneyController = api;
    }
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    var TIMELINE = {
        DEPARTURE_END: 1.8,
        SPOOL_START: 1.8,
        SPOOL_END: 2.5,
        IGNITION_END: 3.5,
        SWAP_AT: 5.0,
        TUNNEL_END: 6.5,
        DROPOUT_END: 7.8,
        SNAP_AT: 8.0,
        SHOCKWAVE_END: 8.3,
        HANDOFF_START: 9.0,
        UI_FADE_START: 9.5,
        UI_FADE_END: 11.5,
        TOTAL: 12.0
    };

    var HUB_SECTION_IDS = [
        "intro",
        "domain-math",
        "domain-physics",
        "domain-datascience",
        "domain-quant",
        "domain-cs",
        "about-contact"
    ];

    var DOMAIN_COLORS = {
        intro: 0x38bdf8,
        math: 0x7cb8ff,
        physics: 0xf59e0b,
        datascience: 0x34d399,
        quant: 0xc084fc,
        cs: 0x38bdf8,
        contact: 0x22d3ee
    };

    function clamp(v, lo, hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function smoothstep(edge0, edge1, x) {
        var t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    }

    function quinticEaseOut(u) {
        var t = clamp(u, 0.0, 1.0);
        var inv = 1.0 - t;
        return 1.0 - inv * inv * inv * inv * inv;
    }

    /**
     * Pure Cubic Hermite spline evaluation for 3D vectors ({x,y,z}).
     * At u=0: pos = p0, vel = v0. At u=1: pos = p1, vel = v1.
     */
    function evalCubicHermite(p0, v0, p1, v1, u, duration, out) {
        var t = clamp(u, 0.0, 1.0);
        var d = (typeof duration === "number" && duration > 0) ? duration : 1.0;
        var t2 = t * t;
        var t3 = t2 * t;
        var h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
        var h10 = t3 - 2.0 * t2 + t;
        var h01 = -2.0 * t3 + 3.0 * t2;
        var h11 = t3 - t2;

        var res = out || {};
        res.x = h00 * p0.x + h10 * (v0.x * d) + h01 * p1.x + h11 * (v1.x * d);
        res.y = h00 * p0.y + h10 * (v0.y * d) + h01 * p1.y + h11 * (v1.y * d);
        res.z = h00 * p0.z + h10 * (v0.z * d) + h01 * p1.z + h11 * (v1.z * d);
        return res;
    }

    function evalCubicHermiteVelocity(p0, v0, p1, v1, u, duration, out) {
        var t = clamp(u, 0.0, 1.0);
        var d = (typeof duration === "number" && duration > 0) ? duration : 1.0;
        var t2 = t * t;
        var dh00 = 6.0 * t2 - 6.0 * t;
        var dh10 = 3.0 * t2 - 4.0 * t + 1.0;
        var dh01 = -6.0 * t2 + 6.0 * t;
        var dh11 = 3.0 * t2 - 2.0 * t;

        var res = out || {};
        res.x = (dh00 * p0.x + dh10 * (v0.x * d) + dh01 * p1.x + dh11 * (v1.x * d)) / d;
        res.y = (dh00 * p0.y + dh10 * (v0.y * d) + dh01 * p1.y + dh11 * (v1.y * d)) / d;
        res.z = (dh00 * p0.z + dh10 * (v0.z * d) + dh01 * p1.z + dh11 * (v1.z * d)) / d;
        return res;
    }

    /**
     * Pure shortest-arc Quaternion Slerp ({x,y,z,w}).
     */
    function slerpQuat(qa, qb, u, out) {
        var t = clamp(u, 0.0, 1.0);
        var ax = qa.x, ay = qa.y, az = qa.z, aw = qa.w;
        var bx = qb.x, by = qb.y, bz = qb.z, bw = qb.w;
        var dot = ax * bx + ay * by + az * bz + aw * bw;
        if (dot < 0.0) {
            dot = -dot;
            bx = -bx; by = -by; bz = -bz; bw = -bw;
        }
        var rx, ry, rz, rw;
        if (dot > 0.9995) {
            rx = lerp(ax, bx, t);
            ry = lerp(ay, by, t);
            rz = lerp(az, bz, t);
            rw = lerp(aw, bw, t);
        } else {
            var theta0 = Math.acos(clamp(dot, -1.0, 1.0));
            var theta = theta0 * t;
            var sinTheta = Math.sin(theta);
            var sinTheta0 = Math.sin(theta0);
            var s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
            var s1 = sinTheta / sinTheta0;
            rx = s0 * ax + s1 * bx;
            ry = s0 * ay + s1 * by;
            rz = s0 * az + s1 * bz;
            rw = s0 * aw + s1 * bw;
        }
        var len = Math.hypot(rx, ry, rz, rw) || 1.0;
        var res = out || {};
        res.x = rx / len;
        res.y = ry / len;
        res.z = rz / len;
        res.w = rw / len;
        return res;
    }

    function computeDepartureBankAngle(lateralVelocity) {
        return clamp(-(Number(lateralVelocity) || 0.0) * 0.15, -0.45, 0.45);
    }

    function normalizeDomainKey(sectionId) {
        var s = String(sectionId || "").toLowerCase();
        if (s === "intro" || s === "hub" || s === "hub:intro") return "intro";
        if (s.indexOf("math") !== -1) return "math";
        if (s.indexOf("physics") !== -1) return "physics";
        if (s.indexOf("datascience") !== -1) return "datascience";
        if (s.indexOf("quant") !== -1) return "quant";
        if (s.indexOf("cs") !== -1) return "cs";
        if (s.indexOf("contact") !== -1) return "contact";
        return "intro";
    }

    /**
     * Pure deterministic evaluation of the 12-second hyperspace timeline
     * including strict t=1.8s spool gate, departing fly-past (0-2.5s),
     * midpoint swap at 5.0s, tunnel dropout (6.5-7.8s), deceleration snap at 8.0s,
     * shockwave (8.0-8.3s), orbital handoff (9.0-12.0s), and UI fade-in (9.5-11.5s).
     */
    function evaluateTimeline(tRaw, opts, out) {
        var t = clamp(Number(tRaw) || 0.0, 0.0, TIMELINE.TOTAL);
        var phase = "departure";
        var fov = 60.0;
        var stretchLength = 0.0;
        var tunnelIntensity = 0.0;
        var shockwaveProgress = 0.0;
        var postSnapThinning = 0.0;
        var starDriftSpeed = 1.0;
        var starOpacity = 1.0;
        var thrusterPower = 0.0;
        var tunnelRimIntensity = 0.0;
        var domainLightIntensity = 0.0;
        var uiOpacity = 0.0;
        var lurchZ = 0.0;
        var rollBuffetRad = 0.0;
        var vibrationAmp = 0.0;
        var shouldSwap = t >= TIMELINE.SWAP_AT;
        var tunnelDropout = smoothstep(TIMELINE.TUNNEL_END, TIMELINE.DROPOUT_END, t);
        var midSwap = smoothstep(TIMELINE.SWAP_AT - 0.15, TIMELINE.SWAP_AT + 0.15, t);

        // Volumetric simulation ingress (Departing Fly-Past -> Midpoint Pre-Position -> Phase 5 Emergence -> Phase 6 Penetration)
        var simZ = 0.0;
        var simScale = 1.0;
        var simOpacity = 0.0;
        if (t < TIMELINE.SPOOL_END) {
            // 0.0s - 2.5s: Departing Fly-Past (+Z rush past camera, dissolving into pitch-black)
            var uFly = clamp(t / TIMELINE.SPOOL_END, 0.0, 1.0);
            simZ = 65.0 * uFly * uFly * uFly;
            simScale = 1.0 + 0.35 * uFly * uFly;
            simOpacity = 1.0 - smoothstep(0.0, 0.92, uFly);
        } else if (t < TIMELINE.SWAP_AT) {
            simZ = 65.0;
            simScale = 1.35;
            simOpacity = 0.0;
        } else if (t < TIMELINE.TUNNEL_END) {
            // 5.0s - 6.5s: Midpoint Pre-Position behind opaque tunnel
            simZ = -180.0;
            simScale = 0.25;
            simOpacity = 0.0;
        } else if (t < TIMELINE.DROPOUT_END) {
            // 6.5s - 7.8s: Phase 5 Tunnel Dropout & Dest Sim Emergence (z=-180->-45, s=0.25->0.85, a=0->0.75)
            var uPupil = clamp((t - TIMELINE.TUNNEL_END) / (TIMELINE.DROPOUT_END - TIMELINE.TUNNEL_END), 0.0, 1.0);
            var sPupil = smoothstep(0.0, 1.0, uPupil);
            simZ = lerp(-180.0, -45.0, sPupil);
            simScale = lerp(0.25, 0.85, sPupil);
            simOpacity = lerp(0.0, 0.75, sPupil);
        } else if (t < TIMELINE.HANDOFF_START) {
            // 7.8s - 9.0s: Phase 6 Physical Penetration (z=-45->0, s=0.85->1, a=0.75->1)
            var uPen = clamp((t - TIMELINE.DROPOUT_END) / (TIMELINE.HANDOFF_START - TIMELINE.DROPOUT_END), 0.0, 1.0);
            var qPen = quinticEaseOut(uPen);
            simZ = lerp(-45.0, 0.0, qPen);
            simScale = lerp(0.85, 1.0, qPen);
            simOpacity = lerp(0.75, 1.0, qPen);
        } else {
            // 9.0s - 12.0s: Phase 7 Docked Destination Simulation
            simZ = 0.0;
            simScale = 1.0;
            simOpacity = 1.0;
        }

        if (t < TIMELINE.DEPARTURE_END) {
            // 0.0s - 1.8s: Phase 1 Dynamic Alignment Arc (FOV=60, thruster=0)
            phase = "departure";
            var u0 = t / TIMELINE.DEPARTURE_END;
            fov = 60.0;
            stretchLength = 0.0;
            tunnelIntensity = 0.0;
            starDriftSpeed = 1.0;
            starOpacity = 1.0;
            thrusterPower = 0.0;
            tunnelRimIntensity = 0.0;
            domainLightIntensity = 1.0 - smoothstep(0.0, 0.85, u0);
            uiOpacity = 1.0 - smoothstep(0.0, 0.80, u0);
        } else if (t < TIMELINE.SPOOL_END) {
            // 1.8s - 2.5s: Phase 2 Engine Spool (FOV 60 -> 52 cubic ease-in-out)
            phase = "spool";
            var u1 = (t - TIMELINE.SPOOL_START) / (TIMELINE.SPOOL_END - TIMELINE.SPOOL_START);
            var s1 = smoothstep(0.0, 1.0, u1);
            fov = lerp(60.0, 52.0, s1);
            thrusterPower = lerp(0.0, 0.75, s1);
            starDriftSpeed = lerp(1.0, 2.0, s1);
            stretchLength = 0.0;
            tunnelIntensity = 0.0;
            starOpacity = 1.0;
            uiOpacity = 0.0;
        } else if (t < TIMELINE.IGNITION_END) {
            // 2.5s - 3.5s: Phase 3 Laser Rod Ignition (FOV 52 -> 78, stretch rods active against #000000)
            phase = "ignition";
            var u2 = (t - TIMELINE.SPOOL_END) / (TIMELINE.IGNITION_END - TIMELINE.SPOOL_END);
            var s2 = smoothstep(0.0, 1.0, u2);
            fov = lerp(52.0, 78.0, s2);
            stretchLength = 0.25 + (38.0 - 0.25) * Math.pow(u2, 1.55);
            thrusterPower = lerp(0.75, 1.0, s2);
            starDriftSpeed = lerp(2.0, 16.0, u2 * u2);
            vibrationAmp = 0.032 * s2;
            tunnelIntensity = 0.0;
            starOpacity = 1.0;
            uiOpacity = 0.0;
        } else if (t < TIMELINE.TUNNEL_END) {
            // 3.5s - 6.5s: Phase 4 Layer B Tunnel (uTunnelIntensity 0->1, FOV->94, swap at 5.0s)
            phase = "tunnel";
            var u3 = (t - TIMELINE.IGNITION_END) / (TIMELINE.TUNNEL_END - TIMELINE.IGNITION_END);
            fov = lerp(78.0, 94.0, smoothstep(0.0, 0.25, u3)) + Math.exp(-Math.pow((t - TIMELINE.SWAP_AT) * 2.2, 2)) * 2.5;
            tunnelIntensity = smoothstep(0.0, 0.18, u3);
            tunnelRimIntensity = smoothstep(0.0, 0.20, u3);
            stretchLength = lerp(38.0, 52.0, smoothstep(0.0, 0.25, u3));
            thrusterPower = 1.0;
            starDriftSpeed = 18.0;
            var maxBuffet = 1.8 * Math.PI / 180.0;
            var n = 0.55 * Math.sin(t * 7.3) + 0.30 * Math.sin(t * 17.9 + 1.2) + 0.15 * Math.sin(t * 31.1 + 2.7);
            rollBuffetRad = maxBuffet * n * smoothstep(0.0, 0.16, u3);
            vibrationAmp = 0.042;
            starOpacity = 1.0;
            uiOpacity = 0.0;
        } else if (t < TIMELINE.DROPOUT_END) {
            // 6.5s - 7.8s: Phase 5 Tunnel Dropout (1->0 over 350ms, dest sim z=-180->-45)
            phase = "dropout";
            var u4 = (t - TIMELINE.TUNNEL_END) / (TIMELINE.DROPOUT_END - TIMELINE.TUNNEL_END);
            fov = 94.0;
            tunnelIntensity = 1.0 - smoothstep(TIMELINE.DROPOUT_END - 0.35, TIMELINE.DROPOUT_END, t);
            tunnelRimIntensity = 1.0;
            thrusterPower = 1.0 - smoothstep(0.0, 0.85, u4);
            stretchLength = lerp(52.0, 40.0, u4);
            starDriftSpeed = lerp(18.0, 12.0, u4);
            var decay = 1.0 - smoothstep(0.0, 0.70, u4);
            rollBuffetRad = (1.8 * Math.PI / 180.0) * decay * Math.sin(t * 7.3);
            vibrationAmp = 0.042 * (1.0 - smoothstep(0.0, 0.80, u4));
            starOpacity = 1.0;
            uiOpacity = 0.0;
        } else if (t < TIMELINE.HANDOFF_START) {
            // 7.8s - 9.0s: Phase 6 Deceleration Snap at t=8.0s (FOV 94->60 quintic over 140ms, 40% star density, lurch to z=-22, shockwave 8.0-8.3s)
            phase = "snap";
            tunnelIntensity = 0.0;
            thrusterPower = 0.0;
            starOpacity = 1.0;
            uiOpacity = 0.0;
            if (t < TIMELINE.SNAP_AT) {
                fov = 94.0;
                stretchLength = 40.0;
                postSnapThinning = 0.0;
                starDriftSpeed = 12.0;
                tunnelRimIntensity = 1.0;
            } else {
                var uFovSnap = clamp((t - TIMELINE.SNAP_AT) / 0.14, 0.0, 1.0);
                var uSnap = clamp((t - TIMELINE.SNAP_AT) / (TIMELINE.HANDOFF_START - TIMELINE.SNAP_AT), 0.0, 1.0);
                var lurchEnv = quinticEaseOut(clamp(uSnap / 0.14, 0.0, 1.0)) * (1.0 - smoothstep(0.14, 1.0, uSnap));
                fov = lerp(94.0, 60.0, quinticEaseOut(uFovSnap));
                stretchLength = 0.0;
                postSnapThinning = 1.0;
                lurchZ = -14.0 * lurchEnv;
                starDriftSpeed = 0.45;
                tunnelRimIntensity = 1.0;
            }
        } else {
            // 9.0s - 12.0s: Phase 7 Osculating Orbital Handoff (rim 1->0, domain light 0->1, UI fade 9.5s-11.5s)
            phase = "handoff";
            var u6 = clamp((t - TIMELINE.HANDOFF_START) / (TIMELINE.TOTAL - TIMELINE.HANDOFF_START), 0.0, 1.0);
            fov = 60.0;
            stretchLength = 0.0;
            tunnelIntensity = 0.0;
            shockwaveProgress = 0.0;
            postSnapThinning = 1.0;
            starDriftSpeed = 0.35;
            starOpacity = 1.0;
            tunnelRimIntensity = 1.0 - smoothstep(0.0, 0.85, u6);
            domainLightIntensity = smoothstep(0.05, 0.92, u6);
            uiOpacity = smoothstep(TIMELINE.UI_FADE_START, TIMELINE.UI_FADE_END, t);
            thrusterPower = 0.08 * smoothstep(0.25, 1.0, u6);
        }

        // Exit shockwave ring (8.0s - 8.3s)
        shockwaveProgress = (t >= TIMELINE.SNAP_AT && t <= TIMELINE.SHOCKWAVE_END)
            ? clamp((t - TIMELINE.SNAP_AT) / (TIMELINE.SHOCKWAVE_END - TIMELINE.SNAP_AT), 0.0, 1.0)
            : 0.0;

        var res = out || {};
        res.t = t;
        res.phase = phase;
        res.fov = fov;
        res.stretchLength = stretchLength;
        res.tunnelIntensity = tunnelIntensity;
        res.tunnelDropout = tunnelDropout;
        res.midSwap = midSwap;
        res.shockwaveProgress = shockwaveProgress;
        res.postSnapThinning = postSnapThinning;
        res.starDriftSpeed = starDriftSpeed;
        res.starOpacity = starOpacity;
        res.thrusterPower = thrusterPower;
        res.tunnelRimIntensity = tunnelRimIntensity;
        res.domainLightIntensity = domainLightIntensity;
        res.uiOpacity = uiOpacity;
        res.stageOpacity = simOpacity;
        res.simZ = simZ;
        res.simScale = simScale;
        res.simOpacity = simOpacity;
        res.lurchZ = lurchZ;
        res.rollBuffetRad = rollBuffetRad;
        res.vibrationAmp = vibrationAmp;
        res.shouldSwap = shouldSwap;
        return res;
    }

    function HyperspaceJourneyController(options) {
        this._opts = options || {};
        this._disposed = false;
        this._rafId = 0;
        this._lastNow = 0;
        this._orbitTime = 0;
        this._reducedTimerA = 0;
        this._reducedTimerB = 0;

        this.isTransitioning = false;
        this.currentIndex = 0;
        this.targetIndex = 0;
        this.fromIndex = 0;
        this.jumpTime = 0.0;
        this._midpointSwapped = false;
        this._fastForwarded = false;
        this._onComplete = null;
        this._customSwapFn = null;

        this._departurePos = { x: 0.0, y: -4.5, z: -14.0 };
        this._departureVel = { x: 0.0, y: 2.2, z: 1.5 };
        this._departureQuat = { x: 0.0, y: 1.0, z: 0.0, w: 0.0 };
        this._launchAnchor = { x: 0.0, y: -0.15, z: -8.0 };
        this._launchTargetVel = { x: 0.0, y: 0.0, z: -12.0 };
        this._launchTargetQuat = { x: 0.0, y: 1.0, z: 0.0, w: 0.0 };

        this._arrivalPos = { x: 0.0, y: -0.15, z: -8.0 };
        this._arrivalVel = { x: 0.0, y: 0.0, z: -5.5 };
        this._lookVanish = { x: 0.0, y: 0.0, z: -500.0 };
        this._rawPtrX = 0.0;
        this._rawPtrY = 0.0;
        this._smoothPtrX = 0.0;
        this._smoothPtrY = 0.0;

        // Reusable scratch structures for zero per-frame allocations in _stepFrame
        this._timelineOpts = { fromPage0: true, toPage0: false };
        this._timelineOut = {};
        this._parallax = { x: 0.0, y: 0.0 };
        this._resolution = { x: 1280, y: 720 };
        this._engineState = {
            time: 0.0,
            stretchLength: 0.0,
            tunnelIntensity: 0.0,
            dropout: 0.0,
            midSwap: 0.0,
            shockwaveProgress: 0.0,
            postSnapThinning: 0.0,
            starDriftSpeed: 1.0,
            starOpacity: 1.0,
            parallax: this._parallax,
            resolution: this._resolution
        };
        this._craftState = {
            time: 0.0,
            tunnelRimIntensity: 0.0,
            domainLightIntensity: 0.0,
            domainAmbientColor: 0x38bdf8,
            thrusterPower: 0.0,
            sonarPulse: 0.0,
            enablePointerBanking: false
        };
        this._tmpPos = { x: 0.0, y: 0.0, z: 0.0 };
        this._tmpVel = { x: 0.0, y: 0.0, z: 0.0 };
        this._tmpQuat = { x: 0.0, y: 0.0, z: 0.0, w: 1.0 };
        this._tmpLook = { x: 0.0, y: 0.0, z: 0.0 };
        this._tmpTangentLook = { x: 0.0, y: 0.0, z: 0.0 };
        this._awayPos = { x: 0.0, y: 2.5, z: -48.0 };
        this._awayVel = { x: 0.0, y: 1.0, z: -18.0 };

        this._listeners = [];
        this.canvas = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.engine = null;
        this.spacecraft = null;
        this.audio = null;

        this._reducedMQ = (typeof window !== "undefined" && window.matchMedia)
            ? window.matchMedia("(prefers-reduced-motion: reduce)")
            : null;

        if (typeof document !== "undefined" && typeof window !== "undefined") {
            this._initThree();
            this._bindEvents();
            this.syncToCurrentPage();
        }
    }

    HyperspaceJourneyController.prototype._isReducedMotion = function () {
        if (this._opts.reducedMotion !== undefined) return Boolean(this._opts.reducedMotion);
        return !!(this._reducedMQ && this._reducedMQ.matches);
    };

    HyperspaceJourneyController.prototype.isHubActive = function () {
        if (this._disposed || typeof document === "undefined") return false;
        var page = document.documentElement && document.documentElement.dataset && document.documentElement.dataset.page;
        return page === "hub";
    };

    HyperspaceJourneyController.prototype._getSections = function () {
        if (typeof document === "undefined") return [];
        return Array.from(document.querySelectorAll(".snap-section"));
    };

    HyperspaceJourneyController.prototype._getSectionId = function (idx) {
        var secs = this._getSections();
        if (secs[idx] && secs[idx].id) return secs[idx].id;
        return HUB_SECTION_IDS[idx] || "intro";
    };

    HyperspaceJourneyController.prototype._computeLookAtQuat = function (fromPos, targetPos) {
        var THREE = root.THREE;
        if (THREE && typeof THREE.Object3D === "function") {
            var tmp = new THREE.Object3D();
            tmp.position.set(fromPos.x, fromPos.y, fromPos.z);
            tmp.lookAt(targetPos.x, targetPos.y, targetPos.z);
            return { x: tmp.quaternion.x, y: tmp.quaternion.y, z: tmp.quaternion.z, w: tmp.quaternion.w };
        }
        return { x: 0.0, y: 1.0, z: 0.0, w: 0.0 };
    };

    HyperspaceJourneyController.prototype._initThree = function () {
        var THREE = root.THREE;
        if (!THREE) return;

        var canvas = document.getElementById("hyperspace-canvas");
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.id = "hyperspace-canvas";
            canvas.className = "hyperspace-canvas";
            canvas.setAttribute("aria-hidden", "true");
            document.body.appendChild(canvas);
        }
        this.canvas = canvas;
        this.canvas.style.display = "none";

        try {
            this.renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                alpha: true,
                antialias: true,
                powerPreference: "high-performance"
            });
        } catch (e) {
            this.renderer = null;
            return;
        }

        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            60,
            Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight),
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 0);
        this.camera.lookAt(0, 0, -100);

        // Precompute exact launch orientation pointing nose toward (0, 0, -infinity)
        this._launchTargetQuat = this._computeLookAtQuat(this._launchAnchor, this._lookVanish);

        // Clean metallic hull lighting
        var amb = new THREE.AmbientLight(0x94a3b8, 0.55);
        var key = new THREE.DirectionalLight(0xe2f1ff, 1.35);
        key.position.set(6, 10, 8);
        var rim = new THREE.DirectionalLight(0x38bdf8, 0.75);
        rim.position.set(-8, -4, -10);
        this.scene.add(amb);
        this.scene.add(key);
        this.scene.add(rim);

        var EngineCtor = root.HyperspaceEngine || (root.KW && root.KW.HyperspaceEngine);
        var CraftCtor = root.SpacecraftController || (root.KW && root.KW.SpacecraftController);
        var AudioCtor = root.HyperspaceAudio || (root.KW && root.KW.HyperspaceAudio);

        if (typeof EngineCtor === "function") {
            this.engine = new EngineCtor(this.scene);
            this.engine.setVisible(false);
        }
        if (typeof CraftCtor === "function") {
            this.spacecraft = new CraftCtor(this.scene);
            this.spacecraft.setVisible(false);
        }
        if (typeof AudioCtor === "function") {
            this.audio = new AudioCtor();
        }
    };

    HyperspaceJourneyController.prototype._listen = function (target, type, fn, opts) {
        if (!target || !target.addEventListener) return;
        target.addEventListener(type, fn, opts);
        this._listeners.push({ target: target, type: type, fn: fn, opts: opts });
    };

    HyperspaceJourneyController.prototype._bindEvents = function () {
        var self = this;

        this._listen(window, "resize", function () {
            if (self._disposed || !self.renderer || !self.camera) return;
            var w = Math.max(1, window.innerWidth);
            var h = Math.max(1, window.innerHeight);
            self.camera.aspect = w / h;
            self.camera.updateProjectionMatrix();
            self.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            self.renderer.setSize(w, h, false);
        }, { passive: true });

        this._listen(window, "pointermove", function (e) {
            var nx = clamp((e.clientX / Math.max(1, window.innerWidth)) * 2.0 - 1.0, -1.0, 1.0);
            var ny = clamp((e.clientY / Math.max(1, window.innerHeight)) * 2.0 - 1.0, -1.0, 1.0);
            self._rawPtrX = nx;
            self._rawPtrY = ny;
            if (self.spacecraft) {
                self.spacecraft.setPointer(nx, ny);
            }
        }, { passive: true });

        // Hard input lock during transition + Space / Escape fast-forward escape hatch
        this._listen(window, "wheel", function (e) {
            if (!self.isTransitioning) return;
            e.preventDefault();
            e.stopImmediatePropagation();
        }, { passive: false, capture: true });

        this._listen(window, "touchmove", function (e) {
            if (!self.isTransitioning) return;
            e.preventDefault();
            e.stopImmediatePropagation();
        }, { passive: false, capture: true });

        this._listen(window, "keydown", function (e) {
            if (!self.isTransitioning) return;
            if (e.key === " " || e.code === "Space" || e.key === "Escape") {
                e.preventDefault();
                e.stopImmediatePropagation();
                self.fastForward();
                return;
            }
            if (
                e.key === "ArrowDown" || e.key === "ArrowUp" ||
                e.key === "PageDown" || e.key === "PageUp" ||
                e.key === "Home" || e.key === "End" ||
                e.key === "j" || e.key === "J" ||
                e.key === "k" || e.key === "K"
            ) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, { capture: true });

        // Clicking a direct navbar link during 0.0s-8.5s triggers fast-forward escape hatch
        this._listen(document, "click", function (e) {
            if (!self.isTransitioning) return;
            var navLink = e.target && e.target.closest && e.target.closest(".nav a[href]");
            if (navLink) {
                self.fastForward();
            }
        }, { capture: true });
    };

    HyperspaceJourneyController.prototype._setOverlayVisibility = function (showCanvas, showEngine, showCraft) {
        if (this.engine) this.engine.setVisible(showEngine);
        if (this.spacecraft) this.spacecraft.setVisible(showCraft);
        if (this.canvas) {
            this.canvas.style.display = showCanvas ? "" : "none";
        }
    };

    HyperspaceJourneyController.prototype._setUiOpacity = function (uiOp) {
        if (typeof document === "undefined") return;
        var mainEl = document.getElementById("main");
        if (mainEl) {
            mainEl.style.opacity = uiOp === null ? "" : String(clamp(uiOp, 0, 1));
        }
    };

    HyperspaceJourneyController.prototype._setSimIngress = function (zOffset, scale, opacity) {
        if (typeof window !== "undefined" && window.THREAD_STAGE && typeof window.THREAD_STAGE.setSimIngress === "function") {
            window.THREAD_STAGE.setSimIngress(zOffset, scale, opacity);
        } else if (typeof document !== "undefined") {
            var stageEl = document.getElementById("stage-canvas");
            if (stageEl) {
                stageEl.style.opacity = (zOffset === 0 && scale === 1 && opacity === 1) ? "" : String(clamp(opacity, 0, 1));
            }
        }
    };

    HyperspaceJourneyController.prototype._stopLoop = function () {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = 0;
        }
    };

    HyperspaceJourneyController.prototype._ensureLoop = function () {
        if (this._disposed || this._rafId || !this.renderer) return;
        var self = this;
        this._lastNow = performance.now();
        var tick = function (now) {
            if (self._disposed) {
                self._rafId = 0;
                return;
            }
            var dt = Math.min(Math.max((now - self._lastNow) / 1000.0, 0.0), 0.05);
            self._lastNow = now;
            self._stepFrame(dt);
            if (self._shouldRender()) {
                self._rafId = requestAnimationFrame(tick);
            } else {
                self._rafId = 0;
            }
        };
        this._rafId = requestAnimationFrame(tick);
    };

    /**
     * Origin Page Lock: On Page 0 (intro) while not transitioning,
     * visible = false and zero renderer.render() calls.
     */
    HyperspaceJourneyController.prototype._shouldRender = function () {
        if (this._disposed || !this.renderer) return false;
        return this.isHubActive();
    };

    HyperspaceJourneyController.prototype.syncToCurrentPage = function () {
        if (this._disposed) return;
        if (!this.isHubActive()) {
            this.isTransitioning = false;
            this._setOverlayVisibility(false, false, false);
            this._setUiOpacity(null);
            this._setSimIngress(0.0, 1.0, 1.0);
            if (typeof document !== "undefined" && document.documentElement) {
                document.documentElement.classList.remove("hyperspace-active");
            }
            this._stopLoop();
            return;
        }

        var secs = this._getSections();
        var idx = 0;
        if (window.THREAD_STAGE && typeof window.THREAD_STAGE.currentIndex === "number") {
            idx = clamp(window.THREAD_STAGE.currentIndex, 0, Math.max(0, secs.length - 1));
        } else if (typeof window.KW === "object" && typeof window.KW._secIdx === "number") {
            idx = clamp(window.KW._secIdx, 0, Math.max(0, secs.length - 1));
        }
        this.currentIndex = idx;
        this.targetIndex = idx;
        this._setSimIngress(0.0, 1.0, 1.0);

        if (idx === 0) {
            // Page 0 (Laniakea): 4,000-star Layer A visible; spacecraft, tunnel & shockwave hidden
            this._setOverlayVisibility(true, true, false);
            this._ensureLoop();
        } else {
            this._setOverlayVisibility(true, true, true);
            this._ensureLoop();
        }
    };

    HyperspaceJourneyController.prototype.step = function (delta) {
        if (!this.isHubActive() || this.isTransitioning) return false;
        var dir = Math.sign(Number(delta) || 0);
        if (dir === 0) return false;
        var secs = this._getSections();
        var maxIdx = Math.max(0, secs.length - 1);
        var nextIdx = clamp(this.currentIndex + dir, 0, maxIdx);
        if (nextIdx === this.currentIndex) return false;
        return this.jumpToSection(nextIdx);
    };

    HyperspaceJourneyController.prototype.jumpToSection = function (targetIdx, opts) {
        if (this._disposed || !this.isHubActive()) return false;
        var secs = this._getSections();
        var maxIdx = Math.max(0, secs.length - 1);
        var clampedTarget = clamp(targetIdx | 0, 0, maxIdx);

        if (this.isTransitioning) {
            if (this.jumpTime < TIMELINE.TUNNEL_END) {
                this.fastForward();
            }
            return false;
        }

        if (clampedTarget === this.currentIndex) return false;

        this.fromIndex = this.currentIndex;
        this.targetIndex = clampedTarget;
        this._midpointSwapped = false;
        this._fastForwarded = false;
        this._customSwapFn = opts && typeof opts.onMidpointSwap === "function" ? opts.onMidpointSwap : null;
        this._onComplete = opts && typeof opts.onComplete === "function" ? opts.onComplete : null;

        // prefers-reduced-motion: 250ms opacity crossfade with immediate docking (or dormant on Page 0)
        if (this._isReducedMotion() || !this.renderer) {
            this._runReducedMotionSwap(clampedTarget);
            return true;
        }

        // Live State-Capture Departure: NEVER hard-reset spacecraft to center!
        if (this.fromIndex === 0) {
            // Departing Page 0 (dormant): enter smoothly from lower frame
            this._departurePos = { x: 0.0, y: -4.5, z: -14.0 };
            this._departureVel = { x: 0.0, y: 2.2, z: 1.5 };
            this._departureQuat = this._computeLookAtQuat(this._departurePos, this._launchAnchor);
            if (this.spacecraft && typeof this.spacecraft.setPoseQuat === "function") {
                this.spacecraft.setPoseQuat(this._departurePos, this._departureQuat, 0.0, 0.0, this._departureVel);
            }
        } else if (this.spacecraft && typeof this.spacecraft.getKinematics === "function") {
            var kin = this.spacecraft.getKinematics();
            this._departurePos = { x: kin.position.x, y: kin.position.y, z: kin.position.z };
            this._departureVel = { x: kin.velocity.x, y: kin.velocity.y, z: kin.velocity.z };
            this._departureQuat = { x: kin.quaternion.x, y: kin.quaternion.y, z: kin.quaternion.z, w: kin.quaternion.w };
        } else if (this.spacecraft) {
            var p = this.spacecraft.group.position;
            var q = this.spacecraft.group.quaternion;
            this._departurePos = { x: p.x, y: p.y, z: p.z };
            this._departureVel = { x: 0.0, y: 0.0, z: 0.0 };
            this._departureQuat = { x: q.x, y: q.y, z: q.z, w: q.w };
        }

        this.isTransitioning = true;
        this.jumpTime = 0.0;

        if (typeof document !== "undefined" && document.documentElement) {
            document.documentElement.classList.add("hyperspace-active");
        }
        this._setOverlayVisibility(true, true, true);

        if (this.audio && typeof this.audio.startJump === "function") {
            this.audio.startJump(0);
        }

        this._ensureLoop();
        return true;
    };

    HyperspaceJourneyController.prototype._runReducedMotionSwap = function (targetIdx) {
        var self = this;
        this.isTransitioning = true;
        if (this._reducedTimerA) clearTimeout(this._reducedTimerA);
        if (this._reducedTimerB) clearTimeout(this._reducedTimerB);

        var rootEl = typeof document !== "undefined" ? document.documentElement : null;
        if (rootEl) rootEl.classList.add("hyperspace-reduced-fade");
        this._setUiOpacity(0.0);
        this._setSimIngress(0.0, 1.0, 0.0);

        this._reducedTimerA = setTimeout(function () {
            self._reducedTimerA = 0;
            self._executeMidpointSwap(true);
            if (self.spacecraft && targetIdx > 0 && typeof self.spacecraft.getEntryDockingPose === "function") {
                var dockPose = self.spacecraft.getEntryDockingPose(self._getSectionId(targetIdx), self._orbitTime);
                self.spacecraft.setPose(dockPose.position, dockPose.lookAt, dockPose.roll || 0.0, 0.0, dockPose.velocity);
            }
            self._setUiOpacity(1.0);
            self._setSimIngress(0.0, 1.0, 1.0);

            self._reducedTimerB = setTimeout(function () {
                self._reducedTimerB = 0;
                if (rootEl) rootEl.classList.remove("hyperspace-reduced-fade");
                self._setUiOpacity(null);
                self._setSimIngress(0.0, 1.0, 1.0);
                self._finishJump();
            }, 125);
        }, 125);
    };

    HyperspaceJourneyController.prototype._executeMidpointSwap = function (isReduced) {
        if (this._midpointSwapped) return;
        this._midpointSwapped = true;

        var idx = this.targetIndex;
        this.currentIndex = idx;

        if (typeof this._customSwapFn === "function") {
            try { this._customSwapFn(idx); } catch (e) {}
        } else if (typeof window !== "undefined" && window.THREAD_STAGE && typeof window.THREAD_STAGE.snapToSection === "function") {
            window.THREAD_STAGE.snapToSection(idx);
        } else {
            var secs = this._getSections();
            if (secs[idx] && typeof secs[idx].scrollIntoView === "function") {
                secs[idx].scrollIntoView({ behavior: "instant" });
            }
        }

        // Pre-position destination simulation behind opaque tunnel at z=-180, scale=0.25, opacity=0
        if (!isReduced) {
            this._setSimIngress(-180.0, 0.25, 0.0);
        }

        if (typeof root.KW === "object") {
            root.KW._secIdx = idx;
        }
    };

    /**
     * Fast-Forward Escape Hatch: during 0.0s - 6.5s, immediately runs midpoint swap
     * (with z=-180, scale=0.25, opacity=0) if t < 5.0s and advances clock cleanly to t = 6.5s.
     */
    HyperspaceJourneyController.prototype.fastForward = function () {
        if (!this.isTransitioning) return false;
        if (this.jumpTime >= TIMELINE.TUNNEL_END) return false;

        if (this.jumpTime < TIMELINE.SWAP_AT && !this._midpointSwapped) {
            this._executeMidpointSwap(false);
        }
        this.jumpTime = TIMELINE.TUNNEL_END;
        this._fastForwarded = true;

        if (this.audio && typeof this.audio.fastForwardTo === "function") {
            this.audio.fastForwardTo(TIMELINE.TUNNEL_END);
        }
        return true;
    };

    HyperspaceJourneyController.prototype._finishJump = function () {
        this.isTransitioning = false;
        this.currentIndex = this.targetIndex;
        this.jumpTime = 0.0;

        if (typeof document !== "undefined" && document.documentElement) {
            document.documentElement.classList.remove("hyperspace-active");
        }
        this._setUiOpacity(null);
        this._setSimIngress(0.0, 1.0, 1.0);

        if (this.camera) {
            this.camera.fov = 60.0;
            this.camera.updateProjectionMatrix();
        }

        if (this.audio && typeof this.audio.stop === "function") {
            this.audio.stop();
        }

        if (this.currentIndex === 0) {
            // Returned to Page 0 (Laniakea): keep 4,000-star Layer A visible; spacecraft/tunnel/shockwave hidden
            this._setOverlayVisibility(true, true, false);
            this._ensureLoop();
        } else {
            // Docked in destination sector: persist exact 4,000-star annular field + orbiting spacecraft
            this._setOverlayVisibility(true, true, true);
            this._ensureLoop();
        }

        var cb = this._onComplete;
        this._onComplete = null;
        this._customSwapFn = null;
        if (typeof cb === "function") {
            try { cb(this.currentIndex); } catch (e) {}
        }
    };

    HyperspaceJourneyController.prototype._stepFrame = function (dt) {
        this._orbitTime += dt;

        var w = typeof window !== "undefined" ? Math.max(1, window.innerWidth) : 1280;
        var h = typeof window !== "undefined" ? Math.max(1, window.innerHeight) : 720;

        if (this._isReducedMotion()) {
            this._smoothPtrX = 0.0;
            this._smoothPtrY = 0.0;
        } else {
            var pLerp = clamp(dt * 6.5, 0.0, 1.0);
            this._smoothPtrX += (this._rawPtrX - this._smoothPtrX) * pLerp;
            this._smoothPtrY += (this._rawPtrY - this._smoothPtrY) * pLerp;
        }
        this._parallax.x = -this._smoothPtrX * 2.4;
        this._parallax.y = -this._smoothPtrY * 1.5;
        this._resolution.x = w;
        this._resolution.y = h;

        if (this.isTransitioning) {
            this.jumpTime += dt;
            this._timelineOpts.fromPage0 = this.fromIndex === 0;
            this._timelineOpts.toPage0 = this.targetIndex === 0;
            var st = evaluateTimeline(this.jumpTime, this._timelineOpts, this._timelineOut);

            // Exact midpoint DOM & simulation hot-swap at t = 5.0s
            if (st.shouldSwap && !this._midpointSwapped) {
                this._executeMidpointSwap(false);
            }

            if (this.audio && typeof this.audio.update === "function") {
                this.audio.update(st.t);
            }

            // Camera FOV
            if (this.camera && Math.abs(this.camera.fov - st.fov) > 1e-4) {
                this.camera.fov = st.fov;
                this.camera.updateProjectionMatrix();
            }

            // Drive departing fly-past / volumetric ingress on #stage-canvas and UI typography opacity
            this._setSimIngress(st.simZ, st.simScale, st.simOpacity);
            this._setUiOpacity(st.uiOpacity);

            // Update Layer A / B / C hyperspace shader engine
            if (this.engine) {
                var eng = this._engineState;
                eng.time = st.t;
                eng.stretchLength = st.stretchLength;
                eng.tunnelIntensity = st.tunnelIntensity;
                eng.dropout = st.tunnelDropout;
                eng.midSwap = st.midSwap;
                eng.shockwaveProgress = st.shockwaveProgress;
                eng.postSnapThinning = st.postSnapThinning;
                eng.starDriftSpeed = st.starDriftSpeed;
                eng.starOpacity = st.starOpacity;
                this.engine.update(dt, eng);
            }

            // Update Spacecraft pose & shaders
            var destId = this._getSectionId(this.targetIndex);
            var destKey = normalizeDomainKey(destId);
            var destColor = DOMAIN_COLORS[destKey] || DOMAIN_COLORS.cs;

            if (this.spacecraft) {
                if (st.t < TIMELINE.DEPARTURE_END) {
                    // 0.0s - 1.8s: Dynamic Alignment Arc (Cubic Hermite pos + Quaternion Slerp + lateral-velocity bank)
                    var uDep = clamp(st.t / TIMELINE.DEPARTURE_END, 0.0, 1.0);
                    var posDep = evalCubicHermite(
                        this._departurePos,
                        this._departureVel,
                        this._launchAnchor,
                        this._launchTargetVel,
                        uDep,
                        TIMELINE.DEPARTURE_END,
                        this._tmpPos
                    );
                    var velDep = evalCubicHermiteVelocity(
                        this._departurePos,
                        this._departureVel,
                        this._launchAnchor,
                        this._launchTargetVel,
                        uDep,
                        TIMELINE.DEPARTURE_END,
                        this._tmpVel
                    );
                    var bankRoll = computeDepartureBankAngle(velDep.x);
                    var quatDep = slerpQuat(this._departureQuat, this._launchTargetQuat, smoothstep(0.0, 1.0, uDep), this._tmpQuat);

                    if (typeof this.spacecraft.setPoseQuat === "function") {
                        this.spacecraft.setPoseQuat(posDep, quatDep, bankRoll, 0.0, velDep);
                    } else {
                        this.spacecraft.setPose(posDep, this._lookVanish, bankRoll, 0.0, velDep);
                    }
                } else if (st.t < TIMELINE.HANDOFF_START) {
                    var vibX = st.vibrationAmp * Math.sin(st.t * 47.0);
                    var vibY = st.vibrationAmp * Math.cos(st.t * 53.0);
                    this._tmpPos.x = this._launchAnchor.x + vibX;
                    this._tmpPos.y = this._launchAnchor.y + vibY;
                    this._tmpPos.z = this._launchAnchor.z + st.lurchZ;
                    this.spacecraft.setPose(this._tmpPos, this._lookVanish, st.rollBuffetRad, 0.0, this._arrivalVel);
                } else {
                    // 9.0s - 12.0s: Osculating Cubic Hermite Spline Handoff
                    var handoffDur = TIMELINE.TOTAL - TIMELINE.HANDOFF_START;
                    var uHand = clamp((st.t - TIMELINE.HANDOFF_START) / handoffDur, 0.0, 1.0);
                    var posHand, velHand, lookAtHand, rollHand = 0.0;
                    if (destKey === "intro") {
                        posHand = evalCubicHermite(this._arrivalPos, this._arrivalVel, this._awayPos, this._awayVel, uHand, handoffDur, this._tmpPos);
                        velHand = evalCubicHermiteVelocity(this._arrivalPos, this._arrivalVel, this._awayPos, this._awayVel, uHand, handoffDur, this._tmpVel);
                        lookAtHand = this._lookVanish;
                    } else {
                        var dock = this.spacecraft.getEntryDockingPose(destId, this._orbitTime);
                        posHand = evalCubicHermite(
                            this._arrivalPos,
                            this._arrivalVel,
                            dock.position,
                            dock.velocity,
                            uHand,
                            handoffDur,
                            this._tmpPos
                        );
                        velHand = evalCubicHermiteVelocity(
                            this._arrivalPos,
                            this._arrivalVel,
                            dock.position,
                            dock.velocity,
                            uHand,
                            handoffDur,
                            this._tmpVel
                        );
                        var spd = Math.hypot(velHand.x, velHand.y, velHand.z) || 1.0;
                        this._tmpTangentLook.x = posHand.x + (velHand.x / spd) * 8.0;
                        this._tmpTangentLook.y = posHand.y + (velHand.y / spd) * 8.0;
                        this._tmpTangentLook.z = posHand.z + (velHand.z / spd) * 8.0;
                        var blendLook = smoothstep(0.55, 1.0, uHand);
                        this._tmpLook.x = lerp(this._tmpTangentLook.x, dock.lookAt.x, blendLook);
                        this._tmpLook.y = lerp(this._tmpTangentLook.y, dock.lookAt.y, blendLook);
                        this._tmpLook.z = lerp(this._tmpTangentLook.z, dock.lookAt.z, blendLook);
                        lookAtHand = this._tmpLook;
                        rollHand = lerp(0.0, dock.roll || 0.0, smoothstep(0.0, 1.0, uHand));
                    }
                    this.spacecraft.setPose(posHand, lookAtHand, rollHand, 0.0, velHand);
                }

                var cs = this._craftState;
                cs.time = st.t;
                cs.tunnelRimIntensity = st.tunnelRimIntensity;
                cs.domainLightIntensity = st.domainLightIntensity;
                cs.domainAmbientColor = destColor;
                cs.thrusterPower = st.thrusterPower;
                cs.sonarPulse = 0.0;
                cs.enablePointerBanking = st.t >= TIMELINE.HANDOFF_START && destKey !== "intro";
                this.spacecraft.update(dt, cs);
            }

            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }

            if (this.jumpTime >= TIMELINE.TOTAL) {
                this._finishJump();
            }
            return;
        }

        // Idle / Orbital Docking Loop (Layer A 4,000-star field active on all hub pages; spacecraft orbits on sections 1..6)
        if (this.engine) {
            var idleEng = this._engineState;
            idleEng.time = this._orbitTime;
            idleEng.stretchLength = 0.0;
            idleEng.tunnelIntensity = 0.0;
            idleEng.dropout = 0.0;
            idleEng.midSwap = 0.0;
            idleEng.shockwaveProgress = 0.0;
            idleEng.postSnapThinning = 0.0;
            idleEng.starDriftSpeed = this._isReducedMotion() ? 0.0 : 8.0;
            idleEng.starOpacity = 1.0;
            this.engine.update(dt, idleEng);
        }

        if (this.currentIndex > 0 && this.spacecraft) {
            var curId = this._getSectionId(this.currentIndex);
            var curKey = normalizeDomainKey(curId);
            var curColor = DOMAIN_COLORS[curKey] || DOMAIN_COLORS.cs;
            var dockPose = this.spacecraft.getEntryDockingPose(curId, this._orbitTime);
            var sonar = curKey === "contact"
                ? Math.pow(Math.max(0.0, Math.sin(this._orbitTime * 1.45)), 8.0)
                : 0.0;

            this.spacecraft.setPose(dockPose.position, dockPose.lookAt, dockPose.roll || 0.0, 0.0, dockPose.velocity);
            var idleCraft = this._craftState;
            idleCraft.time = this._orbitTime;
            idleCraft.tunnelRimIntensity = 0.0;
            idleCraft.domainLightIntensity = 1.0;
            idleCraft.domainAmbientColor = curColor;
            idleCraft.thrusterPower = 0.08;
            idleCraft.sonarPulse = sonar;
            idleCraft.enablePointerBanking = true;
            this.spacecraft.update(dt, idleCraft);
        }

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    };

    HyperspaceJourneyController.prototype.dispose = function () {
        if (this._disposed) return;
        this._disposed = true;
        this.isTransitioning = false;
        this._stopLoop();

        if (this._reducedTimerA) { clearTimeout(this._reducedTimerA); this._reducedTimerA = 0; }
        if (this._reducedTimerB) { clearTimeout(this._reducedTimerB); this._reducedTimerB = 0; }

        for (var i = 0; i < this._listeners.length; i++) {
            var l = this._listeners[i];
            try { l.target.removeEventListener(l.type, l.fn, l.opts); } catch (e) {}
        }
        this._listeners.length = 0;

        this._setUiOpacity(null);
        this._setSimIngress(0.0, 1.0, 1.0);
        if (typeof document !== "undefined" && document.documentElement) {
            document.documentElement.classList.remove("hyperspace-active");
            document.documentElement.classList.remove("hyperspace-reduced-fade");
        }

        if (this.engine && typeof this.engine.dispose === "function") this.engine.dispose();
        if (this.spacecraft && typeof this.spacecraft.dispose === "function") this.spacecraft.dispose();
        if (this.audio && typeof this.audio.dispose === "function") this.audio.dispose();
        if (this.scene && typeof this.scene.clear === "function") this.scene.clear();
        if (this.renderer && typeof this.renderer.dispose === "function") this.renderer.dispose();

        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }

        this._onComplete = null;
        this._customSwapFn = null;
        this._reducedMQ = null;
        this.engine = null;
        this.spacecraft = null;
        this.audio = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.canvas = null;
    };

    HyperspaceJourneyController.TIMELINE = TIMELINE;
    HyperspaceJourneyController.HUB_SECTION_IDS = HUB_SECTION_IDS;
    HyperspaceJourneyController.quinticEaseOut = quinticEaseOut;
    HyperspaceJourneyController.evalCubicHermite = evalCubicHermite;
    HyperspaceJourneyController.evalCubicHermiteVelocity = evalCubicHermiteVelocity;
    HyperspaceJourneyController.slerpQuat = slerpQuat;
    HyperspaceJourneyController.computeDepartureBankAngle = computeDepartureBankAngle;
    HyperspaceJourneyController.evaluateTimeline = evaluateTimeline;

    return HyperspaceJourneyController;
}));
