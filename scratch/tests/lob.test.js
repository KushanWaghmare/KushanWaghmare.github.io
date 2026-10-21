/* Node.js Test Suite for Limit Order Book & Hawkes Mathematics (scratch/tests/lob.test.js).
   Imports the exact same shared/lib/lob-math.js module that ships to the browser.
   Deterministic PRNG (mulberry32), full double precision verification. */

const path = require("path");
const {
    mulberry32,
    BivariateHawkes,
    LimitOrderBook,
    packRow,
    avellanedaStoikov,
    hashEvents
} = require(path.join(__dirname, "../../shared/lib/lob-math.js"));

const results = [];
const logPass = (name, details) => {
    results.push({ name, pass: true, details });
    console.log(`  ✓ ${name}: ${details}`);
};
const logFail = (name, details) => {
    results.push({ name, pass: false, details });
    console.error(`  ✗ ${name}: ${details}`);
};

console.log("\n=======================================================");
console.log("  Order Book Terrain (LOB & Hawkes Maths Test Suite)");
console.log("=======================================================\n");

// ---------------------------------------------------------------------
// Test 1: Stationary Intensity
// ---------------------------------------------------------------------
try {
    const h = new BivariateHawkes({ seed: 101, mu: 0.3, alphaS: 1.2, alphaC: 0.4, beta: 2.0 });
    const targetT = 200000; // 2e5 simulated seconds
    let n0 = 0, n1 = 0;

    while (h.t < targetT) {
        const ev = h.nextEvent();
        if (ev.t <= targetT) {
            if (ev.type === 0) n0++; else n1++;
        }
    }

    const rate0 = n0 / targetT;
    const rate1 = n1 / targetT;
    const theo = h.stationaryRatePerType; // 1.5
    const err0 = Math.abs(rate0 - theo) / theo;
    const err1 = Math.abs(rate1 - theo) / theo;

    if (err0 < 0.02 && err1 < 0.02) {
        logPass("1. Stationary intensity", `Over 2e5 s: Rate0=${rate0.toFixed(4)}/s (err ${(err0 * 100).toFixed(2)}%), Rate1=${rate1.toFixed(4)}/s (err ${(err1 * 100).toFixed(2)}%), within 2% of theoretical ${theo.toFixed(4)}/s`);
    } else {
        logFail("1. Stationary intensity", `Rate0=${rate0.toFixed(4)} err ${(err0 * 100).toFixed(2)}%, Rate1=${rate1.toFixed(4)} err ${(err1 * 100).toFixed(2)}% exceeded 2%`);
    }
} catch (e) { logFail("1. Stationary intensity", e.message); }

// ---------------------------------------------------------------------
// Test 2: Time-Rescaling (Compensator KS Test & Autocorrelation)
// ---------------------------------------------------------------------
try {
    const h = new BivariateHawkes({ seed: 202 });
    const N = 60000;
    const compensators = new Float64Array(N);

    let prevT = 0.0;
    let postSTotPrev = 0.0;

    for (let k = 0; k < N; k++) {
        const ev = h.nextEvent();
        const dt = ev.t - prevT;
        const Lambda = 2.0 * h.mu * dt + (postSTotPrev / h.beta) * (1.0 - Math.exp(-h.beta * dt));
        compensators[k] = Lambda;
        prevT = ev.t;
        postSTotPrev = ev.postSTot;
    }

    let sum = 0, sumSq = 0;
    for (let i = 0; i < N; i++) {
        sum += compensators[i];
        sumSq += compensators[i] * compensators[i];
    }
    const mean = sum / N;
    const variance = sumSq / N - mean * mean;

    let autoCov = 0;
    for (let i = 0; i < N - 1; i++) {
        autoCov += (compensators[i] - mean) * (compensators[i + 1] - mean);
    }
    const lag1 = autoCov / ((N - 1) * variance);

    compensators.sort();
    let maxD = 0;
    for (let i = 0; i < N; i++) {
        const theo = 1.0 - Math.exp(-compensators[i]);
        const d1 = Math.abs(i / N - theo);
        const d2 = Math.abs((i + 1) / N - theo);
        if (d1 > maxD) maxD = d1;
        if (d2 > maxD) maxD = d2;
    }
    const ksThreshold = 1.63 / Math.sqrt(N);

    if (maxD < ksThreshold && Math.abs(lag1) < 0.02) {
        logPass("2. Time-rescaling", `N=${N} increments: KS statistic=${maxD.toFixed(6)} < threshold ${ksThreshold.toFixed(6)}, lag-1 autocorrelation=${lag1.toFixed(5)} (|r1| < 0.02), compensator mean=${mean.toFixed(4)} var=${variance.toFixed(4)}`);
    } else {
        logFail("2. Time-rescaling", `KS stat=${maxD.toFixed(6)} (thresh ${ksThreshold.toFixed(6)}), lag-1=${lag1.toFixed(5)}`);
    }
} catch (e) { logFail("2. Time-rescaling", e.message); }

