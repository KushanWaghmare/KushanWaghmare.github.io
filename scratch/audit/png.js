"use strict";
// Tiny PNG decoder for 8-bit RGB/RGBA non-interlaced images (Chrome screenshots). Dev tooling only.
const zlib = require("zlib");

const decode = (buf) => {
    let pos = 8, width = 0, height = 0, colorType = 0, bitDepth = 0;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
        else if (type === "IDAT") idat.push(data);
        else if (type === "IEND") break;
        pos += 12 + len;
    }
    if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) throw new Error(`Unsupported PNG: depth ${bitDepth} type ${colorType}`);
    const bpp = colorType === 6 ? 4 : 3, stride = width * bpp;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const out = new Uint8Array(width * height * 4);
    let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
    for (let y = 0; y < height; y++) {
        const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
            const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
            let v = row[i];
            if (f === 1) v += a;
            else if (f === 2) v += b;
            else if (f === 3) v += (a + b) >> 1;
            else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
            cur[i] = v & 255;
        }
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            out[o] = cur[x * bpp]; out[o + 1] = cur[x * bpp + 1]; out[o + 2] = cur[x * bpp + 2]; out[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
        }
        const t = prev; prev = cur; cur = t;
    }
    return { width, height, data: out };
};

// WCAG 2.x relative luminance and contrast.
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const luminance = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

module.exports = { decode, luminance, contrast };
