#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════╗
║            VSL FORGE v2 — Pipeline Cinematográfico Completo             ║
║  Imagens : FLUX.1-dev (HuggingFace Inference API)                       ║
║  Vídeo   : Imagem → Ken Burns + motion via FFmpeg (sem GPU local)        ║
║  Áudio   : ElevenLabs → silêncio fallback                               ║
║  Assembly: FFmpeg (XFade, color grade, legendas ASS, trilha)            ║
╠══════════════════════════════════════════════════════════════════════════╣
║  SETUP                                                                   ║
║  pip install requests Pillow tqdm elevenlabs huggingface_hub             ║
║                                                                          ║
║  .env na mesma pasta do script:                                          ║
║  HUGGINGFACE_API_KEY=hf_xxx                                              ║
║  ELEVENLABS_API_KEY=sk_xxx                                               ║
║  VSL_SOUNDTRACK=./assets/soundtrack.mp3  (opcional)                     ║
║                                                                          ║
║  USO                                                                     ║
║  python vsl_forge_v2.py --config sample_vsl_project.json                ║
║  python vsl_forge_v2.py --config sample_vsl_project.json --draft        ║
║  python vsl_forge_v2.py --config sample_vsl_project.json --resume       ║
║  python vsl_forge_v2.py --config sample_vsl_project.json --scene hook   ║
╠══════════════════════════════════════════════════════════════════════════╣
║  ESTRATÉGIA DE IMAGEM → VÍDEO                                            ║
║  1. Gera imagem HD via FLUX.1-dev (HF Inference API)                    ║
║  2. Anima com Ken Burns (zoom + pan) via FFmpeg zoompan filter          ║
║  3. Aplica color grade cinematográfico (warm_film, teal_orange, etc.)   ║
║  4. Resultado: vídeo cinematográfico de alta qualidade SEM GPU local    ║
╚══════════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

import argparse
import io
import json
import math
import os
import random
import shutil
import subprocess
import sys
import threading
import time
import wave
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import requests

# ── Auto-load .env ────────────────────────────────────────────────────────────
def _load_dotenv(env_file: str = ".env") -> None:
    p = Path(env_file)
    if not p.exists():
        return
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = line.removeprefix("$env:").removeprefix("export ").strip()
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and val and key not in os.environ:
            os.environ[key] = val

_load_dotenv()

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
    import textwrap as _tw
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

_log_lock = threading.Lock()


# ══════════════════════════════════════════════════════════════════════════════
# Constantes
# ══════════════════════════════════════════════════════════════════════════════

HF_INFERENCE_URL = "https://router.huggingface.co/hf-inference/models/{model}"

# Modelos HuggingFace — fallback em cadeia do melhor para o mais rápido
# Modelos usados em paralelo — pega o que responder primeiro
HF_IMAGE_MODELS = [
    "black-forest-labs/FLUX.1-dev",          # melhor qualidade fotorrealista
    "black-forest-labs/FLUX.1-schnell",      # rápido, bom fallback
    "stabilityai/stable-diffusion-3.5-large", # excelente para pessoas
]

# Endpoints HuggingFace
HF_ROUTER_URL    = "https://router.huggingface.co/hf-inference/models/{model}"
HF_INFERENCE_URL = "https://router.huggingface.co/hf-inference/models/{model}"

# Color grades cinematográficos (FFmpeg eq + curves)
COLOR_GRADES: dict[str, str] = {
    "warm_film": (
        "eq=contrast=1.08:saturation=1.12:brightness=0.02,"
        "colorbalance=rs=0.05:gs=0.01:bs=-0.04,"
        "curves=r='0/0 0.4/0.42 1/1':g='0/0 0.5/0.5 1/0.97',"
        "unsharp=5:5:0.6"
    ),
    "teal_orange": (
        "eq=contrast=1.10:saturation=1.15:brightness=0.01,"
        "colorbalance=rs=0.08:gs=-0.02:bs=-0.06,"
        "curves=b='0/0 0.5/0.42 1/0.9',"
        "unsharp=5:5:0.5"
    ),
    "moody_teal": (
        "eq=contrast=1.12:saturation=0.95:brightness=-0.02,"
        "colorbalance=rs=-0.03:gs=0.02:bs=0.06,"
        "unsharp=3:3:0.4"
    ),
    "clean": (
        "eq=contrast=1.05:saturation=1.05:brightness=0.01,"
        "unsharp=3:3:0.3"
    ),
}