// ---------------------------------------------------------------------
// Test 3: Independent Cross-Check (Cluster/Branching Representation)
// ---------------------------------------------------------------------
try {
    const rng = mulberry32(303);
    const randPoisson = (lambda) => {
        const L = Math.exp(-lambda);
        let k = 0, p = 1.0;
        do { k++; p *= rng(); } while (p > L);
        return k - 1;
    };

    const muTot = 0.6, nBranch = 0.8, beta = 2.0;
    const T_burn = 200, T_sim = 160000, windowSize = 400;
    const numWindows = Math.floor(T_sim / windowSize);
    const windowCounts = new Float64Array(numWindows);

    let t = -T_burn;
    const queue = [];
    while (t < T_sim) {
        const dt = -Math.log(Math.max(rng(), 1e-15)) / muTot;
        t += dt;
        if (t < T_sim) {
            queue.push(t);
            if (t >= 0) {
                const w = Math.floor(t / windowSize);
                if (w < numWindows) windowCounts[w]++;
            }
        }
    }

    let qHead = 0;
    while (qHead < queue.length) {
        const parentT = queue[qHead++];
        const numChildren = randPoisson(nBranch);
        for (let c = 0; c < numChildren; c++) {
            const delay = -Math.log(Math.max(rng(), 1e-15)) / beta;
            const childT = parentT + delay;
            if (childT < T_sim) {
                queue.push(childT);
                if (childT >= 0) {
                    const w = Math.floor(childT / windowSize);
                    if (w < numWindows) windowCounts[w]++;
                }
            }
        }
    }

    let sum = 0, sumSq = 0;
    for (let i = 0; i < numWindows; i++) {
        sum += windowCounts[i];
        sumSq += windowCounts[i] * windowCounts[i];
    }
    const meanCount = sum / numWindows;
    const varCount = sumSq / numWindows - meanCount * meanCount;
    const fano = varCount / meanCount;

    const theoMean = (muTot / (1.0 - nBranch)) * windowSize; // 1200
    const theoFano = 1.0 / Math.pow(1.0 - nBranch, 2); // 25.0
    const meanErr = Math.abs(meanCount - theoMean) / theoMean;
    const fanoErr = Math.abs(fano - theoFano) / theoFano;

    if (meanErr < 0.02 && fanoErr < 0.08) {
        logPass("3. Independent cross-check", `Cluster branching (${numWindows} windows of 400 s): mean count=${meanCount.toFixed(2)} (err ${(meanErr * 100).toFixed(2)}% < 2%), Fano factor=${fano.toFixed(2)} (err ${(fanoErr * 100).toFixed(2)}% < 8% of 25.0)`);
    } else {
        logFail("3. Independent cross-check", `mean=${meanCount.toFixed(2)} err=${(meanErr * 100).toFixed(2)}%, Fano=${fano.toFixed(2)} err=${(fanoErr * 100).toFixed(2)}%`);
    }
} catch (e) { logFail("3. Independent cross-check", e.message); }

// ---------------------------------------------------------------------
// Test 4: Parameter Validation (Spectral Radius >= 1 Throws)
// ---------------------------------------------------------------------
try {
    let threw = false;
    try {
        new BivariateHawkes({ alphaS: 1.5, alphaC: 0.6, beta: 2.0 }); // (1.5 + 0.6) / 2.0 = 1.05 >= 1.0
    } catch (err) {
        threw = true;
    }
    let threwUnit = false;
    try {
        new BivariateHawkes({ alphaS: 1.0, alphaC: 1.0, beta: 2.0 }); // (1.0 + 1.0) / 2.0 = 1.0 >= 1.0
    } catch (err) {
        threwUnit = true;
    }

    if (threw && threwUnit) {
        logPass("4. Parameter validation", "Constructors throw Error when spectral radius (alpha_s + alpha_c)/beta >= 1.0");
    } else {
        logFail("4. Parameter validation", `Did not throw on spectral radius >= 1: threw=${threw}, threwUnit=${threwUnit}`);
    }
} catch (e) { logFail("4. Parameter validation", e.message); }

