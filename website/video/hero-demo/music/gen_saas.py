#!/usr/bin/env python3
"""
Trilha original do hero (gerador do hero do Tá no Caixa, reaproveitado no CarvCAM): "light corporate / feel-good" de SaaS.

Referências de mercado (trilhas de demo de produto): 95-125 BPM, piano e plucks de marimba
em primeiro plano, pulso eletrônico suave, baixo redondo, palmas/estalos como textura e
muito espaço. Nada de serra/chiptune.

16 compassos a ~123,9 BPM = exatamente 31,000 s (o tamanho do vídeo). Um acorde por compasso
(C - G - Am - F x3, fecha em C - G - F - G). Arranjo que acompanha o vídeo:
  1-2   piano solo + pad                      3-7   kick em meio-tempo, shaker e baixo
  8-12  four-on-the-floor, palmas, marimba    13-14 clímax (marimba dobrada, sinos)
  15-16 respiro: piano + pad + sino -> fecha na logo e volta ao início

Sintetizada em numpy (sem samples, sem licença, sem atribuição). O pattern é renderizado 3x e o
miolo recortado, então reverb e delay fecham o loop sem emenda.

    python3 gen_saas.py out.wav
"""
import sys
import wave
import numpy as np
from scipy import signal

SR = 44100
BARS = 18
DUR = 34.875
BAR = DUR / BARS
BEAT = BAR / 4            # ~0,5536 s (~108,4 BPM)
E8 = BEAT / 2
S16 = BEAT / 4
LOOP_N = int(round(DUR * SR))
N_LOOPS = 3
TOTAL = LOOP_N * N_LOOPS + SR * 4
rng = np.random.default_rng(57)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR * 0.45) / (SR / 2), "low")
    return signal.lfilter(b, a, x)


def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), "high")
    return signal.lfilter(b, a, x)


# ---- instrumentos --------------------------------------------------------
def epiano(freq, dur, amp):
    """Piano elétrico macio (FM estilo Rhodes): sino suave no ataque, corpo redondo."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    idx = 1.6 * np.exp(-t / 0.18) + 0.25
    mod = np.sin(2 * np.pi * freq * t) * idx
    y = np.sin(2 * np.pi * freq * t + mod)
    tine = 0.18 * np.sin(2 * np.pi * freq * 7 * t + 0.4) * np.exp(-t / 0.05)
    y = (y + tine) * np.exp(-t / 0.9)
    thump = lp(rng.standard_normal(n), 900) * np.exp(-t / 0.012) * 0.25
    y = lp(y + thump, 5000)
    att = np.minimum(1, t / 0.004)
    rel = np.minimum(1, (dur - t) / 0.06).clip(0, 1)
    return y * att * rel * amp


def marimba(freq, dur, amp):
    """Marimba/kalimba: parciais de barra de madeira, decaimento curto."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.32)
         + 0.45 * np.sin(2 * np.pi * freq * 3.98 * t) * np.exp(-t / 0.09)
         + 0.12 * np.sin(2 * np.pi * freq * 9.2 * t) * np.exp(-t / 0.03))
    y += lp(rng.standard_normal(n), 2500) * np.exp(-t / 0.004) * 0.12
    att = np.minimum(1, t / 0.002)
    rel = np.minimum(1, (dur - t) / 0.05).clip(0, 1)
    return y * att * rel * amp


def bell(freq, dur, amp):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * freq * t)
         + 0.5 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t / 0.5)
         + 0.25 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t / 0.25)) * np.exp(-t / 1.1)
    return y * np.minimum(1, t / 0.003) * amp


def sub_bass(freq, dur, amp):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(4 * np.pi * freq * t) * np.exp(-t / 0.15)
    env = np.minimum(1, t / 0.01) * np.exp(-t / 0.5) * np.minimum(1, (dur - t) / 0.04).clip(0, 1)
    return lp(y * env, 420) * amp


