/**
 * videoGenerator.ts
 * Gera vídeos slideshow de alta qualidade a partir de fotos
 * usando FFmpeg com efeito Ken Burns (zoom+pan) e transições xfade
 */
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import * as os from "os";
import * as crypto from "crypto";

const execAsync = promisify(exec);

export interface VideoGeneratorOptions {
  photos: string[];           // URLs das fotos
  title?: string;             // Título sobreposto no vídeo
  subtitle?: string;          // Subtítulo
  duration?: number;          // Segundos por foto (default: 4)
  transition?: "fade" | "dissolve" | "wiperight" | "slideleft" | "circleopen";
  format?: "feed" | "stories" | "square";  // Formato de saída
  quality?: "standard" | "high";
}

export interface VideoGeneratorResult {
  success: boolean;
  videoPath?: string;
  durationSecs?: number;
  error?: string;
}

// Download foto de URL para arquivo local
async function downloadImage(url: string, destPath: string): Promise<boolean> {
  return new Promise(resolve => {
    const proto = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = proto.get(url, { timeout: 15000 }, res => {
      if (res.statusCode !== 200) { resolve(false); return; }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(true); });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

// Dimensões por formato
const FORMAT_DIMS = {
  feed:    { w: 1080, h: 1350 },  // 4:5 Instagram Feed
  stories: { w: 1080, h: 1920 },  // 9:16 Stories/Reels
  square:  { w: 1080, h: 1080 },  // 1:1 quadrado
};

export async function generateSlideshow(
  opts: VideoGeneratorOptions
): Promise<VideoGeneratorResult> {
  const {
    photos,
    title,
    subtitle,
    duration     = 4,
    transition   = "fade",
    format       = "feed",
    quality      = "standard",
  } = opts;

  if (!photos || photos.length < 1) {
    return { success: false, error: "Envie pelo menos 1 foto" };
  }

  const dim       = FORMAT_DIMS[format];
  const tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), "mecpro-video-"));
  const outputId  = crypto.randomBytes(8).toString("hex");
  const outputPath = path.join(tmpDir, `slideshow-${outputId}.mp4`);

  try {
    // 1. Download fotos para disco local
    const localPaths: string[] = [];
    for (let i = 0; i < Math.min(photos.length, 10); i++) {
      const dest = path.join(tmpDir, `photo-${i}.jpg`);
      const ok = await downloadImage(photos[i], dest);
      if (ok) localPaths.push(dest);
    }

    if (localPaths.length === 0) {
      return { success: false, error: "Não foi possível baixar as fotos" };
    }

    const n          = localPaths.length;
    const fps        = 30;
    const frameDur   = duration * fps;           // frames por slide
    const transFrames = Math.floor(fps * 0.6);  // 0.6s de transição
    const totalDur   = n * duration - (n - 1) * 0.6;

    // 2. Monta filtergraph FFmpeg
    // Cada foto: scale + pad + zoompan (Ken Burns) + fade out
    const inputs    = localPaths.map(p => `-loop 1 -t ${duration} -i "${p}"`).join(" ");
    const filterParts: string[] = [];

    // Padding/scale para o formato alvo
    const scale = `scale=${dim.w}:${dim.h}:force_original_aspect_ratio=decrease,pad=${dim.w}:${dim.h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;

    // Ken Burns com direções variadas por slide
    const kenBurns = [
      `zoompan=z='min(zoom+0.0008,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frameDur}:s=${dim.w}x${dim.h}`,
      `zoompan=z='if(lte(zoom,1.0),1.05,max(1.001,zoom-0.0008))':x='iw/2-(iw/zoom/2)+sin(on/${frameDur}*3.14)*20':y='ih/4':d=${frameDur}:s=${dim.w}x${dim.h}`,
      `zoompan=z='min(zoom+0.0008,1.08)':x='iw-iw/zoom':y='ih-ih/zoom':d=${frameDur}:s=${dim.w}x${dim.h}`,
      `zoompan=z='min(zoom+0.0006,1.06)':x='0':y='ih/2-(ih/zoom/2)':d=${frameDur}:s=${dim.w}x${dim.h}`,
    ];

    // Prepara cada slide
    for (let i = 0; i < n; i++) {
      const kb = kenBurns[i % kenBurns.length];
      filterParts.push(`[${i}:v]${scale},fps=${fps},${kb}[slide${i}]`);
    }

    // Encadeia com xfade
    let lastLabel = "slide0";
    const offset0 = duration - 0.6;
    for (let i = 1; i < n; i++) {
      const offset = (duration - 0.6) * i - 0.6 * (i - 1);
      const nextLabel = i === n - 1 ? "vout" : `xf${i}`;
      filterParts.push(
        `[${lastLabel}][slide${i}]xfade=transition=${transition}:duration=0.6:offset=${offset.toFixed(2)}[${nextLabel}]`
      );
      lastLabel = nextLabel;
    }
    if (n === 1) filterParts.push(`[slide0]copy[vout]`);

    // 3. Overlay de texto (título)
    const hasText = title || subtitle;
    if (hasText) {
      const fontSize = Math.round(dim.w * 0.045);
      const subSize  = Math.round(dim.w * 0.030);
      const y = Math.round(dim.h * 0.82);

      let textFilter = `[vout]`;
      if (title) {
        // Sombra + texto branco
        const safeTitle = (title || "").replace(/['"\\:]/g, " ").slice(0, 60);
        textFilter += `drawtext=text='${safeTitle}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${y}:shadowcolor=black:shadowx=2:shadowy=2:box=1:boxcolor=black@0.4:boxborderw=12`;
      }
      if (subtitle && title) {
        const safeSub = (subtitle || "").replace(/['"\\:]/g, " ").slice(0, 80);
        textFilter += `,drawtext=text='${safeSub}':fontsize=${subSize}:fontcolor=white@0.85:x=(w-text_w)/2:y=${y + fontSize + 10}:shadowcolor=black:shadowx=1:shadowy=1`;
      }
      if (!title && subtitle) {
        const safeSub = (subtitle || "").replace(/['"\\:]/g, " ").slice(0, 80);
        textFilter += `drawtext=text='${safeSub}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${y}:shadowcolor=black:shadowx=2:shadowy=2:box=1:boxcolor=black@0.4:boxborderw=12`;
      }
      textFilter += `[vfinal]`;
      filterParts.push(textFilter);
    } else {
      filterParts.push(`[vout]copy[vfinal]`);
    }

    const filterComplex = filterParts.join(";");
    const crf = quality === "high" ? "20" : "26";

    // 4. Monta e executa comando FFmpeg
    const cmd = [
      "ffmpeg -y",
      inputs,
      `-filter_complex "${filterComplex}"`,
      `-map "[vfinal]"`,
      `-c:v libx264 -crf ${crf} -preset fast`,
      `-pix_fmt yuv420p`,
      `-movflags +faststart`,
      `-t ${totalDur.toFixed(2)}`,
      `"${outputPath}"`,
    ].join(" ");

    await execAsync(cmd, { timeout: 120000 }); // 2min timeout

    if (!fs.existsSync(outputPath)) {
      return { success: false, error: "FFmpeg não gerou o arquivo de saída" };
    }

    const stat = fs.statSync(outputPath);
    if (stat.size < 1000) {
      return { success: false, error: "Vídeo gerado está vazio" };
    }

    return {
      success: true,
      videoPath: outputPath,
      durationSecs: Math.round(totalDur),
    };

  } catch (err: any) {
    // Cleanup on error
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    return { success: false, error: err.message?.slice(0, 200) || "Erro interno" };
  }
}

// Limpa arquivo temporário após uso
export function cleanupVideo(videoPath: string) {
  try {
    const dir = path.dirname(videoPath);
    if (dir.includes("mecpro-video-")) {
      fs.rmSync(dir, { recursive: true });
    }
  } catch {}
}