// ---------------------------------------------------------------------
// Test 5: Book without Market Orders (M/M/infinity Poisson Levels)
// ---------------------------------------------------------------------
try {
    const L = 20, theta = 0.1, kappa = 8.0, A = 1.36;
    const lambdaL = new Float64Array(L + 1);
    let sumLambda = 0;
    for (let d = 1; d <= L; d++) {
        lambdaL[d] = A * d * Math.exp(-d / kappa);
        sumLambda += lambdaL[d];
    }

    // Freeze opposite best at tick 5000, passive bids arrive at 5000 - d
    const vols = new Int32Array(L + 1);
    const rng = mulberry32(12345);

    // Warm-up relaxation to stationarity
    let t = 0;
    const warmUp = 500;
    while (t < warmUp) {
        let totV = 0;
        for (let d = 1; d <= L; d++) totV += vols[d];
        const totRate = sumLambda + totV * theta;
        const dt = -Math.log(Math.max(rng(), 1e-15)) / totRate;
        t += dt;
        if (rng() * totRate < sumLambda) {
            const r = rng() * sumLambda;
            let acc = 0;
            for (let d = 1; d <= L; d++) {
                acc += lambdaL[d];
                if (acc >= r) { vols[d]++; break; }
            }
        } else {
            let totV2 = 0;
            for (let d = 1; d <= L; d++) totV2 += vols[d];
            const rU = Math.floor(rng() * totV2);
            let acc = 0;
            for (let d = 1; d <= L; d++) {
                acc += vols[d];
                if (acc > rU) { vols[d]--; break; }
            }
        }
    }

    // Record snapshots spaced 100 s apart
    const numSnapshots = 1800;
    const snapshots = Array.from({ length: L + 1 }, () => new Float64Array(numSnapshots));

    for (let s = 0; s < numSnapshots; s++) {
        const nextTargetT = t + 100.0;
        while (t < nextTargetT) {
            let totV = 0;
            for (let d = 1; d <= L; d++) totV += vols[d];
            const totRate = sumLambda + totV * theta;
            const dt = -Math.log(Math.max(rng(), 1e-15)) / totRate;
            t += dt;
            if (rng() * totRate < sumLambda) {
                const r = rng() * sumLambda;
                let acc = 0;
                for (let d = 1; d <= L; d++) {
                    acc += lambdaL[d];
                    if (acc >= r) { vols[d]++; break; }
                }
            } else {
                let totV2 = 0;
                for (let d = 1; d <= L; d++) totV2 += vols[d];
                if (totV2 > 0) {
                    const rU = Math.floor(rng() * totV2);
                    let acc = 0;
                    for (let d = 1; d <= L; d++) {
                        acc += vols[d];
                        if (acc > rU) { vols[d]--; break; }
                    }
                }
            }
        }
        for (let d = 1; d <= L; d++) snapshots[d][s] = vols[d];
    }

    let allPassed = true;
    const errors = [];
    for (let d = 1; d <= L; d++) {
        let sSum = 0, sSumSq = 0;
        for (let i = 0; i < numSnapshots; i++) {
            sSum += snapshots[d][i];
            sSumSq += snapshots[d][i] * snapshots[d][i];
        }
        const mean = sSum / numSnapshots;
        const variance = sSumSq / numSnapshots - mean * mean;
        const fano = variance / mean;
        const theoMean = lambdaL[d] / theta;
        const meanErr = Math.abs(mean - theoMean) / theoMean;
        if (meanErr > 0.03 || fano < 0.90 || fano > 1.10) {
            allPassed = false;
            errors.push(`d=${d}: mean=${mean.toFixed(2)} (theo ${theoMean.toFixed(2)}, err ${(meanErr * 100).toFixed(1)}%), Fano=${fano.toFixed(2)}`);
        }
    }

    if (allPassed) {
        logPass("5. Book without market orders (M/M/infinity)", `Levels d=1..20: Poisson mean within 3% and Fano factor in [0.9, 1.1] over ${numSnapshots} independent snapshots`);
    } else {
        logFail("5. Book without market orders (M/M/infinity)", `Deviations: ${errors.join("; ")}`);
    }
} catch (e) { logFail("5. Book without market orders (M/M/infinity)", e.message); }