# Movimentos de câmera Ken Burns
MOTIONS = {
    "push_in":      {"z_start": 1.0,  "z_end": 1.25, "x": "center", "y": "center"},
    "pull_out":     {"z_start": 1.25, "z_end": 1.0,  "x": "center", "y": "center"},
    "slow_zoom_in": {"z_start": 1.0,  "z_end": 1.15, "x": "center", "y": "center"},
    "drift":        {"z_start": 1.05, "z_end": 1.10, "x": "left",   "y": "center"},
    "pan_right":    {"z_start": 1.1,  "z_end": 1.1,  "x": "left",   "y": "center"},
    "pan_left":     {"z_start": 1.1,  "z_end": 1.1,  "x": "right",  "y": "center"},
    "breathe":      {"z_start": 1.0,  "z_end": 1.08, "x": "center", "y": "center"},
    "tilt_up":      {"z_start": 1.05, "z_end": 1.10, "x": "center", "y": "bottom"},
    "static":       {"z_start": 1.0,  "z_end": 1.0,  "x": "center", "y": "center"},
}

XFADE_TYPES = [
    "fade", "dissolve", "wipeleft", "wiperight", "fadeblack",
    "fadewhite", "smoothleft", "smoothright", "slideup", "slidedown",
]


# ══════════════════════════════════════════════════════════════════════════════
# Utilidades
# ══════════════════════════════════════════════════════════════════════════════

def log(msg: str) -> None:
    with _log_lock:
        print(msg, flush=True)


def ensure_dir(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p


def file_ok(p: Path, min_bytes: int = 1024) -> bool:
    return p.exists() and p.stat().st_size >= min_bytes


def sanitize(text: str) -> str:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in text.strip())
    while "__" in safe:
        safe = safe.replace("__", "_")
    return safe[:80].strip("_") or "file"


def seconds_to_ass(sec: float) -> str:
    sec = max(0.0, sec)
    h  = int(sec // 3600)
    m  = int((sec % 3600) // 60)
    s  = int(sec % 60)
    cs = int(round((sec - math.floor(sec)) * 100))
    if cs >= 100:
        s += 1; cs = 0
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def ffprobe_duration(p: Path) -> float:
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(p)],
            capture_output=True, text=True, timeout=15
        )
        return float((r.stdout or "0").strip())
    except Exception:
        return 0.0


def run(cmd: list[str], *, check: bool = True,
        quiet: bool = False) -> subprocess.CompletedProcess:
    if not quiet:
        log("$ " + " ".join(str(c) for c in cmd))
    return subprocess.run(
        cmd, check=check, text=True,
        stdout=subprocess.DEVNULL if quiet else None,
        stderr=subprocess.DEVNULL if quiet else None,
    )


# ══════════════════════════════════════════════════════════════════════════════
# Modelos de dados
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class Scene:
    id:             str
    narration:      str
    prompt:         str   = ""
    motion:         str   = "push_in"
    xfade:          str   = "dissolve"
    xfade_duration: float = 0.8
    cinematic_bars: bool  = False
    grain:          float = 0.06
    color_grade:    str   = "warm_film"
    audio_fade_in:  float = 0.05
    audio_fade_out: float = 0.3
    negative_prompt: str  = (
        "blurry, low quality, text, watermark, logo, ugly, distorted, "
        "oversaturated, cartoon, anime, painting"
    )
    # Compatibilidade com sample_vsl_project.json (campos ignorados)
    jitter:         bool  = False
    generate_image: bool  = True
    use_svd:        bool  = False


@dataclass
class Project:
    title:              str
    output_name:        str   = "vsl_forge"
    tts_engine:         str   = "elevenlabs"
    voice:              str   = "hpp4J3VqNfWAUOO0d1Us"
    speech_rate:        float = 1.0
    add_subtitles:      bool  = True
    subtitle_position:  str   = "bottom"
    export_audio_bitrate: str = "192k"
    export_crf:         int   = 18
    crossfade_duration: float = 0.8
    normalize_audio:    bool  = True
    master_music_gain_db: float = -20.0
    ducking_db:         float = -10.0
    color_grade:        str   = "warm_film"
    vignette:           bool  = True
    cinematic_bars:     bool  = False
    scenes:             list  = field(default_factory=list)
    # Campos extras do sample_vsl_project.json (ignorados)
    preset:             str   = "youtube"
    style:              str   = ""
    cinematic_look:     str   = ""
    grain_strength:     float = 0.08
    image_model:        str   = "flux"
    export_video_codec: str   = "libx264"


def load_project(path: Path) -> Project:
    raw = json.loads(path.read_text(encoding="utf-8"))

    scene_fields   = set(Scene.__dataclass_fields__)   # type: ignore
    project_fields = set(Project.__dataclass_fields__) # type: ignore

    scenes = []
    for s in raw.get("scenes", []):
        clean = {k: v for k, v in s.items() if k in scene_fields}
        scenes.append(Scene(**clean))

    proj_raw = {k: v for k, v in raw.items() if k in project_fields}
    proj_raw["scenes"] = scenes
    return Project(**proj_raw)


# ══════════════════════════════════════════════════════════════════════════════
# HuggingFace Image Generation (FLUX.1-dev → FLUX.1-schnell → SDXL)
# ══════════════════════════════════════════════════════════════════════════════

