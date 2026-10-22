/**
 * gpu-cy-oit.js
 *
 * Render pipeline for the Calabi–Yau shell on the shared GFX WebGL2 context:
 *   begin()  -> bind the two-attachment OIT framebuffer (accumulation, revealage) and clear it
 *   finish() -> resolve OIT into an HDR scene target (circle of confusion in alpha), add dust, run depth of field
 * The caller draws the shell between begin() and finish() and then hands the returned target to GFX.compose
 * (bloom, ACES filmic tonemap, vignette, grain).
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CYOit = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const ZERO4 = new Float32Array(4);

    const create = (gfx, S, dustCount) => {
        const gl = gfx.gl;
        const progRes = gfx.program(gfx.VS_QUAD, S.FS_RESOLVE), progDof = gfx.program(gfx.VS_QUAD, S.FS_DOF);
        const progDust = gfx.program(S.VS_DUST, S.FS_DUST);
        if (!progRes || !progDof || !progDust) return null;

        // Half-float targets; the two OIT textures are attached to one framebuffer of our own.
        const acc = gfx.target(2, 2, { nearest: true }), rev = gfx.target(2, 2, { nearest: true });
        const scene = gfx.target(2, 2), dof = gfx.target(2, 2);
        const fbo = gl.createFramebuffer(), dustVao = gl.createVertexArray();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, acc.tex, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, rev.tex, 0);
        const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        const dispose = () => {
            gl.deleteFramebuffer(fbo); gl.deleteVertexArray(dustVao);
            acc.dispose(); rev.dispose(); scene.dispose(); dof.dispose();
        };
        if (!complete) { dispose(); return null; }

        let w = 2, h = 2;
        return {
            resize: (nw, nh) => {
                w = Math.max(2, nw | 0); h = Math.max(2, nh | 0);
                acc.resize(w, h); rev.resize(w, h); scene.resize(w, h); dof.resize(w, h);
            },
            begin: () => {
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
                gl.viewport(0, 0, w, h);
                gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
                gl.clearBufferfv(gl.COLOR, 0, ZERO4); gl.clearBufferfv(gl.COLOR, 1, ZERO4);
                gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
                gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
            },
            /** o = { vp, time, accent, px, focus, cocScale, maxR, dof } -> target to hand to GFX.compose */
            finish: (o) => {
                gl.disable(gl.BLEND);
                progRes.use().tex("uAccum", acc, 0).tex("uReveal", rev, 1).f1("uFocus", o.focus).f1("uCocScale", o.cocScale);
                gfx.quad(progRes, scene);
                gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);   // additive, alpha (CoC) untouched
                progDust.use().mat4("uVP", o.vp).f1("uTime", o.time).f1("uPx", o.px).f3("uAccent", o.accent[0], o.accent[1], o.accent[2]);
                gl.bindVertexArray(dustVao); gl.drawArrays(gl.POINTS, 0, dustCount); gl.bindVertexArray(null);
                gl.disable(gl.BLEND);
                if (!o.dof) return scene;
                progDof.use().tex("uScene", scene, 0).f2("uTexel", 1 / w, 1 / h).f1("uMaxR", o.maxR);
                gfx.quad(progDof, dof);
                return dof;
            },
            dispose
        };
    };

    return { create };
}));