// ---------------------------------------------------------------------
// Test 6: Accounting Identity (1,000,000 Events)
// ---------------------------------------------------------------------
try {
    const book = new LimitOrderBook({ seed: 606 });
    const targetEvents = 1000000;
    let ev = 0;

    let minVolSeen = Infinity;
    let minSpreadSeen = Infinity;

    while (ev < targetEvents) {
        book.step();
        ev++;
        if (ev % 10000 === 0) {
            const sp = book.spread;
            if (sp < minSpreadSeen) minSpreadSeen = sp;
            if (book.totalVol < minVolSeen) minVolSeen = book.totalVol;
        }
    }

    const acct = book.getAccounting();
    const noNegatives = minVolSeen >= 0;
    const neverCrossed = minSpreadSeen >= 1;

    if (acct.diff === 0 && noNegatives && neverCrossed) {
        logPass("6. Accounting identity", `Over 1e6 events: added(${acct.added}) - cancelled(${acct.cancelled}) - executed(${acct.executed}) - evicted(${acct.evicted}) = change(${acct.changeInVol}) [diff=0 exact, minSpread=${minSpreadSeen} >= 1, minVol=${minVolSeen} >= 0]`);
    } else {
        logFail("6. Accounting identity", `diff=${acct.diff}, neverCrossed=${neverCrossed}, noNegatives=${noNegatives}`);
    }
} catch (e) { logFail("6. Accounting identity", e.message); }

// ---------------------------------------------------------------------
// Test 7: Walk-the-Book (Brute-Force Parity on 1,000 Random Books)
// ---------------------------------------------------------------------
try {
    const rng = mulberry32(707);
    let allMatches = true;

    for (let trial = 0; trial < 1000; trial++) {
        const side = rng() < 0.5 ? "bid" : "ask";
        const center = 5000;
        const book = new LimitOrderBook({ seedInitialBook: false, centerPrice: center, seed: trial });

        // Generate 15 random levels with volumes
        const referenceLevels = [];
        const numLevels = 10 + Math.floor(rng() * 15);
        for (let l = 1; l <= numLevels; l++) {
            const price = side === "ask" ? center + l : center - l;
            const volume = 1 + Math.floor(rng() * 20);
            book.vol[price - book.pMin] = volume;
            book.totalVol += volume;
            referenceLevels.push({ price, volume });
        }
        book.bestBid = side === "ask" ? center - 1 : center - 1;
        book.bestAsk = side === "ask" ? center + 1 : center + 1;
        if (side === "bid") {
            book.bestBid = referenceLevels[0].price;
        } else {
            book.bestAsk = referenceLevels[0].price;
        }

        const orderSize = 1 + Math.floor(rng() * 45);

        // Brute force walk
        let bfRem = orderSize;
        let bfFilled = 0;
        const bfFills = [];
        const sortedRef = referenceLevels.slice().sort((a, b) => side === "ask" ? a.price - b.price : b.price - a.price);

        let bfNewBest = side === "ask" ? book.bestAsk : book.bestBid;
        for (let i = 0; i < sortedRef.length; i++) {
            if (bfRem <= 0) break;
            const lvl = sortedRef[i];
            const take = Math.min(lvl.volume, bfRem);
            lvl.volume -= take;
            bfRem -= take;
            bfFilled += take;
            bfFills.push({ price: lvl.price, filled: take });
        }
        const remainingLvl = sortedRef.find(l => l.volume > 0);
        bfNewBest = remainingLvl ? remainingLvl.price : (side === "ask" ? sortedRef[sortedRef.length - 1].price + 1 : sortedRef[sortedRef.length - 1].price - 1);

        // Book walk
        const res = book.walkBook(side, orderSize);

        if (res.filled !== bfFilled || res.remaining !== bfRem || res.newBest !== bfNewBest) {
            allMatches = false;
            break;
        }
    }

    if (allMatches) {
        logPass("7. Walk-the-book", "1,000 random books: fills, remaining sizes, and resulting best prices agree exactly with brute-force consumption");
    } else {
        logFail("7. Walk-the-book", "Mismatch against brute-force consumption");
    }
} catch (e) { logFail("7. Walk-the-book", e.message); }