def hf_generate_image(prompt: str, negative_prompt: str,
                       out_path: Path,
                       width: int = 1024, height: int = 576,
                       resume: bool = False) -> bool:
    """
    Gera imagem via HuggingFace Inference API.
    Estratégia PARALELA: dispara os 3 modelos ao mesmo tempo
    e usa o resultado do que responder primeiro com sucesso.
    """
    if resume and file_ok(out_path, min_bytes=50_000):
        log(f"  💾 Cache: {out_path.name}")
        return True

    api_key = os.getenv("HUGGINGFACE_API_KEY") or os.getenv("HF_TOKEN")
    if not api_key:
        log("  ❌ HUGGINGFACE_API_KEY não configurada")
        return False

    headers = {"Authorization": f"Bearer {api_key}"}

    # Respeita IMAGE_MODEL do .env se definido (adiciona ao topo da lista)
    env_model  = os.getenv("IMAGE_MODEL", "").strip()
    model_list = list(dict.fromkeys(
        ([env_model] if env_model else []) + HF_IMAGE_MODELS
    ))

    # Resultado compartilhado entre threads
    result_lock   = threading.Lock()
    result_bytes  = [None]   # [bytes] quando algum modelo retornar
    winner_model  = [""]
    stop_event    = threading.Event()

    def try_model(model: str) -> None:
        is_flux = "FLUX" in model or "flux" in model
        payload = {
            "inputs": prompt,
            "parameters": {
                "negative_prompt":     negative_prompt,
                "num_inference_steps": 28 if "dev" in model else (4 if is_flux else 30),
                "guidance_scale":      3.5 if is_flux else 7.5,
                "width":  width,
                "height": height,
            }
        }
        short = model.split("/")[-1]

        for url_tmpl in [HF_ROUTER_URL, HF_INFERENCE_URL]:
            if stop_event.is_set():
                return
            url = url_tmpl.format(model=model)
            for attempt in range(3):
                if stop_event.is_set():
                    return
                try:
                    resp = requests.post(url, headers=headers,
                                         json=payload, timeout=180)

                    if resp.status_code == 200:
                        ct = resp.headers.get("content-type", "")
                        if "image" in ct or len(resp.content) > 10_000:
                            with result_lock:
                                if result_bytes[0] is None:  # primeiro a chegar
                                    result_bytes[0] = resp.content
                                    winner_model[0]  = short
                                    stop_event.set()
                            return

                    elif resp.status_code == 410:
                        break  # modelo removido desta rota

                    elif resp.status_code == 503:
                        try:
                            wait = resp.json().get("estimated_time", 25)
                        except Exception:
                            wait = 25
                        if not stop_event.is_set():
                            log(f"  ⏳ [{short}] carregando ({int(wait)}s)…")
                            time.sleep(min(float(wait), 40))
                        continue

                    elif resp.status_code == 429:
                        if not stop_event.is_set():
                            time.sleep(30)
                        continue

                    else:
                        break

                except requests.exceptions.Timeout:
                    if not stop_event.is_set():
                        log(f"  ⚠️  [{short}] timeout (tentativa {attempt+1})")
                    time.sleep(8)
                except Exception as e:
                    if not stop_event.is_set():
                        log(f"  ⚠️  [{short}] erro: {e}")
                    break

    # Dispara todos os modelos em paralelo
    model_names = " | ".join(m.split("/")[-1] for m in model_list)
    log(f"  🎨 Gerando imagem em paralelo: [{model_names}]")
    log(f"  📐 Resolução: {width}×{height} — vence o mais rápido ✅")

    with ThreadPoolExecutor(max_workers=len(model_list)) as pool:
        futures = [pool.submit(try_model, m) for m in model_list]
        # Aguarda até ter resultado ou todas as threads finalizarem
        deadline = time.time() + 200
        while time.time() < deadline:
            if stop_event.is_set():
                break
            if all(f.done() for f in futures):
                break
            time.sleep(1)
        stop_event.set()  # garante que threads restantes parem

    if result_bytes[0]:
        out_path.write_bytes(result_bytes[0])
        size_kb = len(result_bytes[0]) // 1024
        log(f"  ✅ [{winner_model[0]}] ganhou! ({size_kb} KB)")
        return True

    log("  ❌ Todos os modelos HF falharam — usando fallback art")
    return False


# ══════════════════════════════════════════════════════════════════════════════
# Fallback Art (Pillow — quando HF não responde)
# ══════════════════════════════════════════════════════════════════════════════

