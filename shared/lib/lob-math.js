/* Exact Limit Order Book & Hawkes Microstructure Mathematics (shared/lib/lob-math.js).
   Cont–Stoikov–Talreja LOB with unit lots, absolute ticks, and L=48 tick band.
   Order flow driven by a bivariate Hawkes process with exponential kernels (Ogata thinning).
   Pure UMD module (Node.js & browser), zero dependencies, seeded PRNG (mulberry32). */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LOB_MATH = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const mulberry32 = (seed) => {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    class BivariateHawkes {
        constructor(opts = {}) {
            this.mu = opts.mu ?? 0.3;
            this.alphaS = opts.alphaS ?? 1.2;
            this.alphaC = opts.alphaC ?? 0.4;
            this.beta = opts.beta ?? 2.0;

            const spectralRadius = (this.alphaS + this.alphaC) / this.beta;
            if (spectralRadius >= 1.0) {
                throw new Error(`Spectral radius ${spectralRadius.toFixed(4)} >= 1.0; Hawkes process is non-stationary`);
            }
            this.spectralRadius = spectralRadius;
            this.stationaryRatePerType = this.mu / (1.0 - spectralRadius);
            this.stationaryTotalRate = 2.0 * this.stationaryRatePerType;

            this.rng = opts.rng || mulberry32(opts.seed ?? 42);
            this.t = 0.0;
            this.s0 = 0.0;
            this.s1 = 0.0;
        }

        reset(seed = 42) {
            this.rng = mulberry32(seed);
            this.t = 0.0;
            this.s0 = 0.0;
            this.s1 = 0.0;
        }

        getIntensities(t = this.t) {
            const dt = Math.max(0, t - this.t);
            const decay = Math.exp(-this.beta * dt);
            const s0 = this.s0 * decay;
            const s1 = this.s1 * decay;
            return {
                lambda0: this.mu + s0,
                lambda1: this.mu + s1,
                lambdaTot: 2.0 * this.mu + s0 + s1,
                s0, s1
            };
        }

        advanceTo(targetT) {
            if (targetT <= this.t) return;
            const dt = targetT - this.t;
            const decay = Math.exp(-this.beta * dt);
            this.s0 *= decay;
            this.s1 *= decay;
            this.t = targetT;
        }

        injectExogenous(type) {
            if (type === 0) {
                this.s0 += this.alphaS;
                this.s1 += this.alphaC;
            } else {
                this.s0 += this.alphaC;
                this.s1 += this.alphaS;
            }
            return {
                t: this.t,
                type,
                postSTot: this.s0 + this.s1,
                isExogenous: true
            };
        }

        nextEvent() {
            const mu = this.mu, beta = this.beta, alphaS = this.alphaS, alphaC = this.alphaC;
            const rng = this.rng;
            let sTot = this.s0 + this.s1;

            while (true) {
                const lambdaBound = 2.0 * mu + sTot;
                const u1 = Math.max(rng(), 1e-15);
                const delta = -Math.log(u1) / lambdaBound;
                const candT = this.t + delta;

                const decay = Math.exp(-beta * delta);
                const candS0 = this.s0 * decay;
                const candS1 = this.s1 * decay;
                const candSTot = candS0 + candS1;
                const candLambda = 2.0 * mu + candSTot;

                if (rng() * lambdaBound <= candLambda) {
                    const prevT = this.t;
                    const prevSTot = sTot;
                    this.t = candT;
                    this.s0 = candS0;
                    this.s1 = candS1;

                    const l0 = mu + candS0, l1 = mu + candS1;
                    const type = (rng() * (l0 + l1) < l0) ? 0 : 1;

                    if (type === 0) {
                        this.s0 += alphaS;
                        this.s1 += alphaC;
                    } else {
                        this.s0 += alphaC;
                        this.s1 += alphaS;
                    }

                    return {
                        t: candT,
                        delta: candT - prevT,
                        type,
                        prevSTot,
                        postSTot: this.s0 + this.s1,
                        isExogenous: false
                    };
                }

                this.t = candT;
                this.s0 = candS0;
                this.s1 = candS1;
                sTot = candSTot;
            }
        }
    }

    class LimitOrderBook {
        constructor(opts = {}) {
            this.L = opts.L ?? 48;
            this.kappa = opts.kappa ?? 8.0;
            this.A = opts.A ?? 1.36;
            this.theta = opts.theta ?? 0.1;
            this.meanMktSize = opts.meanMktSize ?? 3.0;

            this.gridSize = opts.gridSize ?? 1024;
            this.pMin = (opts.centerPrice ?? 5000) - (this.gridSize >> 1);
            this.vol = new Int32Array(this.gridSize);

            this.bestBid = (opts.centerPrice ?? 5000);
            this.bestAsk = this.bestBid + (opts.initialSpread ?? 2);

            this.rng = opts.rng || mulberry32(opts.seed ?? 42);
            this.hawkes = opts.hawkes || new BivariateHawkes({ rng: this.rng, ...opts.hawkesOpts });

            this.lambdaL = new Float64Array(this.L + 1);
            this.sumLambdaL = 0.0;
            for (let d = 1; d <= this.L; d++) {
                this.lambdaL[d] = this.A * d * Math.exp(-d / this.kappa);
                this.sumLambdaL += this.lambdaL[d];
            }

            this.totalVol = 0;
            this.added = 0;
            this.cancelled = 0;
            this.executed = 0;
            this.evicted = 0;

            if (opts.seedInitialBook !== false) {
                for (let d = 1; d <= this.L; d++) {
                    const initV = Math.round(this.lambdaL[d] / this.theta);
                    const pb = this.bestAsk - d;
                    const pa = this.bestBid + d;
                    if (pb >= this.pMin && pb < this.pMin + this.gridSize) {
                        this.vol[pb - this.pMin] += initV;
                        this.totalVol += initV;
                    }
                    if (pa >= this.pMin && pa < this.pMin + this.gridSize) {
                        this.vol[pa - this.pMin] += initV;
                        this.totalVol += initV;
                    }
                }
            }
            this.initialVol = this.totalVol;

            this.recentMax = opts.recentMax ?? 64;
            this.recentEvents = [];
            this.t = 0.0;
            this.depletionCount = 0;
        }

        get spread() {
            return this.bestAsk - this.bestBid;
        }

        get midPrice() {
            return (this.bestBid + this.bestAsk) * 0.5;
        }

        getVolume(price) {
            const idx = price - this.pMin;
            return (idx >= 0 && idx < this.gridSize) ? this.vol[idx] : 0;
        }

        getTopLevels(side, k = 5) {
            const out = [];
            if (side === "bid") {
                let p = this.bestBid;
                while (p >= this.pMin && out.length < k) {
                    const v = this.vol[p - this.pMin];
                    if (v > 0) out.push([p, v]);
                    p--;
                }
            } else {
                let p = this.bestAsk;
                while (p < this.pMin + this.gridSize && out.length < k) {
                    const v = this.vol[p - this.pMin];
                    if (v > 0) out.push([p, v]);
                    p++;
                }
            }
            return out;
        }

        getImbalance(k = 5) {
            const bids = this.getTopLevels("bid", k);
            const asks = this.getTopLevels("ask", k);
            let vBid = 0, vAsk = 0;
            for (let i = 0; i < bids.length; i++) vBid += bids[i][1];
            for (let i = 0; i < asks.length; i++) vAsk += asks[i][1];
            const sum = vBid + vAsk;
            return sum > 0 ? (vBid - vAsk) / sum : 0.0;
        }

        getAccounting() {
            const changeInVol = this.totalVol - this.initialVol;
            const diff = (this.added - this.cancelled - this.executed - this.evicted) - changeInVol;
            return {
                added: this.added,
                cancelled: this.cancelled,
                executed: this.executed,
                evicted: this.evicted,
                initialVol: this.initialVol,
                totalVol: this.totalVol,
                changeInVol,
                diff
            };
        }

        walkBook(side, size) {
            let rem = size;
            let filled = 0;
            const fills = [];
            const oldBest = (side === "bid" || side === 1) ? this.bestBid : this.bestAsk;

            if (side === "ask" || side === 0) {
                while (rem > 0 && this.bestAsk < this.pMin + this.gridSize) {
                    const idx = this.bestAsk - this.pMin;
                    const v = this.vol[idx];
                    if (v <= 0) {
                        this.bestAsk++;
                        continue;
                    }
                    const take = Math.min(v, rem);
                    this.vol[idx] -= take;
                    this.totalVol -= take;
                    this.executed += take;
                    filled += take;
                    rem -= take;
                    fills.push({ price: this.bestAsk, filled: take });

                    if (this.vol[idx] === 0) {
                        let nxt = this.bestAsk + 1;
                        while (nxt < this.pMin + this.gridSize && this.vol[nxt - this.pMin] === 0) nxt++;
                        this.bestAsk = nxt;
                    }
                }
            } else {
                while (rem > 0 && this.bestBid >= this.pMin) {
                    const idx = this.bestBid - this.pMin;
                    const v = this.vol[idx];
                    if (v <= 0) {
                        this.bestBid--;
                        continue;
                    }
                    const take = Math.min(v, rem);
                    this.vol[idx] -= take;
                    this.totalVol -= take;
                    this.executed += take;
                    filled += take;
                    rem -= take;
                    fills.push({ price: this.bestBid, filled: take });

                    if (this.vol[idx] === 0) {
                        let nxt = this.bestBid - 1;
                        while (nxt >= this.pMin && this.vol[nxt - this.pMin] === 0) nxt--;
                        this.bestBid = nxt;
                    }
                }
            }

            const newBest = (side === "bid" || side === 1) ? this.bestBid : this.bestAsk;
            if (newBest !== oldBest) this.depletionCount++;

            return {
                filled,
                remaining: rem,
                fills,
                oldBest,
                newBest
            };
        }

        injectMarketOrder(type, customSize = null) {
            const hEv = this.hawkes.injectExogenous(type);
            const pGeom = 1.0 / this.meanMktSize;
            const size = customSize ?? (1 + Math.floor(Math.log(Math.max(this.rng(), 1e-15)) / Math.log(1.0 - pGeom)));
            const strike = (type === 0) ? this.bestAsk : this.bestBid;
            const res = this.walkBook(type, size);

            const mktEvent = {
                t: this.t,
                type,
                size,
                strike,
                filled: res.filled,
                remaining: res.remaining,
                isExogenous: true
            };

            this.recentEvents.push(mktEvent);
            if (this.recentEvents.length > this.recentMax) this.recentEvents.shift();
            return mktEvent;
        }

        step() {
            const sTot = this.hawkes.s0 + this.hawkes.s1;
            const lambdaH = 2.0 * this.hawkes.mu + sTot;
            const rateArrivals = 2.0 * this.sumLambdaL;
            const rateCancels = this.totalVol * this.theta;
            const totalRateBound = lambdaH + rateArrivals + rateCancels;

            const u = Math.max(this.rng(), 1e-15);
            const dt = -Math.log(u) / totalRateBound;
            this.t += dt;
            this.hawkes.advanceTo(this.t);

            const choice = this.rng() * totalRateBound;

            if (choice < lambdaH) {
                const exactLambdaH = 2.0 * this.hawkes.mu + this.hawkes.s0 + this.hawkes.s1;
                if (choice < exactLambdaH) {
                    const l0 = this.hawkes.mu + this.hawkes.s0;
                    const l1 = this.hawkes.mu + this.hawkes.s1;
                    const type = (this.rng() * (l0 + l1) < l0) ? 0 : 1;

                    if (type === 0) {
                        this.hawkes.s0 += this.hawkes.alphaS;
                        this.hawkes.s1 += this.hawkes.alphaC;
                    } else {
                        this.hawkes.s0 += this.hawkes.alphaC;
                        this.hawkes.s1 += this.hawkes.alphaS;
                    }

                    const pGeom = 1.0 / this.meanMktSize;
                    const size = 1 + Math.floor(Math.log(Math.max(this.rng(), 1e-15)) / Math.log(1.0 - pGeom));
                    const strike = (type === 0) ? this.bestAsk : this.bestBid;
                    const res = this.walkBook(type, size);

                    const mktEvent = {
                        t: this.t,
                        type,
                        size,
                        strike,
                        filled: res.filled,
                        remaining: res.remaining,
                        isExogenous: false
                    };

                    this.recentEvents.push(mktEvent);
                    if (this.recentEvents.length > this.recentMax) this.recentEvents.shift();
                    return { eventType: "market", ...mktEvent };
                }
                return { eventType: "thinning_reject", t: this.t };
            }

            if (choice < lambdaH + rateArrivals) {
                this.added++;
                this.totalVol++;
                const isBid = this.rng() < 0.5;

                const rD = this.rng() * this.sumLambdaL;
                let accD = 0, dChosen = 1;
                for (let d = 1; d <= this.L; d++) {
                    accD += this.lambdaL[d];
                    if (accD >= rD) { dChosen = d; break; }
                }

                if (isBid) {
                    const price = this.bestAsk - dChosen;
                    if (price >= this.pMin && price < this.pMin + this.gridSize) {
                        this.vol[price - this.pMin]++;
                        if (price > this.bestBid) this.bestBid = price;
                    }
                    return { eventType: "limit_bid", price, d: dChosen, t: this.t };
                } else {
                    const price = this.bestBid + dChosen;
                    if (price >= this.pMin && price < this.pMin + this.gridSize) {
                        this.vol[price - this.pMin]++;
                        if (price < this.bestAsk) this.bestAsk = price;
                    }
                    return { eventType: "limit_ask", price, d: dChosen, t: this.t };
                }
            }

            this.cancelled++;
            this.totalVol--;

            const iMin = Math.max(0, this.bestBid - this.L - this.pMin);
            const iMax = Math.min(this.gridSize - 1, this.bestAsk + this.L - this.pMin);
            const rUnit = Math.floor(this.rng() * (this.totalVol + 1));
            let acc = 0, pCancel = -1;

            for (let i = iMin; i <= iMax; i++) {
                acc += this.vol[i];
                if (acc > rUnit) { pCancel = i; break; }
            }

            if (pCancel >= 0) {
                this.vol[pCancel]--;
                const price = this.pMin + pCancel;
                if (price === this.bestBid && this.vol[pCancel] === 0) {
                    let nxt = this.bestBid - 1;
                    while (nxt >= this.pMin && this.vol[nxt - this.pMin] === 0) nxt--;
                    this.bestBid = nxt;
                } else if (price === this.bestAsk && this.vol[pCancel] === 0) {
                    let nxt = this.bestAsk + 1;
                    while (nxt < this.pMin + this.gridSize && this.vol[nxt - this.pMin] === 0) nxt++;
                    this.bestAsk = nxt;
                }
                return { eventType: "cancel", price, t: this.t };
            }

            return { eventType: "cancel_idle", t: this.t };
        }

        stepUntil(targetT, maxEvents = 2000000) {
            let evCount = 0;
            while (this.t < targetT && evCount < maxEvents) {
                this.step();
                evCount++;
            }
            return evCount;
        }
    }

    const packRow = (book, outRow, width = 256) => {
        const out = outRow || new Float32Array(width);
        out.fill(0);
        const bestBid = book.bestBid;
        const bestAsk = book.bestAsk;
        const L = book.L;
        const pMin = book.pMin;
        const vol = book.vol;
        const gridW = book.gridSize;

        const iMin = Math.max(0, bestBid - L - pMin);
        const iMax = Math.min(gridW - 1, bestAsk + L - pMin);

        for (let i = iMin; i <= iMax; i++) {
            const v = vol[i];
            if (v <= 0) continue;
            const price = pMin + i;
            const col = ((price % width) + width) % width;
            const h = Math.sqrt(v);
            if (price <= bestBid) {
                out[col] = -h;
            } else if (price >= bestAsk) {
                out[col] = h;
            }
        }
        return out;
    };

    const avellanedaStoikov = (mid, q, gamma, sigma, tau, k = 1.5, A = 140.0) => {
        const varTerm = gamma * sigma * sigma * tau;
        const r = mid - q * varTerm;
        const delta = varTerm + (2.0 / gamma) * Math.log(1.0 + gamma / k);
        const rA = r + 0.5 * delta;
        const rB = r - 0.5 * delta;
        const fillIntensity = A * Math.exp(-k * delta);
        return {
            reservationPrice: r,
            optimalSpread: delta,
            askQuote: rA,
            bidQuote: rB,
            fillIntensity
        };
    };

    const hashEvents = (events) => {
        let hash = 0x811C9DC5;
        for (let i = 0; i < events.length; i++) {
            const e = events[i];
            const tMs = Math.round((e.t || 0) * 1000);
            const tp = (e.type || 0) + 1;
            const st = (e.strike || 0);
            const sz = (e.size || 0);
            const val = (tMs ^ (tp << 8) ^ (st << 16) ^ (sz << 24));
            hash ^= (val & 0xFF); hash = Math.imul(hash, 0x01000193);
            hash ^= ((val >> 8) & 0xFF); hash = Math.imul(hash, 0x01000193);
            hash ^= ((val >> 16) & 0xFF); hash = Math.imul(hash, 0x01000193);
            hash ^= ((val >> 24) & 0xFF); hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16).padStart(8, "0");
    };

    return {
        mulberry32,
        BivariateHawkes,
        LimitOrderBook,
        packRow,
        avellanedaStoikov,
        hashEvents
    };
}));
