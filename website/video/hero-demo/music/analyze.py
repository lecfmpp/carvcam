#!/usr/bin/env python3
"""Checagem objetiva da trilha: equilíbrio espectral, clipping, emenda do loop e dinâmica por compasso."""
import sys
import wave
import numpy as np
from scipy import signal

w = wave.open(sys.argv[1])
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2) / 32768
sr = w.getframerate()
m = x.mean(1)
f, p = signal.welch(m, sr, nperseg=8192)
tot = p.sum()
bands = [(30, 120), (120, 500), (500, 2000), (2000, 5000), (5000, 12000)]
print("centroide Hz:", round((f * p).sum() / tot))
print({f"{lo}-{hi}": round(float(10 * np.log10(p[(f >= lo) & (f < hi)].sum() / tot + 1e-12)), 1) for lo, hi in bands})
print("amostras >0.95:", int((np.abs(x) > 0.95).sum()), "| salto na emenda:", round(float(abs(m[0] - m[-1])), 4),
      "| maior passo:", round(float(np.abs(np.diff(m)).max()), 3))
bars = int(sys.argv[2]) if len(sys.argv) > 2 else 14
bar = len(m) // bars
print("dB por compasso:", [round(float(20 * np.log10(np.sqrt(np.mean(m[i * bar:(i + 1) * bar] ** 2)))), 1) for i in range(bars)])
