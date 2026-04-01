#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
vsl_modal.py — VSL Forge v2 rodando no Modal.com com GPU T4
Substitui o Google Colab para geração de vídeos em produção.

USO LOCAL:
  modal run vsl_modal.py --config academy_output/campanha-zero-mecpro.json
  modal run vsl_modal.py --config academy_output/campanha-zero-mecpro.json --draft

DEPLOY COMO API:
  modal deploy vsl_modal.py
"""
import modal
import json
import os
from pathlib import Path

# ══════════════════════════════════════════════════════════════════════════
# Imagem Docker com todas as dependências
# ══════════════════════════════════════════════════════════════════════════

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "requests",
        "Pillow",
        "tqdm",
        "elevenlabs",
        "huggingface_hub",
        "fastapi",
        "uvicorn",
        "python-multipart",
    )
)

# ══════════════════════════════════════════════════════════════════════════
# Secrets — chaves ficam seguras no Modal, nunca no código
# ══════════════════════════════════════════════════════════════════════════

# Configure no dashboard: modal.com/moliver63/main/secrets
# Crie um secret chamado "mecpro-keys" com:
#   ELEVENLABS_API_KEY = sk_xxx
#   HUGGINGFACE_API_KEY = hf_xxx
#   VSL_SECRET_KEY = mecpro-vsl-2026

secrets = [modal.Secret.from_name("mecpro-keys")]

# ══════════════════════════════════════════════════════════════════════════
# Volume persistente — salva os vídeos gerados
# ══════════════════════════════════════════════════════════════════════════

volume = modal.Volume.from_name("mecpro-videos", create_if_missing=True)
VOLUME_PATH = "/videos"

app = modal.App("mecpro-vsl")


# ══════════════════════════════════════════════════════════════════════════
# Função principal — gera um vídeo completo com GPU T4
# ══════════════════════════════════════════════════════════════════════════

@app.function(
    image=image,
    secrets=secrets,
    volumes={VOLUME_PATH: volume},
    gpu="T4",
    timeout=1800,       # 30 min máximo por vídeo
    retries=2,          # retry automático em caso de falha
    memory=4096,        # 4GB RAM
)
def gerar_video(config: dict, draft: bool = False) -> dict:
    """
    Gera um vídeo VSL completo no Modal com GPU T4.
    Retorna o caminho do vídeo salvo no volume.
    """
    import subprocess
    import sys
    import tempfile
    import shutil
    from pathlib import Path

    print(f"🎬 Iniciando geração: {config.get('title', 'sem título')}")
    print(f"   Draft: {draft}")
    print(f"   Cenas: {len(config.get('scenes', []))}")

    # Salva o config em arquivo temporário
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as f:
        json.dump(config, f, ensure_ascii=False)
        config_path = f.name

    # Baixa o vsl_forge_v2.py do GitHub direto
    import urllib.request
    import time as _time
    forge_url = (
        f"https://raw.githubusercontent.com/Moliver63/mecpro/main/vsl/vsl_forge_v2.py"
        f"?nocache={int(_time.time())}"
    )
    forge_path = "/tmp/vsl_forge_v2.py"
    # Remove cache antigo se existir
    import os as _os
    if _os.path.exists(forge_path):
        _os.remove(forge_path)
    urllib.request.urlretrieve(forge_url, forge_path)
    # Verificar URL HuggingFace no arquivo baixado
    forge_content = open(forge_path).read()
    if "api-inference.huggingface.co" in forge_content:
        forge_content = forge_content.replace(
            "https://api-inference.huggingface.co/models/{model}",
            "https://router.huggingface.co/hf-inference/models/{model}"
        )
        open(forge_path, "w").write(forge_content)
        print("✅ vsl_forge_v2.py baixado + URL HF corrigida automaticamente")
    else:
        print("✅ vsl_forge_v2.py baixado do GitHub (URL OK)")

    # Monta o comando
    cmd = [sys.executable, forge_path, "--config", config_path]
    if draft:
        cmd.append("--draft")

    # Roda o forge
    result = subprocess.run(cmd, text=True, capture_output=False)

    if result.returncode != 0:
        raise Exception(f"vsl_forge_v2 falhou com código {result.returncode}")

    # Encontra o vídeo gerado
    output_name = config.get("output_name", "vsl_forge")
    safe_name = "".join(
        c if c.isalnum() or c in "-_" else "_" for c in output_name.strip()
    )
    suffix = "_draft" if draft else ""
    video_path = Path(f"vsl_build/{safe_name}/final/{safe_name}{suffix}.mp4")

    if not video_path.exists():
        # Tenta achar qualquer MP4 gerado
        mp4s = list(Path("vsl_build").rglob("final/*.mp4"))
        if mp4s:
            video_path = mp4s[0]
        else:
            raise Exception("Nenhum vídeo MP4 encontrado após geração")

    # Copia para o volume persistente
    dest = Path(VOLUME_PATH) / video_path.name
    shutil.copy2(video_path, dest)
    volume.commit()

    size_mb = dest.stat().st_size / 1024**2
    print(f"\n✅ Vídeo salvo: {dest}")
    print(f"   Tamanho: {size_mb:.1f} MB")

    return {
        "status": "done",
        "video_path": str(dest),
        "video_name": video_path.name,
        "size_mb": round(size_mb, 2),
        "title": config.get("title"),
        "draft": draft,
    }


# ══════════════════════════════════════════════════════════════════════════
# Função para baixar o vídeo gerado
# ══════════════════════════════════════════════════════════════════════════

@app.function(
    image=image,
    volumes={VOLUME_PATH: volume},
)
def listar_videos() -> list:
    """Lista todos os vídeos gerados no volume."""
    videos = []
    volume_dir = Path(VOLUME_PATH)
    for mp4 in sorted(volume_dir.glob("*.mp4")):
        size_mb = mp4.stat().st_size / 1024**2
        videos.append({
            "name": mp4.name,
            "size_mb": round(size_mb, 2),
            "path": str(mp4),
        })
    return videos


# ══════════════════════════════════════════════════════════════════════════
# API Web — substitui o vsl_service.py + ngrok
# ══════════════════════════════════════════════════════════════════════════

@app.function(
    image=image,
    secrets=secrets,
    volumes={VOLUME_PATH: volume},
    timeout=30,
)
@modal.fastapi_endpoint(method="GET")
def health():
    """Health check da API."""
    import os
    return {
        "status": "online",
        "service": "MECProAI VSL",
        "elevenlabs": bool(os.getenv("ELEVENLABS_API_KEY")),
        "huggingface": bool(os.getenv("HUGGINGFACE_API_KEY")),
    }


@app.function(
    image=image,
    secrets=secrets,
    volumes={VOLUME_PATH: volume},
    gpu="T4",
    timeout=1800,
)
@modal.fastapi_endpoint(method="POST")
def gerar(payload: dict):
    """
    Endpoint de geração de vídeo.
    Recebe o config JSON e retorna o resultado.

    Exemplo de chamada:
    POST https://moliver63--mecpro-vsl-gerar.modal.run
    Authorization: Bearer mecpro-vsl-2026
    { "title": "...", "scenes": [...] }
    """
    import os
    from fastapi import HTTPException
    from fastapi.responses import JSONResponse

    # Autenticação
    # (Modal web_endpoint não tem headers nativos aqui — use API Gateway se precisar)
    # Por enquanto a URL já é secreta

    config = payload
    draft = payload.pop("draft", False)

    result = gerar_video.local(config, draft=draft)
    return result


# ══════════════════════════════════════════════════════════════════════════
# Entrypoint local — roda pela linha de comando
# ══════════════════════════════════════════════════════════════════════════

@app.local_entrypoint()
def main(
    config: str = "",
    draft: bool = False,
    listar: bool = False,
):
    """
    Uso:
      modal run vsl_modal.py --config academy_output/campanha-zero-mecpro.json
      modal run vsl_modal.py --config academy_output/campanha-zero-mecpro.json --draft
      modal run vsl_modal.py --listar
    """
    if listar:
        print("\n📹 Vídeos gerados no volume:\n")
        videos = listar_videos.remote()
        if not videos:
            print("  Nenhum vídeo ainda.")
        for v in videos:
            print(f"  {v['name']} ({v['size_mb']} MB)")
        return

    if not config:
        print("❌ Informe o config: --config caminho/do/arquivo.json")
        print("   Exemplo: modal run vsl_modal.py --config vsl/academy_output/campanha-zero-mecpro.json")
        return

    # Carrega o JSON
    config_path = Path(config)
    if not config_path.exists():
        print(f"❌ Arquivo não encontrado: {config}")
        return

    with open(config_path, encoding="utf-8") as f:
        project = json.load(f)

    print(f"\n🚀 Enviando para Modal (GPU T4)...")
    print(f"   Projeto : {project.get('title')}")
    print(f"   Cenas   : {len(project.get('scenes', []))}")
    print(f"   Draft   : {draft}\n")

    result = gerar_video.remote(project, draft=draft)

    print(f"\n{'═'*50}")
    print(f"✅ CONCLUÍDO!")
    print(f"   Vídeo   : {result['video_name']}")
    print(f"   Tamanho : {result['size_mb']} MB")
    print(f"   Status  : {result['status']}")
    print(f"{'═'*50}\n")
    print("💡 Para listar todos os vídeos: modal run vsl_modal.py --listar")
