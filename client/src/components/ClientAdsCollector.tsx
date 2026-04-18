/**
 * ClientAdsCollector
 *
 * ABORDAGEM CORRIGIDA:
 * fetch cross-origin para facebook.com é bloqueado por CORS.
 * A solução é um bookmarklet que o usuário executa DENTRO da página
 * da Ads Library do Facebook — o script roda no contexto do Facebook
 * (sem restrição CORS) e envia os dados coletados para o MECPro.
 */

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface Props {
  competitorId: number;
  projectId:    number;
  compName:     string;
  pageId?:      string | null;
  onSuccess?:   () => void;
}

export function ClientAdsCollector({ competitorId, projectId, compName, pageId, onSuccess }: Props) {
  const [step,    setStep]    = useState<"idle" | "waiting" | "done">("idle");
  const [saving,  setSaving]  = useState(false);

  const submitMut = (trpc as any).integrations?.submitClientAds?.useMutation?.({
    onSuccess: (data: any) => {
      setSaving(false);
      setStep("done");
      toast.success(data.message || `◎ ${data.saved} anúncios salvos!`);
      onSuccess?.();
    },
    onError: (e: any) => {
      setSaving(false);
      toast.error("✕ Erro ao salvar: " + (e?.message || "tente novamente"));
    },
  }) ?? { mutate: () => {}, isPending: false };

  // URL da Ads Library com pré-preenchimento do concorrente
  const adsLibraryUrl = pageId
    ? `https://www.facebook.com/ads/library/?id=${pageId}&country=BR`
    : `https://www.facebook.com/ads/library/?q=${encodeURIComponent(compName)}&country=BR&active_status=all&ad_type=all`;

  // Endpoint do MECPro para receber os dados coletados
  const mecproEndpoint = `${window.location.origin}/api/collect-ads`;

  // Script do bookmarklet — roda dentro do Facebook
  const bookmarkletCode = `javascript:(function(){
  var s=document.createElement('script');
  s.src='${window.location.origin}/collector.js?cid=${competitorId}&pid=${projectId}&t='+Date.now();
  document.head.appendChild(s);
})();`;

  // Script inline (mais simples, sem arquivo externo)
  const inlineScript = `javascript:(function(){
try{
  var ads=[];
  var cards=document.querySelectorAll('[data-testid="ad-archive-card"],.x1qjc9v5,.xjkvuk6,.x78zum5.xdt5ytf');
  if(!cards||cards.length===0){
    var alt=document.querySelectorAll('[role="main"] > div > div > div');
    cards=alt;
  }
  cards.forEach(function(c){
    var texts=[].slice.call(c.querySelectorAll('div[style*="font-weight: 600"],div[class*="title"],h3,h4')).map(function(el){return el.innerText.trim();}).filter(Boolean);
    var bodies=[].slice.call(c.querySelectorAll('div[data-ad-preview="message"],div[class*="body"],p')).map(function(el){return el.innerText.trim();}).filter(Boolean);
    var imgs=[].slice.call(c.querySelectorAll('img[src*="fbcdn"]')).map(function(el){return el.src;});
    if(texts[0]||bodies[0]){
      ads.push({headline:texts[0]||null,bodyText:bodies[0]||null,imageUrl:imgs[0]||null,adId:'cl_'+Date.now()+'_'+ads.length});
    }
  });
  if(ads.length===0){alert('Nenhum anúncio detectado. Abra a Ads Library e rode novamente com os anúncios visíveis na tela.');return;}
  fetch('${window.location.origin}/api/trpc/integrations.submitClientAds',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({json:{competitorId:${competitorId},projectId:${projectId},ads:ads,source:'bookmarklet'}})
  }).then(function(r){return r.json();}).then(function(d){
    var saved=d?.result?.data?.json?.saved??ads.length;
    alert('◎ '+saved+' anúncio(s) enviados para o MECPro! Volte à aba do MECPro e atualize.');
  }).catch(function(e){alert('Erro ao enviar: '+e.message);});
}catch(e){alert('Erro: '+e.message);}
})();`;

  const copyBookmarklet = () => {
    navigator.clipboard.writeText(inlineScript).then(() => {
      toast.success("◎ Script copiado! Cole no console do navegador.");
    }).catch(() => {
      toast.error("Erro ao copiar — copie manualmente");
    });
  };

  return (
    <div style={{
      background: "#f0fdf4", border: "1.5px solid #86efac",
      borderRadius: 12, padding: "14px 16px", marginTop: 8,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#166534" }}>
            🌐 Coletar anúncios via Ads Library
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#16a34a" }}>
            Como o CORS bloqueia fetch direto, use o script abaixo dentro da página do Facebook.
          </p>
        </div>
      </div>

      {step === "done" ? (
        <div style={{ background: "#dcfce7", borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#15803d" }}>
            ◎ Dados coletados e salvos com sucesso!
          </p>
          <button onClick={() => setStep("idle")}
            style={{ marginTop: 6, fontSize: 11, color: "#16a34a", background: "none", border: "none", cursor: "pointer" }}>
            Coletar novamente
          </button>
        </div>
      ) : (
        <>
          {/* Passo 1 */}
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#166534", margin: "0 0 6px" }}>
              Passo 1 — Abra a Ads Library do concorrente
            </p>
            <a href={adsLibraryUrl} target="_blank" rel="noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "#1877f2", color: "white", fontWeight: 700,
                fontSize: 12, padding: "8px 14px", borderRadius: 8,
                textDecoration: "none",
              }}>
              📖 Abrir Ads Library — {compName} ↗
            </a>
          </div>

          {/* Passo 2 */}
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#166534", margin: "0 0 6px" }}>
              Passo 2 — Cole este script no Console do navegador (F12 → Console)
            </p>
            <div style={{ background: "#0f172a", borderRadius: 8, padding: "10px 12px", position: "relative" }}>
              <code style={{
                fontSize: 10, color: "#86efac", wordBreak: "break-all",
                display: "block", maxHeight: 80, overflow: "hidden",
                lineHeight: 1.5,
              }}>
                {inlineScript.slice(0, 200)}...
              </code>
              <button
                onClick={copyBookmarklet}
                style={{
                  position: "absolute", top: 6, right: 6,
                  background: "#22c55e", color: "white", border: "none",
                  borderRadius: 6, padding: "4px 10px", fontSize: 11,
                  fontWeight: 700, cursor: "pointer",
                }}>
                📋 Copiar
              </button>
            </div>
            <p style={{ fontSize: 10, color: "#15803d", marginTop: 4 }}>
              💡 No Chrome: F12 → aba "Console" → cole o script → Enter
            </p>
          </div>

          {/* Passo 3 */}
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#166534", margin: "0 0 6px" }}>
              Passo 3 — Confirme o envio aqui
            </p>
            <p style={{ fontSize: 11, color: "#16a34a", margin: "0 0 8px" }}>
              O script vai mostrar um alerta quando os dados forem enviados.
              Clique abaixo para atualizar os anúncios.
            </p>
            <button
              onClick={() => { onSuccess?.(); toast.success("Atualizando..."); }}
              style={{
                width: "100%", padding: "9px", borderRadius: 8,
                background: "#16a34a", color: "white", fontWeight: 700,
                fontSize: 12, border: "none", cursor: "pointer",
              }}>
              🔄 Atualizar anúncios do concorrente
            </button>
          </div>

          {/* Alternativa: Bookmarklet */}
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 11, color: "#15803d", cursor: "pointer", fontWeight: 600 }}>
              ⚡ Alternativa: Salvar como Bookmarklet (mais rápido da próxima vez)
            </summary>
            <div style={{ marginTop: 8, padding: "10px 12px", background: "white", borderRadius: 8, border: "1px solid #86efac" }}>
              <p style={{ fontSize: 11, color: "#166534", margin: "0 0 6px" }}>
                1. Copie o link abaixo<br/>
                2. Abra os favoritos do Chrome → clique com direito → "Adicionar página"<br/>
                3. Cole o script no campo "URL"<br/>
                4. Da próxima vez, clique no favorito estando na Ads Library
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  readOnly
                  value={inlineScript}
                  style={{ flex: 1, fontSize: 10, padding: "6px 8px", borderRadius: 6, border: "1px solid #86efac", background: "#f0fdf4", color: "#166534" }}
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={copyBookmarklet}
                  style={{ padding: "6px 12px", background: "#16a34a", color: "white", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  Copiar
                </button>
              </div>
            </div>
          </details>
        </>
      )}

      <p style={{ margin: "10px 0 0", fontSize: 10, color: "#86efac" }}>
        ⚠️ Requer estar logado no Facebook. Os dados são enviados direto para o MECPro.
      </p>
    </div>
  );
}
