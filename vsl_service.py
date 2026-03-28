#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
vsl_service.py — VSL Forge API Service
FastAPI wrapper do VSL Forge v2 para integração com MECProAI.

SETUP NO VPS:
  pip install fastapi uvicorn python-multipart requests aiofiles
  pip install elevenlabs huggingface_hub Pillow tqdm
  apt-get install -y ffmpeg

RODAR:
  uvicorn vsl_service:app --host 0.0.0.0 --port 8000 --workers 2

VARIÁVEIS DE AMBIENTE:
  ELEVENLABS_API_KEY=sk_xxx
  HUGGINGFACE_API_KEY=hf_xxx
  VSL_SECRET_KEY=chave-secreta-para-autenticar-mecproai
  MECPRO_WEBHOOK_URL=https://mecpro-ai.onrender.com/api/vsl-webhook
  OUTPUT_DIR=/data/vsl_outputs
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

import requests
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

SECRET_KEY   = os.getenv("VSL_SECRET_KEY", "mecpro-vsl-secret")
OUTPUT_DIR   = Path(os.getenv("OUTPUT_DIR", "/data/vsl_outputs"))
WEBHOOK_URL  = os.getenv("MECPRO_WEBHOOK_URL", "")
VSL_SCRIPT   = Path(__file__).parent / "vsl_forge_v2.py"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Jobs em memória (em produção usar Redis)
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()

# ─────────────────────────────────────────────────────────────────────────────
# PRESETS DE FORMATO POR PLATAFORMA
# ─────────────────────────────────────────────────────────────────────────────