def pad_chord(freqs, dur, amp):
    """Pad de senos com leve coro (sem serra): macio e aberto."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    outL = np.zeros(n)
    outR = np.zeros(n)
    for f in freqs:
        for det, pan in ((-0.004, -0.8), (0.0, 0.0), (0.004, 0.8)):
            y = np.sin(2 * np.pi * f * (1 + det) * t) + 0.3 * np.sin(4 * np.pi * f * (1 + det) * t)
            outL += y * np.cos((pan + 1) * np.pi / 4)
            outR += y * np.sin((pan + 1) * np.pi / 4)
    env = np.minimum(1, t / 0.5) * np.minimum(1, (dur - t) / 0.6).clip(0, 1)
    return lp(outL * env, 2200) * amp, lp(outR * env, 2200) * amp


def kick(amp):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = 48 + 70 * np.exp(-t / 0.03)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.13)
    y += 0.12 * lp(rng.standard_normal(n), 1800) * np.exp(-t / 0.004)
    return y * amp


def shaker(amp):
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    y = lp(hp(rng.standard_normal(n), 5500), 11000) * np.exp(-t / 0.016)
    return y * amp


def clap(amp):
    """Palma + estalo, macios (referência de identidades sonoras com claps/snaps)."""
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for off in (0.0, 0.009, 0.019):
        i = int(off * SR)
        y[i:] += np.exp(-np.arange(n - i) / SR / 0.011)
    y *= hp(lp(rng.standard_normal(n), 3000), 1000)
    y += 0.6 * hp(lp(rng.standard_normal(n), 2600), 900) * np.exp(-t / 0.06)
    return y * amp * 0.5


def swell(secs, amp):
    n = int(secs * SR)
    t = np.arange(n) / SR
    y = hp(rng.standard_normal(n), 3000) * (t / secs) ** 2.4
    return lp(y, 9000) * amp


# ---- partitura -----------------------------------------------------------
# (nome, baixo, notas do piano [4 tons], pad [3 tons])
CH = {
    "C": (36, [60, 64, 67, 72], [55, 60, 64]),
    "G": (43, [59, 62, 67, 71], [55, 59, 62]),
    "Am": (45, [57, 60, 64, 69], [57, 60, 64]),
    "F": (41, [57, 60, 65, 69], [53, 57, 60]),
}
# compasso 0 = abertura da marca, 1-16 = vídeo, 17 = fechamento da marca (resolve em C e volta pro 0)
PROG = ["C"] + ["C", "G", "Am", "F"] * 3 + ["C", "G", "F", "G"] + ["C"]
PIANO_PATTERN = [0, 1, 2, 3, 2, 3, 2, 1]
PIANO_PATTERN_B = [0, 2, 1, 3, 2, 1, 3, 2]

MEL = {  # (colcheia 0-7, duração em colcheias, MIDI)
    "C": [(0, 2, 76), (2, 1, 79), (3, 1, 76), (4, 2, 74), (6, 2, 72)],
    "G": [(0, 2, 74), (2, 1, 71), (3, 1, 74), (4, 3, 79)],
    "Am": [(0, 2, 72), (2, 1, 76), (3, 1, 72), (4, 2, 69), (6, 2, 76)],
    "F": [(0, 2, 69), (2, 1, 72), (3, 1, 77), (4, 4, 79)],
}

bus_names = ["drums", "bass", "pad", "piano", "mallet"]
bus = {k: [np.zeros(TOTAL), np.zeros(TOTAL)] for k in bus_names}


def put(name, y, t0, pan=0.0, gain=1.0, y2=None):
    i = int(t0 * SR)
    if i < 0 or i >= TOTAL:
        return
    if y2 is None:
        a = y * np.cos((pan + 1) * np.pi / 4) * gain
        b = y * np.sin((pan + 1) * np.pi / 4) * gain
    else:
        a, b = y * gain, y2 * gain
    m = min(len(a), TOTAL - i)
    bus[name][0][i:i + m] += a[:m]
    bus[name][1][i:i + m] += b[:m]


kick_times = []
for loop in range(N_LOOPS):
    base = loop * DUR
    for bar in range(BARS):
        t0 = base + bar * BAR
        name = PROG[bar]
        bnote, keys, padn = CH[name]
        n = bar
        # pad
        L, R = pad_chord([mtof(m) for m in padn], BAR * 1.05, 0.04 if n <= 2 or n >= 15 else 0.03)
        put("pad", L, t0, y2=R)
        # piano: mão esquerda + arpejo de colcheias
        pat = PIANO_PATTERN_B if 8 <= n <= 14 else PIANO_PATTERN
        piano_amp = 0.3 if n <= 2 else (0.26 if n >= 15 else 0.28)
        put("piano", epiano(mtof(bnote + 12), BAR * 0.9, piano_amp * 0.4), t0, -0.1)
        if n == 17:  # fechamento: acorde rolado e longo, o piano respira
            for k, m in enumerate(keys):
                put("piano", epiano(mtof(m), 3.2, piano_amp * 0.8), t0 + k * 0.07, 0.1 * (k - 1.5))
        for s in (range(8) if n != 17 else ()):
            acc = 1.0 if s % 4 == 0 else (0.8 if s % 2 == 0 else 0.62)
            put("piano", epiano(mtof(keys[pat[s]]), 0.9, piano_amp * acc),
                t0 + s * E8, 0.15 if s % 2 else -0.05)
        # baixo
        if 3 <= n <= 14:
            # groove sincopado (1, 2&, 3&, 4) com oitava no fim da frase
            for pos, nt in ((0, bnote), (3 * E8, bnote), (5 * E8, bnote + 12), (7 * E8, bnote + 7 if name in ("C", "Am") else bnote)):
                put("bass", sub_bass(mtof(nt), 0.3, 0.26), t0 + pos, 0.0)
        # bateria: meio-tempo na construção, four-on-the-floor com palmas na parte principal
        if 3 <= n <= 14:
            for b in ((0, 1, 2, 3) if n >= 8 else (0, 2)):
                put("drums", kick(0.38), t0 + b * BEAT, 0.0)
                kick_times.append(t0 + b * BEAT)
            if n >= 8:
                for s in range(16):  # shaker em semicolcheias, acento fora do tempo
                    put("drums", shaker(0.05 if s % 4 == 2 else (0.03 if s % 2 == 0 else 0.022)), t0 + s * S16, 0.3)
                for b in range(4):  # contratempo aberto
                    put("drums", shaker(0.07), t0 + b * BEAT + BEAT / 2, -0.25)
            else:
                for s in range(8):
                    put("drums", shaker(0.05 if s % 2 == 0 else 0.035), t0 + s * E8 + (E8 / 2 if s % 2 else 0), 0.3)
        if 8 <= n <= 14:
            for b in (1, 3):
                put("drums", clap(0.8), t0 + b * BEAT, 0.0)
        if n == 7:
            put("drums", swell(BAR, 0.1), t0, 0.0)
        if n == 0:  # sobe junto com a transição sol -> mar e abre o app
            put("drums", swell(BAR * 0.55, 0.08), t0 + BAR * 0.45, 0.0)
            put("mallet", bell(mtof(84), 1.8, 0.05), t0 + 0.05, 0.2)
        if n == 16:  # o sol cresce de novo: swell para o fechamento da marca
            put("drums", swell(BAR * 0.5, 0.08), t0 + BAR * 0.5, 0.0)
        if n == 17:  # sino do símbolo (quadrado, traço, nome) e fecha em C
            put("mallet", bell(mtof(84), 2.6, 0.07), t0 + 0.2, 0.2)
            put("mallet", bell(mtof(79), 2.6, 0.06), t0 + 0.9, -0.2)
            put("mallet", bell(mtof(72), 2.8, 0.06), t0 + 1.4, 0.0)
        # marimba (hook) e sinos
        if 8 <= n <= 16:
            m_amp = 0.36 if n <= 14 else 0.24
            for step, ln, midi in MEL[name]:
                put("mallet", marimba(mtof(midi), max(0.2, ln * E8 * 0.9), m_amp), t0 + step * E8, 0.25)
                if 13 <= n <= 14:
                    put("mallet", marimba(mtof(midi + 12), 0.3, m_amp * 0.45), t0 + step * E8, -0.25)
            if 13 <= n <= 16:
                put("mallet", bell(mtof(CH[name][1][3] + 12), 1.4, 0.07), t0, 0.35)
        if n == 16:
            put("mallet", bell(mtof(79), 2.4, 0.08), t0 + BEAT, 0.2)
            put("mallet", bell(mtof(72), 2.4, 0.06), t0 + 2.5 * BEAT, -0.2)

# sidechain leve: kick "respira" pad e baixo
sc = np.ones(TOTAL)
tt = np.arange(int(0.4 * SR)) / SR
curve = 1 - 0.35 * np.exp(-tt / 0.1)
for kt in kick_times:
    i = int(kt * SR)
    m = min(len(curve), TOTAL - i)
    sc[i:i + m] = np.minimum(sc[i:i + m], curve[:m])
for nm in ("pad", "bass"):
    bus[nm][0] *= sc
    bus[nm][1] *= sc

# delay ping-pong suave (colcheia pontuada) na marimba e no piano
d = int(0.75 * BEAT * SR)
src = 0.5 * (bus["mallet"][0] + bus["mallet"][1]) + 0.18 * (bus["piano"][0] + bus["piano"][1])
dl = np.zeros(TOTAL)
dr = np.zeros(TOTAL)
for k in range(1, 5):
    g = 0.38 ** k
    sh = k * d
    tgt = dr if k % 2 else dl
    tgt[sh:] += src[:TOTAL - sh] * g
dl = lp(dl, 4000)
dr = lp(dr, 4000)

dry_l = sum(bus[k][0] for k in bus_names) + dl
dry_r = sum(bus[k][1] for k in bus_names) + dr


def ir(seed, secs=1.8):
    g = np.random.default_rng(seed)
    nn = int(secs * SR)
    t = np.arange(nn) / SR
    return lp(g.standard_normal(nn) * np.exp(-t / 0.42), 5200)


rin_l = bus["piano"][0] + bus["mallet"][0] + bus["pad"][0] * 0.5
rin_r = bus["piano"][1] + bus["mallet"][1] + bus["pad"][1] * 0.5
wl = signal.fftconvolve(rin_l, ir(5))[:TOTAL]
wr = signal.fftconvolve(rin_r, ir(6))[:TOTAL]
ref = max(np.max(np.abs(dry_l)), 1e-9)
wl = wl / (np.max(np.abs(wl)) + 1e-9) * ref * 0.2
wr = wr / (np.max(np.abs(wr)) + 1e-9) * ref * 0.2
mix_l = dry_l + wl
mix_r = dry_r + wr

a, b = LOOP_N, 2 * LOOP_N
out = np.stack([mix_l[a:b], mix_r[a:b]], axis=1)
out = np.stack([hp(out[:, 0], 30, 2), hp(out[:, 1], 30, 2)], axis=1)
out = np.stack([lp(out[:, 0], 12000), lp(out[:, 1], 12000)], axis=1)

rms = np.sqrt(np.mean(out ** 2))
out *= (10 ** (-20 / 20)) / rms
out = np.tanh(out * 1.05) / 1.05
peak = np.max(np.abs(out))
if peak > 0.9:
    out *= 0.9 / peak

pcm = (out * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("ok", sys.argv[1], f"{len(pcm)/SR:.3f}s", "rms_db", round(20 * np.log10(np.sqrt(np.mean(out ** 2))), 1),
      "peak_db", round(20 * np.log10(np.max(np.abs(out))), 1))
