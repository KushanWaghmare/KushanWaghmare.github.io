#!/usr/bin/env python3
"""
scratch/verify-zeros-mpmath.py

Cross-checks all 500 tabulated zeros in shared/lib/zeta-zeros.js against mpmath.zetazero(n)
using arbitrary-precision arithmetic (mpmath.dps = 35).
Reports the maximum difference across all 500 zeros.
Must pass with maximum difference strictly below 1e-9.
"""

import os
import re
import sys
import mpmath

mpmath.mp.dps = 35

def load_tabulated_zeros():
    js_path = os.path.join(os.path.dirname(__file__), "../shared/lib/zeta-zeros.js")
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Extract all numbers inside ZETA_ZEROS array
    match = re.search(r"const ZETA_ZEROS = \[(.*?)\];", content, re.DOTALL)
    if not match:
        raise ValueError("Could not find ZETA_ZEROS in " + js_path)

    body = match.group(1)
    zeros = []
    for line in body.splitlines():
        line = line.strip()
        if not line or line.startswith("//"):
            continue
        # Strip trailing comments and commas
        val_str = line.split("//")[0].replace(",", "").strip()
        if val_str:
            zeros.append(float(val_str))

    return zeros

def main():
    print("=== Cross-Checking Tabulated Zeros Against mpmath ===")
    zeros = load_tabulated_zeros()
    print(f"Loaded {len(zeros)} tabulated zeros from shared/lib/zeta-zeros.js.")

    if len(zeros) != 500:
        print(f"ERROR: Expected 500 zeros, found {len(zeros)}")
        sys.exit(1)

    max_diff = 0.0
    max_k = -1

    golden_benchmarks = {
        1: 14.134725141734693,
        2: 21.022039638771555,
        3: 25.010857580145689,
        4: 30.424876125859513,
        5: 32.935061587739190,
        10: 49.773832477672302,
        100: 236.52422966581621,
    }

    print("\nGolden Values Check:")
    for k, expected_user in golden_benchmarks.items():
        mp_val = float(mpmath.zetazero(k).imag)
        tab_val = zeros[k - 1]
        diff_mp = abs(tab_val - mp_val)
        diff_user = abs(tab_val - expected_user)
        print(f"  gamma_{k:3d}: tabulated = {tab_val:.16f} | mpmath = {mp_val:.16f} | diff(tab, mp) = {diff_mp:.2e} | diff(tab, prompt) = {diff_user:.2e}")

    print("\nVerifying all 500 zeros against mpmath.zetazero(n)...")
    for n in range(1, 501):
        mp_zero = float(mpmath.zetazero(n).imag)
        tab_zero = zeros[n - 1]
        diff = abs(tab_zero - mp_zero)
        if diff > max_diff:
            max_diff = diff
            max_k = n

    print(f"\nVerification Results:")
    print(f"  Total zeros checked : 500")
    print(f"  Maximum difference  : {max_diff:.3e} (at zero n = {max_k})")
    print(f"  Tolerance threshold : 1.000e-09")

    if max_diff < 1e-9:
        print(f"  Status              : PASS (max_diff {max_diff:.3e} < 1e-9)")
        sys.exit(0)
    else:
        print(f"  Status              : FAIL (max_diff {max_diff:.3e} >= 1e-9)")
        sys.exit(1)

if __name__ == "__main__":
    main()