FORMAT_PRESETS = {
    # 9:16 vertical — Reels, TikTok, Stories
    "reels_9_16": {
        "width": 1080, "height": 1920, "fps": 30,
        "label": "Reels/TikTok (9:16)",
        "cinematic_bars": False,
        "color_grade": "warm_film",
        "max_duration_per_scene": 30,
        "description": "Ideal para Instagram Reels, TikTok e Facebook Reels",
    },
    "stories_9_16": {
        "width": 1080, "height": 1920, "fps": 30,
        "label": "Stories (9:16)",
        "cinematic_bars": False,
        "color_grade": "clean",
        "max_duration_per_scene": 15,
        "description": "Instagram Stories e Facebook Stories",
    },
    # 4:5 vertical — Feed premium
    "feed_4_5": {
        "width": 1080, "height": 1350, "fps": 30,
        "label": "Feed Premium (4:5)",
        "cinematic_bars": False,
        "color_grade": "warm_film",
        "max_duration_per_scene": 60,
        "description": "Instagram Feed e Facebook Feed — maior área no mobile",
    },
    # 16:9 horizontal — YouTube, Google
    "youtube_16_9": {
        "width": 1920, "height": 1080, "fps": 24,
        "label": "YouTube (16:9)",
        "cinematic_bars": True,
        "color_grade": "teal_orange",
        "max_duration_per_scene": 180,
        "description": "YouTube Ads e Google Display",
    },
    # 1:1 quadrado — Feed universal
    "feed_1_1": {
        "width": 1080, "height": 1080, "fps": 30,
        "label": "Feed Quadrado (1:1)",
        "cinematic_bars": False,
        "color_grade": "warm_film",
        "max_duration_per_scene": 60,
        "description": "Feed universal — funciona em todas as plataformas",
    },
    # Aula Academy
    "academy_16_9": {
        "width": 1920, "height": 1080, "fps": 30,
        "label": "Aula Academy (16:9)",
        "cinematic_bars": False,
        "color_grade": "clean",
        "max_duration_per_scene": 300,
        "description": "Aulas e conteúdos educacionais MECPro Academy",
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# MODELOS PYDANTIC
# ─────────────────────────────────────────────────────────────────────────────

class SceneInput(BaseModel):
    id:              str
    narration:       str
    prompt:          str   = ""
    motion:          str   = "push_in"
    xfade:           str   = "dissolve"
    xfade_duration:  float = 0.8
    cinematic_bars:  bool  = False
    grain:           float = 0.06
    color_grade:     str   = "warm_film"
    audio_fade_in:   float = 0.05
    audio_fade_out:  float = 0.3
    negative_prompt: str   = "blurry, low quality, text, watermark, cartoon"

class VideoGenerationRequest(BaseModel):
    # Identificação
    job_id:          Optional[str] = None
    campaign_id:     Optional[int] = None
    user_id:         Optional[int] = None
    project_name:    str           = "mecpro_video"

    # Formato
    format:          str = "reels_9_16"  # chave do FORMAT_PRESETS

    # Conteúdo
    title:           str
    scenes:          list[SceneInput]

    # Configurações de áudio
    voice:           str   = "hpp4J3VqNfWAUOO0d1Us"
    tts_engine:      str   = "elevenlabs"
    speech_rate:     float = 1.0
    add_subtitles:   bool  = True
    subtitle_position: str = "bottom"
    normalize_audio: bool  = True

    # Configurações de vídeo
    color_grade:     str   = "warm_film"
    vignette:        bool  = True
    crossfade_duration: float = 0.8
    master_music_gain_db: float = -20.0

    # Modo
    draft:           bool  = False
    webhook_url:     Optional[str] = None  # override do webhook padrão

class JobStatus(BaseModel):
    job_id:      str
    status:      str   # queued, processing, done, error
    progress:    int   = 0
    message:     str   = ""
    video_url:   Optional[str] = None
    duration_s:  Optional[float] = None
    size_mb:     Optional[float] = None
    format:      Optional[str] = None
    created_at:  float = 0.0
    finished_at: Optional[float] = None
    error:       Optional[str] = None

# ─────────────────────────────────────────────────────────────────────────────
# APP
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="VSL Forge Service — MECProAI",
    description="Serviço de geração de vídeos cinematográficos para o MECProAI",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────────────────────────────────────

def verify_token(authorization: str = Header(...)) -> bool:
    token = authorization.replace("Bearer ", "").strip()
    if token != SECRET_KEY:
        raise HTTPException(status_code=401, detail="Token inválido")
    return True

# ─────────────────────────────────────────────────────────────────────────────
# GERAÇÃO DE JSON PARA O VSL FORGE
# ─────────────────────────────────────────────────────────────────────────────

def build_vsl_config(req: VideoGenerationRequest, job_dir: Path) -> dict:
    preset = FORMAT_PRESETS.get(req.format, FORMAT_PRESETS["reels_9_16"])

    scenes = []
    for scene in req.scenes:
        # Adapta prompt para o formato vertical se necessário
        is_vertical = preset["height"] > preset["width"]
        prompt = scene.prompt
        if is_vertical and prompt:
            # Reforça composição vertical no prompt
            prompt = prompt + ", vertical composition, portrait orientation, 9:16 format"

        scenes.append({
            "id":             scene.id,
            "narration":      scene.narration,
            "prompt":         prompt,
            "negative_prompt": scene.negative_prompt,
            "motion":         scene.motion,
            "xfade":          scene.xfade,
            "xfade_duration": scene.xfade_duration,
            "cinematic_bars": scene.cinematic_bars or preset.get("cinematic_bars", False),
            "grain":          scene.grain,
            "color_grade":    scene.color_grade or preset.get("color_grade", "warm_film"),
            "audio_fade_in":  scene.audio_fade_in,
            "audio_fade_out": scene.audio_fade_out,
            "generate_image": True,
            "use_svd":        False,
        })

    return {
        "title":               req.title,
        "output_name":         f"{req.project_name}_{req.format}",
        "tts_engine":          req.tts_engine,
        "voice":               req.voice,
        "speech_rate":         req.speech_rate,
        "add_subtitles":       req.add_subtitles,
        "subtitle_position":   req.subtitle_position,
        "export_audio_bitrate": "192k",
        "export_crf":          18 if not req.draft else 28,
        "crossfade_duration":  req.crossfade_duration,
        "normalize_audio":     req.normalize_audio,
        "master_music_gain_db": req.master_music_gain_db,
        "ducking_db":          -10,
        "color_grade":         req.color_grade or preset.get("color_grade", "warm_film"),
        "vignette":            req.vignette,
        "cinematic_bars":      preset.get("cinematic_bars", False),
        "scenes":              scenes,
        # Metadados do formato (usados pelo vsl_forge_v2 aprimorado)
        "_format":             req.format,
        "_width":              preset["width"],
        "_height":             preset["height"],
        "_fps":                preset["fps"],
    }

# ─────────────────────────────────────────────────────────────────────────────
# PROCESSAMENTO EM BACKGROUND
# ─────────────────────────────────────────────────────────────────────────────

def update_job(job_id: str, **kwargs):
    with JOBS_LOCK:
        if job_id in JOBS:
            JOBS[job_id].update(kwargs)

def send_webhook(job_id: str, webhook_url: str):
    """Notifica o MECProAI quando o vídeo estiver pronto."""
    if not webhook_url:
        return
    try:
        with JOBS_LOCK:
            job = JOBS.get(job_id, {}).copy()
        requests.post(webhook_url, json={
            "job_id":     job_id,
            "status":     job.get("status"),
            "video_url":  job.get("video_url"),
            "duration_s": job.get("duration_s"),
            "size_mb":    job.get("size_mb"),
            "format":     job.get("format"),
            "campaign_id": job.get("campaign_id"),
            "user_id":    job.get("user_id"),
        }, timeout=10)
    except Exception as e:
        print(f"[webhook] Erro ao notificar: {e}")

def process_video(job_id: str, req: VideoGenerationRequest):
    """Processa o vídeo em background."""
    job_dir  = OUTPUT_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    webhook  = req.webhook_url or WEBHOOK_URL
    preset   = FORMAT_PRESETS.get(req.format, FORMAT_PRESETS["reels_9_16"])

    try:
        update_job(job_id, status="processing", progress=5, message="Preparando configuração...")

        # Salva o config JSON
        config = build_vsl_config(req, job_dir)
        config_path = job_dir / "project.json"
        config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")

        update_job(job_id, progress=10, message="Iniciando geração de vídeo...")

        # Monta o comando do VSL Forge v2
        cmd = [
            sys.executable, str(VSL_SCRIPT),
            "--config", str(config_path),
        ]
        if req.draft:
            cmd.append("--draft")

        # Variáveis de ambiente com as dimensões corretas
        env = os.environ.copy()
        env["VSL_OUTPUT_DIR"] = str(job_dir)
        env["VSL_WIDTH"]  = str(preset["width"])
        env["VSL_HEIGHT"] = str(preset["height"])
        env["VSL_FPS"]    = str(preset["fps"])

        update_job(job_id, progress=15, message="Gerando narração (ElevenLabs)...")

        # Executa o pipeline
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
            cwd=str(job_dir),
        )

        log_lines = []
        phase_progress = {
            "Fase 1": 20,   # TTS
            "Fase 2": 40,   # Imagens
            "Fase 3": 75,   # Assembly
            "Fase 4": 90,   # Export
        }

        for line in proc.stdout:
            line = line.rstrip()
            log_lines.append(line)
            print(f"[{job_id[:8]}] {line}")

            # Atualiza progresso baseado na fase
            for phase, progress in phase_progress.items():
                if phase in line:
                    phase_msgs = {
                        "Fase 1": "Gerando narração (ElevenLabs)...",
                        "Fase 2": "Gerando imagens (FLUX/SDXL)...",
                        "Fase 3": "Montando vídeo (FFmpeg)...",
                        "Fase 4": "Exportando vídeo final...",
                    }
                    update_job(job_id,
                               progress=progress,
                               message=phase_msgs.get(phase, line))
                    break

        proc.wait()

        if proc.returncode != 0:
            error_msg = "\n".join(log_lines[-20:])
            raise RuntimeError(f"VSL Forge falhou (código {proc.returncode}):\n{error_msg}")

        # Localiza o vídeo gerado
        output_name = f"{req.project_name}_{req.format}"
        final_dir   = job_dir / "vsl_build" / output_name.replace("-", "_") / "final"

        # Fallback: busca qualquer mp4 no diretório
        mp4_files = list(job_dir.rglob("*.mp4"))
        if not mp4_files:
            raise RuntimeError("Nenhum arquivo MP4 encontrado após processamento")

        # Pega o maior arquivo (provável final)
        final_video = max(mp4_files, key=lambda p: p.stat().st_size)

        # Move para diretório de saída
        output_path = OUTPUT_DIR / job_id / f"video_{req.format}.mp4"
        shutil.copy2(final_video, output_path)

        # Extrai metadados
        try:
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration,size",
                 "-of", "json", str(output_path)],
                capture_output=True, text=True, timeout=15
            )
            probe_data = json.loads(probe.stdout).get("format", {})
            duration_s = float(probe_data.get("duration", 0))
            size_mb    = int(probe_data.get("size", 0)) / 1024**2
        except Exception:
            duration_s = 0.0
            size_mb    = output_path.stat().st_size / 1024**2

        video_url = f"/download/{job_id}/video_{req.format}.mp4"

        update_job(job_id,
                   status="done",
                   progress=100,
                   message="✅ Vídeo gerado com sucesso!",
                   video_url=video_url,
                   duration_s=round(duration_s, 1),
                   size_mb=round(size_mb, 2),
                   finished_at=time.time())

        print(f"[{job_id[:8]}] ✅ Concluído: {output_path} ({size_mb:.1f}MB, {duration_s:.1f}s)")

    except Exception as e:
        error_msg = str(e)
        print(f"[{job_id[:8]}] ❌ Erro: {error_msg}")
        update_job(job_id,
                   status="error",
                   progress=0,
                   message=f"Erro: {error_msg[:200]}",
                   error=error_msg,
                   finished_at=time.time())
    finally:
        send_webhook(job_id, webhook)

# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Verifica se o serviço está rodando."""
    ffmpeg_ok = bool(shutil.which("ffmpeg"))
    hf_ok     = bool(os.getenv("HUGGINGFACE_API_KEY"))
    el_ok     = bool(os.getenv("ELEVENLABS_API_KEY"))
    return {
        "status":      "ok",
        "ffmpeg":      ffmpeg_ok,
        "huggingface": hf_ok,
        "elevenlabs":  el_ok,
        "jobs_active": sum(1 for j in JOBS.values() if j.get("status") == "processing"),
        "formats":     list(FORMAT_PRESETS.keys()),
    }

@app.get("/formats")
def list_formats():
    """Lista os formatos disponíveis."""
    return {k: {
        "label":       v["label"],
        "description": v["description"],
        "resolution":  f"{v['width']}×{v['height']}",
        "fps":         v["fps"],
    } for k, v in FORMAT_PRESETS.items()}

@app.post("/generate")
async def generate_video(
    req: VideoGenerationRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(...),
):
    """Inicia a geração de um vídeo."""
    verify_token(authorization)

    if not req.scenes:
        raise HTTPException(400, "Nenhuma cena fornecida")
    if len(req.scenes) > 20:
        raise HTTPException(400, "Máximo de 20 cenas por vídeo")
    if req.format not in FORMAT_PRESETS:
        raise HTTPException(400, f"Formato '{req.format}' inválido. Use: {list(FORMAT_PRESETS.keys())}")

    # Gera job_id único
    job_id = req.job_id or str(uuid.uuid4())

    with JOBS_LOCK:
        JOBS[job_id] = {
            "job_id":      job_id,
            "status":      "queued",
            "progress":    0,
            "message":     "Na fila...",
            "video_url":   None,
            "duration_s":  None,
            "size_mb":     None,
            "format":      req.format,
            "campaign_id": req.campaign_id,
            "user_id":     req.user_id,
            "title":       req.title,
            "created_at":  time.time(),
            "finished_at": None,
            "error":       None,
        }

    # Processa em background
    background_tasks.add_task(process_video, job_id, req)

    preset = FORMAT_PRESETS[req.format]
    return {
        "job_id":        job_id,
        "status":        "queued",
        "format":        req.format,
        "format_label":  preset["label"],
        "scenes":        len(req.scenes),
        "estimated_min": len(req.scenes) * 2,  # ~2min por cena
        "message":       f"Vídeo '{req.title}' na fila de processamento",
    }

@app.get("/status/{job_id}")
def get_status(job_id: str, authorization: str = Header(...)):
    """Consulta o status de um job."""
    verify_token(authorization)
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, f"Job '{job_id}' não encontrado")
    return job

@app.get("/download/{job_id}/{filename}")
def download_video(job_id: str, filename: str, authorization: str = Header(...)):
    """Faz download do vídeo gerado."""
    verify_token(authorization)
    video_path = OUTPUT_DIR / job_id / filename
    if not video_path.exists():
        raise HTTPException(404, "Vídeo não encontrado")
    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=filename,
    )

@app.delete("/job/{job_id}")
def delete_job(job_id: str, authorization: str = Header(...)):
    """Remove um job e seus arquivos."""
    verify_token(authorization)
    with JOBS_LOCK:
        if job_id not in JOBS:
            raise HTTPException(404, "Job não encontrado")
        del JOBS[job_id]

    job_dir = OUTPUT_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)

    return {"deleted": job_id}

@app.get("/jobs")
def list_jobs(authorization: str = Header(...)):
    """Lista todos os jobs."""
    verify_token(authorization)
    with JOBS_LOCK:
        jobs = list(JOBS.values())
    return {"jobs": jobs, "total": len(jobs)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