def generate_fallback_art(out_path: Path, prompt: str,
                           width: int = 1920, height: int = 1080,
                           seed: int = 0) -> None:
    if not HAS_PIL:
        run(["ffmpeg", "-y", "-f", "lavfi",
             "-i", f"color=c=0x0a0a12:s={width}x{height}:d=1",
             "-frames:v", "1", str(out_path)], quiet=True)
        return

    rng = random.Random(seed)

    # Paletas cinematográficas por seed
    palettes = [
        [(10, 10, 20),  (40, 25, 60),  (80, 45, 30)],
        [(5,  15, 10),  (20, 50, 35),  (60, 90, 50)],
        [(20, 10, 5),   (70, 40, 15),  (120, 80, 30)],
        [(5,  5,  20),  (15, 15, 60),  (30, 25, 100)],
    ]
    pal = palettes[seed % len(palettes)]

    img  = Image.new("RGB", (width, height), pal[0])
    draw = ImageDraw.Draw(img)

    # Gradiente suave
    for y in range(height):
        t  = y / max(1, height - 1)
        r  = int(pal[0][0] + (pal[2][0] - pal[0][0]) * t)
        g  = int(pal[0][1] + (pal[2][1] - pal[0][1]) * t)
        b  = int(pal[0][2] + (pal[2][2] - pal[0][2]) * t)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Partículas de luz
    for _ in range(rng.randint(30, 80)):
        cx = rng.randint(0, width)
        cy = rng.randint(0, height)
        r  = rng.randint(2, 12)
        alpha = rng.randint(40, 160)
        color = (
            rng.randint(180, 255),
            rng.randint(150, 220),
            rng.randint(50, 120),
        )
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=color)

    # Vinheta
    vignette = Image.new("L", (width, height), 255)
    vd = ImageDraw.Draw(vignette)
    steps = 80
    for i in range(steps):
        t = i / steps
        margin = int(t * min(width, height) * 0.45)
        alpha  = int(255 * (1 - t) * 0.7)
        vd.rectangle([margin, margin, width-margin, height-margin],
                     outline=alpha, width=3)
    img_v = img.copy()
    img_v.putalpha(vignette)
    img.paste(img_v, mask=vignette)

    # Texto do prompt (discreto)
    font = ImageFont.load_default()
    wrapped = _tw.fill(prompt[:100], width=52)
    bm = 80
    draw.rounded_rectangle(
        [bm, height//2 - 100, width-bm, height//2 + 100],
        radius=18, fill=(0, 0, 0), outline=(80, 60, 20), width=1
    )
    draw.multiline_text(
        (bm + 30, height//2 - 80), wrapped,
        fill=(200, 180, 120), font=font, spacing=10
    )

    img = img.filter(ImageFilter.GaussianBlur(radius=0.5))
    img.save(out_path, quality=95)


# ══════════════════════════════════════════════════════════════════════════════
# Ken Burns — Imagem → Vídeo Cinematográfico
# ══════════════════════════════════════════════════════════════════════════════

def build_ken_burns_filter(motion: str, duration: float,
                             width: int, height: int,
                             fps: int = 24,
                             grain: float = 0.06,
                             color_grade: str = "warm_film",
                             cinematic_bars: bool = False,
                             vignette: bool = True) -> str:
    """
    Monta o filtro FFmpeg completo para Ken Burns + color grade.
    """
    cfg    = MOTIONS.get(motion, MOTIONS["push_in"])
    frames = int(duration * fps)
    frames = max(frames, 1)

    z_s = cfg["z_start"]
    z_e = cfg["z_end"]

    # Zoom expression com easing suave (sine)
    zoom_expr = (
        f"if(eq(on,1),{z_s},"
        f"min({z_s}+({z_e}-{z_s})*sin(PI*on/{frames}/2),{max(z_s,z_e)+0.01}))"
    )

    # X position
    x_cfg = cfg["x"]
    if x_cfg == "center":
        x_expr = "iw/2-(iw/zoom/2)"
    elif x_cfg == "left":
        x_expr = f"iw/2-(iw/zoom/2)+on*{(z_s*width*0.04):.1f}/{frames}"
    elif x_cfg == "right":
        x_expr = f"iw/2-(iw/zoom/2)-on*{(z_s*width*0.04):.1f}/{frames}"
    else:
        x_expr = "iw/2-(iw/zoom/2)"

    # Y position
    y_cfg = cfg["y"]
    if y_cfg == "center":
        y_expr = "ih/2-(ih/zoom/2)"
    elif y_cfg == "bottom":
        y_expr = f"ih/2-(ih/zoom/2)-on*{(z_s*height*0.02):.1f}/{frames}"
    else:
        y_expr = "ih/2-(ih/zoom/2)"

    # Escala de entrada maior para o zoom
    scale_factor = max(z_e, z_s) + 0.05
    sw = int(width * scale_factor)
    sh = int(height * scale_factor)

    # Garantir dimensões pares
    sw += sw % 2
    sh += sh % 2

    # Zoompan
    zoompan = (
        f"scale={sw}:{sh}:flags=lanczos,"
        f"zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}':"
        f"d=1:s={width}x{height}:fps={fps}"
    )

    # Color grade
    grade = COLOR_GRADES.get(color_grade, COLOR_GRADES["warm_film"])

    # Grain cinematográfico
    grain_filter = ""
    if grain > 0:
        noise_val = int(grain * 40)
        grain_filter = f",noise=alls={noise_val}:allf=t+u"

    # Vinheta
    vignette_filter = ",vignette=PI/5" if vignette else ""

    # Barras cinemáticas 2.35:1
    bars_filter = ""
    if cinematic_bars:
        bar_h = int((height - width / 2.35) / 2)
        if bar_h > 0:
            bars_filter = (
                f",drawbox=x=0:y=0:w={width}:h={bar_h}:color=black:t=fill"
                f",drawbox=x=0:y={height-bar_h}:w={width}:h={bar_h}:color=black:t=fill"
            )

    return (
        f"{zoompan},"
        f"{grade}"
        f"{grain_filter}"
        f"{vignette_filter}"
        f"{bars_filter}"
        f",format=yuv420p"
    )


def render_scene_video(image_path: Path, audio_path: Path,
                        out_path: Path,
                        motion: str, duration: float,
                        width: int, height: int, fps: int,
                        grain: float, color_grade: str,
                        cinematic_bars: bool, vignette: bool,
                        audio_fade_in: float, audio_fade_out: float,
                        draft: bool = False) -> None:
    """Combina imagem + Ken Burns + áudio em MP4."""
    vf = build_ken_burns_filter(
        motion, duration, width, height, fps,
        grain, color_grade, cinematic_bars, vignette
    )

    afilters = []
    if audio_fade_in > 0:
        afilters.append(f"afade=t=in:st=0:d={audio_fade_in:.3f}")
    if audio_fade_out > 0 and duration > audio_fade_out:
        fade_st = max(0.0, duration - audio_fade_out)
        afilters.append(f"afade=t=out:st={fade_st:.3f}:d={audio_fade_out:.3f}")

    preset = "ultrafast" if draft else "slow"
    crf    = "28"        if draft else "18"

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-framerate", str(fps), "-i", str(image_path),
        "-i", str(audio_path),
        "-vf", vf,
        "-t", f"{duration:.3f}",
        "-shortest",
        "-c:v", "libx264", "-preset", preset, "-crf", crf,
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
    ]
    if afilters:
        cmd += ["-af", ",".join(afilters)]
    cmd.append(str(out_path))
    run(cmd)


# ══════════════════════════════════════════════════════════════════════════════
# TTS — ElevenLabs → Silêncio
# ══════════════════════════════════════════════════════════════════════════════

def synth_silence(out_path: Path, duration: float = 3.0, sr: int = 24000) -> None:
    with wave.open(str(out_path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"\x00\x00" * int(duration * sr))


def tts_elevenlabs(text: str, out_path: Path, voice: str) -> bool:
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        return False
    try:
        from elevenlabs.client import ElevenLabs
        client = ElevenLabs(api_key=api_key)
        for model in ["eleven_multilingual_v2", "eleven_monolingual_v1"]:
            try:
                audio = client.text_to_speech.convert(
                    text=text, voice_id=voice, model_id=model,
                    output_format="mp3_44100_128",
                )
                if hasattr(audio, "__iter__") and not isinstance(audio, (bytes, bytearray)):
                    audio = b"".join(audio)
                out_path.write_bytes(audio)
                if file_ok(out_path):
                    log(f"  ✅ ElevenLabs ({model})")
                    return True
            except Exception as e:
                log(f"  ⚠️  ElevenLabs {model}: {e}")
    except Exception as e:
        log(f"  ⚠️  ElevenLabs import: {e}")
    return False


def normalize_audio(in_p: Path, out_p: Path) -> None:
    """Normaliza volume E força sample rate 44100Hz para evitar problemas."""
    try:
        run(["ffmpeg", "-y", "-i", str(in_p),
             "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
             "-ar", "44100",   # força sample rate padrão
             "-ac", "1",       # mono
             str(out_p)], quiet=True)
    except Exception:
        # Ao menos faz o resample
        try:
            run(["ffmpeg", "-y", "-i", str(in_p),
                 "-ar", "44100", "-ac", "1", str(out_p)], quiet=True)
        except Exception:
            shutil.copy2(in_p, out_p)


def render_tts(text: str, out_path: Path, engine: str, voice: str) -> None:
    ok = False
    if engine == "elevenlabs":
        ok = tts_elevenlabs(text, out_path, voice)
    if not ok:
        dur = max(2.5, len(text.split()) / 2.8)
        log(f"  🔇 Silêncio fallback ({dur:.1f}s) — configure ELEVENLABS_API_KEY")
        synth_silence(out_path, dur)


# ══════════════════════════════════════════════════════════════════════════════
# Assembly — XFade + Legendas + Música
# ══════════════════════════════════════════════════════════════════════════════

def concat_xfade(scene_paths: list[Path], durations: list[float],
                  xfades: list[str], xfade_dur: float,
                  out_path: Path, crf: int = 18) -> None:
    n   = len(scene_paths)
    cmd = ["ffmpeg", "-y"]
    for p in scene_paths:
        cmd += ["-i", str(p)]

    fc   = []
    lv   = "[0:v]"
    la   = "[0:a]"
    off  = 0.0

    for i in range(1, n):
        off  += durations[i-1] - xfade_dur
        off   = max(0.0, off)
        xt    = xfades[i-1] if i-1 < len(xfades) else "dissolve"
        if xt not in XFADE_TYPES:
            xt = "dissolve"
        vo = f"[v{i}]"
        ao = f"[a{i}]"
        fc.append(
            f"{lv}[{i}:v]xfade=transition={xt}:duration={xfade_dur:.3f}:offset={off:.3f}{vo}"
        )
        fc.append(f"{la}[{i}:a]acrossfade=d={xfade_dur:.3f}{ao}")
        lv = vo
        la = ao

    fc.append(f"{lv}format=yuv420p[vout]")
    cmd += ["-filter_complex", ";".join(fc),
            "-map", "[vout]", "-map", la,
            "-c:v", "libx264", "-crf", str(crf),
            "-c:a", "aac", "-pix_fmt", "yuv420p",
            str(out_path)]
    run(cmd)


def make_ass(subs: list[dict], out_path: Path,
             width: int, height: int, position: str = "bottom") -> None:
    align    = {"bottom": 2, "top": 8, "middle": 5}.get(position, 2)
    margin_v = 50  # margem vertical fixa
    margin_h = 100  # margem horizontal fixa
    fs       = 24  # fonte fixa 24px — funciona em qualquer resolução
    style   = (
        f"Style: Default,Arial,{fs},"
        "&H00FFFFFF,&H0000FFFF,&H00000000,&HCC000000,"
        f"1,0,0,0,100,100,0,0,1,2.0,1.2,{align},{margin_h},{margin_h},{margin_v},1\n"
    )
    header = (
        "[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {width}\nPlayResY: {height}\n"
        "WrapStyle: 0\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\nFormat: Name,Fontname,Fontsize,"
        "PrimaryColour,SecondaryColour,OutlineColour,BackColour,"
        "Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,"
        "BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n"
        + style + "\n[Events]\n"
        "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n"
    )
    out_lines = []
    max_chars = 55  # chars por linha fixo
    for item in subs:
        txt = item["text"].replace("\n", r"\N").replace("{","(").replace("}",")")
        if len(txt) > max_chars:
            words = txt.split()
            result_lines = []
            current = ""
            for word in words:
                test = (current + " " + word).strip()
                if len(test) <= max_chars:
                    current = test
                else:
                    if current:
                        result_lines.append(current)
                    current = word
            if current:
                result_lines.append(current)
            txt = r"\N".join(result_lines)
        end_time = max(item["start"] + 0.1, item["end"] - 0.05)
        out_lines.append(
            f"Dialogue: 0,{seconds_to_ass(item['start'])},"            f"{seconds_to_ass(end_time)},Default,,0,0,0,,{txt}"
        )
    out_path.write_text(header + "\n".join(out_lines), encoding="utf-8")


def apply_subtitles(inp: Path, ass: Path, out: Path,
                     crf: int, bitrate: str) -> None:
    run(["ffmpeg", "-y", "-i", str(inp),
         "-vf", f"ass={ass.as_posix()}",
         "-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
         "-c:a", "aac", "-b:a", bitrate, str(out)], quiet=True)


def mix_music(inp: Path, music: Path, out: Path,
               gain: float, duck: float, crf: int, bitrate: str) -> None:
    total = ffprobe_duration(inp)
    run([
        "ffmpeg", "-y",
        "-i", str(inp),
        "-stream_loop", "-1", "-i", str(music),
        "-filter_complex",
        (f"[1:a]volume={gain}dB,atrim=0:{total:.3f},"
         f"afade=t=out:st={max(0, total-2.5):.3f}:d=2.5[bg];"
         f"[0:a][bg]sidechaincompress="
         f"threshold=0.04:ratio=6:attack=15:release=300:"
         f"makeup={abs(duck)/2}[out]"),
        "-map", "0:v:0", "-map", "[out]",
        "-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
        "-c:a", "aac", "-b:a", bitrate, "-shortest", str(out)
    ])


# ══════════════════════════════════════════════════════════════════════════════
# Main Pipeline
# ══════════════════════════════════════════════════════════════════════════════

def main() -> int:
    t0 = time.time()

    ap = argparse.ArgumentParser(
        description="VSL Forge v2 — Pipeline Cinematográfico com HuggingFace"
    )
    ap.add_argument("--config",   required=True, help="JSON do projeto")
    ap.add_argument("--draft",    action="store_true",
                    help="Preview rápido (sem HF, sem normalize)")
    ap.add_argument("--resume",   action="store_true",
                    help="Continua de onde parou")
    ap.add_argument("--workers",  type=int, default=1,
                    help="Workers paralelos para TTS")
    ap.add_argument("--no-xfade", action="store_true")
    ap.add_argument("--scene",    type=str, default=None,
                    help="Gera apenas a cena com este ID")
    args = ap.parse_args()

    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        log("❌ FFmpeg não encontrado. Instale em ffmpeg.org")
        return 2

    project = load_project(Path(args.config))

    if args.scene:
        project.scenes = [s for s in project.scenes if s.id == args.scene]
        if not project.scenes:
            log(f"❌ Cena '{args.scene}' não encontrada")
            return 1

    # Resolução
    width, height, fps = 1920, 1080, 24
    if args.draft:
        width, height, fps = 854, 480, 24  # 480p draft — Ken Burns ~4x mais rápido

    hf_ok = bool(os.getenv("HUGGINGFACE_API_KEY") or os.getenv("HF_TOKEN"))
    el_ok = bool(os.getenv("ELEVENLABS_API_KEY"))

    log(f"\n{'═'*64}")
    log(f"  🎬 VSL FORGE v2 — {project.title}")
    log(f"  Resolução  : {width}×{height} @ {fps}fps")
    log(f"  Draft      : {'SIM ⚡' if args.draft else 'NÃO (qualidade final)'}")
    log(f"  Cenas      : {len(project.scenes)}")
    log(f"  HF Image   : {'✅ FLUX.1-dev' if hf_ok else '⚠️  sem key (fallback art)'}")
    log(f"  ElevenLabs : {'✅' if el_ok else '⚠️  sem key (silêncio)'}")
    log(f"  Color grade: {project.color_grade}")
    log(f"{'═'*64}\n")

    # Pastas
    base    = ensure_dir(Path("vsl_build") / sanitize(project.output_name))
    aud_dir = ensure_dir(base / "audio")
    img_dir = ensure_dir(base / "images")
    sc_dir  = ensure_dir(base / "scenes")
    tmp_dir = ensure_dir(base / "temp")
    fin_dir = ensure_dir(base / "final")

    # ── FASE 1: TTS ───────────────────────────────────────────────────────────
    log("🎙️  Fase 1/4 — Narração\n")

    def do_tts(idx_scene):
        idx, scene = idx_scene
        sid = sanitize(f"{idx:02d}_{scene.id}")
        raw = aud_dir / f"{sid}_raw.wav"
        out = aud_dir / f"{sid}.wav"
        if args.resume and file_ok(out):
            log(f"  [{idx}] ♻️  {sid} (cache)")
            return idx, sid, out
        log(f"  [{idx}/{len(project.scenes)}] 🎙️  {sid}")
        render_tts(scene.narration, raw, project.tts_engine, project.voice)
        if project.normalize_audio and not args.draft:
            normalize_audio(raw, out)
        else:
            shutil.copy2(raw, out)
        return idx, sid, out

    tts: dict = {}
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futs = {pool.submit(do_tts, (i, s)): i
                for i, s in enumerate(project.scenes, 1)}
        for f in as_completed(futs):
            idx, sid, ao = f.result()
            tts[idx] = (sid, ao)
            log(f"  ✅ TTS {idx}/{len(project.scenes)}: {sid}")

    # ── FASE 2: Imagens + Ken Burns ───────────────────────────────────────────
    log(f"\n🖼️  Fase 2/4 — Imagens + Ken Burns\n")

    subs:        list = []
    scene_paths: list = []
    durations:   list = []
    xfades:      list = []
    elapsed = 0.0

    for idx, scene in enumerate(project.scenes, 1):
        sid, audio_path = tts[idx]
        img_path   = img_dir  / f"{sid}.png"
        scene_path = sc_dir   / f"{sid}.mp4"

        log(f"\n🎬 [{idx}/{len(project.scenes)}] {scene.id}")

        audio_dur = ffprobe_duration(audio_path) or 3.0
        scene_dur = max(audio_dur + 0.8, 4.0)  # 0.8s de respiro entre falas

        if args.resume and file_ok(scene_path, min_bytes=100_000):
            log(f"  ♻️  Cena já renderizada — skip")
            real_dur = ffprobe_duration(scene_path) or scene_dur
            scene_paths.append(scene_path)
            durations.append(real_dur)
            xfades.append(scene.xfade)
            subs.append({"start": elapsed, "end": elapsed+real_dur,
                         "text": scene.narration})
            elapsed += real_dur
            continue

        # Gerar imagem
        img_ok = False
        if not args.draft and hf_ok:
            # Prompt enriquecido para VSL
            hf_prompt = (
                f"{scene.prompt}, "
                "cinematic photography, 35mm film, shallow depth of field, "
                "professional lighting, photorealistic, ultra detailed, "
                "masterpiece quality, 8k resolution"
            )
            img_ok = hf_generate_image(
                prompt          = hf_prompt,
                negative_prompt = scene.negative_prompt,
                out_path        = img_path,
                width           = 1280,
                height          = 720,
                resume          = args.resume,
            )

        if not img_ok:
            generate_fallback_art(img_path,
                                   scene.prompt or scene.narration,
                                   width, height, seed=idx)

        # Determinar color grade e outros parâmetros da cena
        cg   = getattr(scene, "color_grade", project.color_grade) or project.color_grade
        bars = scene.cinematic_bars or project.cinematic_bars
        mot  = getattr(scene, "motion", "push_in") or "push_in"
        gr   = getattr(scene, "grain", project.grain_strength) or 0.06

        # Render Ken Burns + áudio
        render_scene_video(
            image_path     = img_path,
            audio_path     = audio_path,
            out_path       = scene_path,
            motion         = mot,
            duration       = scene_dur,
            width          = width,
            height         = height,
            fps            = fps,
            grain          = gr,
            color_grade    = cg,
            cinematic_bars = bars,
            vignette       = project.vignette,
            audio_fade_in  = scene.audio_fade_in,
            audio_fade_out = scene.audio_fade_out,
            draft          = args.draft,
        )

        # Verificação
        if not file_ok(scene_path, min_bytes=10_000):
            log(f"  ⚠️  Fallback de emergência")
            fb = tmp_dir / f"{sid}_em.png"
            generate_fallback_art(fb, f"ERRO: {scene.id}", width, height, idx)
            run(["ffmpeg", "-y", "-loop", "1", "-i", str(fb),
                 "-i", str(audio_path),
                 "-vf", f"scale={width}:{height},format=yuv420p",
                 "-t", f"{scene_dur:.3f}", "-shortest",
                 "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
                 "-c:a", "aac", str(scene_path)], quiet=True)

        real_dur = ffprobe_duration(scene_path) or scene_dur
        scene_paths.append(scene_path)
        durations.append(real_dur)
        xfades.append(scene.xfade)
        subs.append({"start": elapsed, "end": elapsed+real_dur,
                     "text": scene.narration})
        elapsed += real_dur
        log(f"  ✅ {scene_path.name} ({real_dur:.1f}s)")

    # ── FASE 3: Assembly ──────────────────────────────────────────────────────
    log(f"\n🔗  Fase 3/4 — Assembly ({len(scene_paths)} cenas)\n")
    assembly = tmp_dir / "assembly.mp4"
    use_xfade = (
        not args.no_xfade
        and len(scene_paths) > 1
        and project.crossfade_duration > 0
    )

    if use_xfade:
        log(f"  XFade ({project.crossfade_duration}s) — {len(scene_paths)} cenas")
        concat_xfade(scene_paths, durations, xfades,
                     project.crossfade_duration, assembly, project.export_crf)
    else:
        lst = tmp_dir / "concat.txt"
        lst.write_text(
            "\n".join(f"file '{p.resolve().as_posix()}'" for p in scene_paths),
            encoding="utf-8"
        )
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0",
             "-i", str(lst), "-c", "copy", str(assembly)])

    current = assembly

    if project.add_subtitles:
        log("  📝 Aplicando legendas…")
        ass_p  = tmp_dir / "subs.ass"
        subbed = tmp_dir / "assembly_sub.mp4"
        make_ass(subs, ass_p, width, height, project.subtitle_position)
        apply_subtitles(current, ass_p, subbed,
                        project.export_crf, project.export_audio_bitrate)
        current = subbed

    soundtrack = os.getenv("VSL_SOUNDTRACK")
    if not soundtrack:
        soundtrack = getattr(project, "_soundtrack", None)
    if soundtrack and Path(soundtrack).exists():
        mixed = tmp_dir / "assembly_mixed.mp4"
        log(f"  🎵 Mixando trilha…")
        mix_music(current, Path(soundtrack), mixed,
                  project.master_music_gain_db, project.ducking_db,
                  project.export_crf, project.export_audio_bitrate)
        current = mixed

    # ── FASE 4: Export ────────────────────────────────────────────────────────
    log(f"\n🏁  Fase 4/4 — Export final\n")
    suffix    = "_draft" if args.draft else ""
    final     = fin_dir / f"{sanitize(project.output_name)}{suffix}.mp4"
    shutil.copy2(current, final)

    dur_s  = ffprobe_duration(final)
    bld_s  = time.time() - t0
    sz_mb  = final.stat().st_size / 1024**2

    manifest = {
        "title":      project.title,
        "version":    "forge-v2",
        "output":     str(final),
        "size_mb":    round(sz_mb, 2),
        "duration_s": round(dur_s, 2),
        "scenes":     len(project.scenes),
        "hf_images":  hf_ok and not args.draft,
        "elevenlabs": el_ok,
        "draft":      args.draft,
        "build_min":  round(bld_s / 60, 1),
    }
    (fin_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    log(f"\n{'═'*64}")
    log(f"  ✅ VSL FINALIZADA!")
    log(f"  📁 {final}")
    log(f"  💾 {sz_mb:.1f} MB  |  ⏱️  {dur_s:.1f}s  |  🕐 {bld_s/60:.1f} min")
    log(f"{'═'*64}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