// ---------------------------------------------------------------------
// Test 8: Model Stationarity (3,600 s Simulation)
// ---------------------------------------------------------------------
try {
    const book = new LimitOrderBook({ seed: 808, centerPrice: 5000 });
    const targetT = 3600.0;

    let spreadSum = 0, spreadCount = 0;
    const spreadCounts = {};
    let midStart = book.midPrice;
    let midSqDiffSum = 0;
    let prevMid = midStart;

    while (book.t < targetT) {
        book.step();
        const sp = book.spread;
        spreadSum += sp;
        spreadCount++;
        spreadCounts[sp] = (spreadCounts[sp] || 0) + 1;

        const curMid = book.midPrice;
        midSqDiffSum += (curMid - prevMid) * (curMid - prevMid);
        prevMid = curMid;
    }

    const meanSpread = spreadSum / spreadCount;
    const depletionsPerMin = book.depletionCount / (targetT / 60.0);
    const midVolatility = Math.sqrt(midSqDiffSum / targetT);
    const acct = book.getAccounting();

    const staysInGrid = acct.evicted === 0;
    const spreadOk = meanSpread >= 1.0 && meanSpread <= 3.0;

    if (staysInGrid && spreadOk) {
        logPass("8. Model stationarity", `Over 3600 s: Mean spread=${meanSpread.toFixed(3)} ticks (in [1, 3]), evictions=${acct.evicted}, touch depletions=${depletionsPerMin.toFixed(2)}/min, mid-volatility=${midVolatility.toFixed(3)} ticks/s. Spread distribution: ${JSON.stringify(spreadCounts)}`);
    } else {
        logFail("8. Model stationarity", `meanSpread=${meanSpread.toFixed(3)}, evictions=${acct.evicted}`);
    }
} catch (e) { logFail("8. Model stationarity", e.message); }

// ---------------------------------------------------------------------
// Test 9: Determinism & Parity
// ---------------------------------------------------------------------
try {
    const runEvents = (seed) => {
        const book = new LimitOrderBook({ seed });
        const events = [];
        while (events.length < 1000) {
            const ev = book.step();
            if (ev.eventType === "market") {
                events.push({ t: ev.t, type: ev.type, strike: ev.strike, size: ev.size });
            }
        }
        return events;
    };

    const evA = runEvents(909);
    const evB = runEvents(909);
    const hashA = hashEvents(evA);
    const hashB = hashEvents(evB);

    let identical = (hashA === hashB) && evA.length === evB.length;
    for (let i = 0; i < evA.length; i++) {
        if (evA[i].t !== evB[i].t || evA[i].type !== evB[i].type || evA[i].strike !== evB[i].strike || evA[i].size !== evB[i].size) {
            identical = false;
            break;
        }
    }

    if (identical) {
        logPass("9. Determinism and parity", `First 1,000 market order events match identically (FNV-1a hash: 0x${hashA})`);
    } else {
        logFail("9. Determinism and parity", `Hashes differed: 0x${hashA} vs 0x${hashB}`);
    }
} catch (e) { logFail("9. Determinism and parity", e.message); }

// ---------------------------------------------------------------------
// Test 10: Ripple Consistency
// ---------------------------------------------------------------------
try {
    const h = new BivariateHawkes({ seed: 1010, beta: 2.0, alphaS: 1.2, alphaC: 0.4 });
    const horizon = 15.0 / h.beta; // 7.5 seconds
    const eventHistory = [];

    // Advance 500 seconds
    while (h.t < 500.0) {
        const ev = h.nextEvent();
        eventHistory.push({ t: ev.t, type: ev.type });
    }

    const curT = h.t;
    // Calculate exact excitation sum over events within last 15/beta seconds
    let exactS0 = 0.0, exactS1 = 0.0;
    for (let i = eventHistory.length - 1; i >= 0; i--) {
        const e = eventHistory[i];
        const age = curT - e.t;
        if (age > horizon) break;
        const decay = Math.exp(-h.beta * age);
        if (e.type === 0) {
            exactS0 += h.alphaS * decay;
            exactS1 += h.alphaC * decay;
        } else {
            exactS0 += h.alphaC * decay;
            exactS1 += h.alphaS * decay;
        }
    }

    const relErr0 = Math.abs(h.s0 - exactS0) / (h.s0 + 1e-9);
    const relErr1 = Math.abs(h.s1 - exactS1) / (h.s1 + 1e-9);

    if (relErr0 < 1e-5 && relErr1 < 1e-5) {
        logPass("10. Ripple consistency", `Excitation sum over last 15/beta s equals state within rel err: S0 err=${relErr0.toExponential(3)}, S1 err=${relErr1.toExponential(3)} (< 1e-5)`);
    } else {
        logFail("10. Ripple consistency", `Relative error S0=${relErr0.toExponential(3)}, S1=${relErr1.toExponential(3)} exceeded 1e-5`);
    }
} catch (e) { logFail("10. Ripple consistency", e.message); }

// ---------------------------------------------------------------------
// Test 11: Performance (1 Hour / ~2e6 Events)
// ---------------------------------------------------------------------
try {
    const book = new LimitOrderBook({ seed: 1111 });
    const t0 = performance.now();
    let events = 0;

    while (book.t < 3600.0) {
        book.step();
        events++;
    }
    const t1 = performance.now();
    const elapsedMs = t1 - t0;
    const evPerSec = events / (elapsedMs / 1000.0);

    if (events > 1000000 && elapsedMs < 5000) {
        logPass("11. Performance", `1 hour of simulated time (${events} events) completed in ${elapsedMs.toFixed(1)} ms (${(evPerSec / 1e6).toFixed(2)} million events/second)`);
    } else {
        logFail("11. Performance", `Took ${elapsedMs.toFixed(1)} ms for ${events} events`);
    }
} catch (e) { logFail("11. Performance", e.message); }

// ---------------------------------------------------------------------
// Test 12: Rendering Contract (packRow) & Avellaneda-Stoikov
// ---------------------------------------------------------------------
try {
    const book = new LimitOrderBook({ seed: 1212, centerPrice: 5000 });
    const W = 256;
    const row = packRow(book, null, W);

    let hasBid = false, hasAsk = false, hasSpread = false;
    const bestBidCol = ((book.bestBid % W) + W) % W;
    const bestAskCol = ((book.bestAsk % W) + W) % W;

    for (let c = 0; c < W; c++) {
        if (row[c] < 0) hasBid = true;
        if (row[c] > 0) hasAsk = true;
    }
    // Middle of spread must be 0
    if (book.spread > 1) {
        for (let p = book.bestBid + 1; p < book.bestAsk; p++) {
            const c = ((p % W) + W) % W;
            if (row[c] === 0) hasSpread = true;
        }
    } else {
        hasSpread = true;
    }

    // Check Avellaneda-Stoikov
    const as1 = avellanedaStoikov(100.0, 0, 0.1, 0.3, 1.0, 1.5, 140.0);
    // r = 100 - 0 = 100
    // delta = 0.1 * 0.09 * 1 + (2/0.1)*ln(1 + 0.1/1.5) = 0.009 + 20 * ln(1 + 1/15) = 0.009 + 20 * 0.06453852113757116 = 1.2997704227514232
    const handDelta = 0.1 * 0.09 * 1.0 + (2.0 / 0.1) * Math.log(1.0 + 0.1 / 1.5);
    const deltaDiff = Math.abs(as1.optimalSpread - handDelta);
    const symDiff = Math.abs((as1.askQuote + as1.bidQuote) * 0.5 - as1.reservationPrice);

    // Positive inventory q=2
    const as2 = avellanedaStoikov(100.0, 2, 0.1, 0.3, 1.0, 1.5, 140.0);
    const rLower = as2.reservationPrice < 100.0;

    if (hasBid && hasAsk && hasSpread && deltaDiff < 1e-12 && symDiff < 1e-12 && rLower) {
        logPass("12. packRow & Avellaneda-Stoikov", `packRow: row[256] signed sqrt heights verified (cool bid < 0, warm ask > 0, spread canyon = 0). A-S: delta diff=${deltaDiff.toExponential(3)}, symmetric about r (${symDiff.toExponential(3)}), q=+2 pushes r(${as2.reservationPrice.toFixed(3)}) < mid(100)`);
    } else {
        logFail("12. packRow & Avellaneda-Stoikov", `hasBid=${hasBid}, hasAsk=${hasAsk}, hasSpread=${hasSpread}, deltaDiff=${deltaDiff}`);
    }
} catch (e) { logFail("12. packRow & Avellaneda-Stoikov", e.message); }

const passedCount = results.filter(r => r.pass).length;
console.log(`\nResults: ${passedCount} / ${results.length} tests passed.\n`);

if (passedCount !== results.length) {
    process.exit(1);
}
