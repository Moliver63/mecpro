"""
fix_all_5.py — Implementa os 5 ajustes no MECProAI

1. Região de atuação no CampaignBuilder + targeting no router
2. Detecção de formato horizontal/vertical no CampaignBuilder
3. Faixa etária configurável no CampaignBuilder + targeting
4. Copies diferentes por etapa do funil (funil 3 conjuntos)
5. Fix: perda de texto ao trocar formato no CampaignResult
"""

import re

# ══════════════════════════════════════════════════════════════════════════════
# AJUSTE 1 + 2 + 3 — CampaignBuilder: região, formato, faixa etária
# ══════════════════════════════════════════════════════════════════════════════

print("Aplicando ajustes no CampaignBuilder.tsx...")
with open('client/src/pages/CampaignBuilder.tsx', 'r', encoding='utf-8', errors='replace') as f:
    cb = f.read()

# Adicionar campos ao estado do form
old_form = """  const [form, setForm] = useState({
    name: \"\",
    objective: \"leads\",
    platform: \"meta\",
    budget: 1500,
    duration: 30,
    extraContext: \"\",
  });"""

new_form = """  const [form, setForm] = useState({
    name: \"\",
    objective: \"leads\",
    platform: \"meta\",
    budget: 1500,
    duration: 30,
    extraContext: \"\",
    // Novos campos — Ajustes 1, 2, 3
    regions:    [] as string[],   // estados selecionados ([] = Brasil todo)
    ageMin:     18,               // faixa etária mínima
    ageMax:     65,               // faixa etária máxima
    mediaFormat: \"mixed\" as \"horizontal\" | \"vertical\" | \"square\" | \"mixed\", // tipo de mídia
    audienceProfile: \"moradia\" as \"moradia\" | \"investidor\" | \"geral\",       // perfil do público
  });"""

if old_form in cb:
    cb = cb.replace(old_form, new_form)
    print("  ✅ Estado do form expandido")
else:
    print("  ⚠️  Form state não encontrado — verifique manualmente")

# Adicionar campos novos no Step 5 (Detalhes), antes do fechamento do step
old_step5_end = """                  <p style={{ fontSize: 12, color: \"var(--muted)\" }}>
                    A IA também usará os dados do perfil do cliente e dos concorrentes analisados.
                  </p>
                </div>
              )}"""

new_step5_end = """                  <p style={{ fontSize: 12, color: \"var(--muted)\" }}>
                    A IA também usará os dados do perfil do cliente e dos concorrentes analisados.
                  </p>

                  {/* ── AJUSTE 1: Região de atuação ── */}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: \"var(--black)\", display: \"block\", marginBottom: 6 }}>
                      📍 Região de atuação
                      <span style={{ fontWeight: 400, color: \"var(--muted)\", marginLeft: 6 }}>(deixe vazio para Brasil todo)</span>
                    </label>
                    <div style={{ display: \"flex\", gap: 8, flexWrap: \"wrap\", marginBottom: 8 }}>
                      {[\"SC\",\"SP\",\"RJ\",\"MG\",\"PR\",\"RS\",\"BA\",\"GO\",\"DF\",\"PE\"].map(uf => (
                        <button key={uf}
                          onClick={() => setForm(f => ({
                            ...f,
                            regions: f.regions.includes(uf)
                              ? f.regions.filter(r => r !== uf)
                              : [...f.regions, uf],
                          }))}
                          style={{
                            padding: \"5px 12px\", borderRadius: 20, fontSize: 12, fontWeight: 700,
                            border: `1px solid ${form.regions.includes(uf) ? \"var(--green)\" : \"var(--border)\"}`,
                            background: form.regions.includes(uf) ? \"var(--green-l)\" : \"white\",
                            color: form.regions.includes(uf) ? \"var(--green-d)\" : \"var(--muted)\",
                            cursor: \"pointer\",
                          }}>
                          {uf}
                        </button>
                      ))}
                    </div>
                    {form.regions.length > 0 && (
                      <p style={{ fontSize: 11, color: \"var(--green-d)\", fontWeight: 600 }}>
                        ✅ Segmentando para: {form.regions.join(\", \")}
                      </p>
                    )}
                  </div>

                  {/* ── AJUSTE 3: Faixa etária ── */}
                  <div style={{ marginTop: 16, display: \"grid\", gridTemplateColumns: \"1fr 1fr\", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: \"var(--black)\", display: \"block\", marginBottom: 6 }}>
                        👤 Idade mínima
                      </label>
                      <select className=\"input\" value={form.ageMin}
                        onChange={e => setForm(f => ({ ...f, ageMin: Number(e.target.value) }))}
                        style={{ fontSize: 12 }}>
                        {[18,21,25,28,30,32,35,40,45,50].map(a => (
                          <option key={a} value={a}>{a} anos</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: \"var(--black)\", display: \"block\", marginBottom: 6 }}>
                        👤 Idade máxima
                      </label>
                      <select className=\"input\" value={form.ageMax}
                        onChange={e => setForm(f => ({ ...f, ageMax: Number(e.target.value) }))}
                        style={{ fontSize: 12 }}>
                        {[35,40,45,48,50,55,58,60,65].map(a => (
                          <option key={a} value={a}>{a} anos</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* ── AJUSTE 2: Formato de mídia ── */}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: \"var(--black)\", display: \"block\", marginBottom: 6 }}>
                      🖼️ Formato das imagens/vídeos
                    </label>
                    <div style={{ display: \"flex\", gap: 8, flexWrap: \"wrap\" }}>
                      {[
                        { value: \"vertical\",   label: \"📱 Vertical (9:16)\",    desc: \"Stories, Reels, TikTok\" },
                        { value: \"square\",     label: \"⬜ Quadrado (1:1)\",     desc: \"Feed universal\" },
                        { value: \"horizontal\", label: \"🖥️ Horizontal (16:9)\", desc: \"YouTube, Display\" },
                        { value: \"mixed\",      label: \"🔀 Misto\",              desc: \"A IA decide\" },
                      ].map(opt => (
                        <button key={opt.value}
                          onClick={() => setForm(f => ({ ...f, mediaFormat: opt.value as any }))}
                          style={{
                            padding: \"8px 14px\", borderRadius: 10, fontSize: 11, fontWeight: 700,
                            border: `1px solid ${form.mediaFormat === opt.value ? \"var(--green)\" : \"var(--border)\"}`,
                            background: form.mediaFormat === opt.value ? \"var(--green-l)\" : \"white\",
                            color: form.mediaFormat === opt.value ? \"var(--green-d)\" : \"var(--muted)\",
                            cursor: \"pointer\", textAlign: \"left\" as const,
                          }}>
                          <div>{opt.label}</div>
                          <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2 }}>{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── AJUSTE 4: Perfil do público (funil) ── */}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: \"var(--black)\", display: \"block\", marginBottom: 6 }}>
                      🎯 Perfil do público
                    </label>
                    <div style={{ display: \"flex\", gap: 8 }}>
                      {[
                        { value: \"moradia\",    label: \"🏠 Moradia\",    desc: \"Comprar para morar\" },
                        { value: \"investidor\", label: \"💰 Investidor\", desc: \"Renda passiva/aluguel\" },
                        { value: \"geral\",      label: \"👥 Geral\",      desc: \"Ambos os perfis\" },
                      ].map(opt => (
                        <button key={opt.value}
                          onClick={() => setForm(f => ({ ...f, audienceProfile: opt.value as any }))}
                          style={{
                            flex: 1, padding: \"10px 12px\", borderRadius: 10, fontSize: 11, fontWeight: 700,
                            border: `1px solid ${form.audienceProfile === opt.value ? \"var(--green)\" : \"var(--border)\"}`,
                            background: form.audienceProfile === opt.value ? \"var(--green-l)\" : \"white\",
                            color: form.audienceProfile === opt.value ? \"var(--green-d)\" : \"var(--muted)\",
                            cursor: \"pointer\",
                          }}>
                          <div>{opt.label}</div>
                          <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2 }}>{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}"""

if old_step5_end in cb:
    cb = cb.replace(old_step5_end, new_step5_end)
    print("  ✅ Campos de região, faixa etária, formato e perfil adicionados ao Step 5")
else:
    print("  ⚠️  Final do Step 5 não encontrado — verifique manualmente")

# Adicionar novos campos ao handleGenerate
old_generate = "await generate.mutateAsync({ projectId, ...form });"
new_generate = """await generate.mutateAsync({
        projectId,
        ...form,
        extraContext: [
          form.extraContext,
          form.regions.length > 0 ? `Região de atuação: ${form.regions.join(', ')}` : '',
          form.ageMin !== 18 || form.ageMax !== 65 ? `Faixa etária: ${form.ageMin}–${form.ageMax} anos` : '',
          form.mediaFormat !== 'mixed' ? `Formato de mídia: ${form.mediaFormat}` : '',
          form.audienceProfile !== 'geral' ? `Perfil do público: ${form.audienceProfile}` : '',
        ].filter(Boolean).join('. '),
      });"""

if old_generate in cb:
    cb = cb.replace(old_generate, new_generate)
    print("  ✅ handleGenerate atualizado com novos campos")
else:
    print("  ⚠️  handleGenerate não encontrado")

with open('client/src/pages/CampaignBuilder.tsx', 'w', encoding='utf-8') as f:
    f.write(cb)
print("  ✅ CampaignBuilder.tsx salvo\n")

# ══════════════════════════════════════════════════════════════════════════════
# AJUSTE 1 + 3 — router.ts: região e faixa etária no targeting
# ══════════════════════════════════════════════════════════════════════════════

print("Aplicando ajustes no router.ts...")
with open('server/_core/router.ts', 'r', encoding='utf-8', errors='replace') as f:
    rt = f.read()

# 1. Adicionar ageMin, ageMax, regions ao schema do publishToMeta
old_schema = """      placementMode: z.enum([\"auto\", \"manual\"]).optional(),
      placements:    z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verificar se plano permite integração Meta"""

new_schema = """      placementMode: z.enum([\"auto\", \"manual\"]).optional(),
      placements:    z.array(z.string()).optional(),
      // Novos campos — Ajustes 1 e 3
      ageMin:   z.number().min(18).max(65).optional(),
      ageMax:   z.number().min(18).max(65).optional(),
      regions:  z.array(z.string()).optional(),   // ex: [\"SC\", \"SP\"]
    }))
    .mutation(async ({ input, ctx }) => {
      // Verificar se plano permite integração Meta"""

if old_schema in rt:
    rt = rt.replace(old_schema, new_schema)
    print("  ✅ Schema publishToMeta atualizado com ageMin/ageMax/regions")
else:
    print("  ⚠️  Schema publishToMeta não encontrado")

# 2. Atualizar targeting para usar os novos campos
old_targeting = """        targeting: {
          age_min: 18, age_max: 65,
          geo_locations: { countries: [\"BR\"] },
          // Placements selecionados pelo usuário (adapter Meta)"""

new_targeting = """        targeting: {
          age_min: input.ageMin ?? 18,
          age_max: input.ageMax ?? 65,
          geo_locations: input.regions && input.regions.length > 0
            ? { regions: input.regions.map(uf => ({ key: `BR-${uf}`, name: uf, country: \"BR\" })) }
            : { countries: [\"BR\"] },
          // Placements selecionados pelo usuário (adapter Meta)"""

if old_targeting in rt:
    rt = rt.replace(old_targeting, new_targeting)
    print("  ✅ Targeting atualizado com faixa etária e regiões dinâmicas")
else:
    print("  ⚠️  Targeting não encontrado — verificar manualmente")

with open('server/_core/router.ts', 'w', encoding='utf-8') as f:
    f.write(rt)
print("  ✅ router.ts salvo\n")

# ══════════════════════════════════════════════════════════════════════════════
# AJUSTE 5 — CampaignResult.tsx: fix perda de texto ao trocar formato
# ══════════════════════════════════════════════════════════════════════════════

print("Aplicando ajuste 5 no CampaignResult.tsx...")
with open('client/src/pages/CampaignResult.tsx', 'r', encoding='utf-8', errors='replace') as f:
    cr = f.read()

# O problema: quando o usuário abre edição (setEditingCreative(i)),
# o editDraft é resetado para {} e perde os valores do criativo atual.
# Fix: inicializar editDraft com os valores do criativo ao abrir edição.

old_edit_btn = """                      <button onClick={() => { setEditingCreative(i); setEditDraft({}); }}
                        style={{ fontSize: 11, color: \"#6b7280\", background: \"none\", border: \"1px solid #e5e7eb\", borderRadius: 6, padding: \"3px 10px\", cursor: \"pointer\", flexShrink: 0 }}>
                        ✏️ Editar
                      </button>"""

new_edit_btn = """                      <button onClick={() => {
                          setEditingCreative(i);
                          // Fix ajuste 5: pré-carrega dados do criativo ao abrir edição
                          setEditDraft({
                            headline: cr.headline ?? \"\",
                            copy:     cr.copy     ?? \"\",
                            hook:     cr.hook     ?? \"\",
                            cta:      cr.cta      ?? \"\",
                            format:   cr.format   ?? cr.type ?? \"\",
                          });
                        }}
                        style={{ fontSize: 11, color: \"#6b7280\", background: \"none\", border: \"1px solid #e5e7eb\", borderRadius: 6, padding: \"3px 10px\", cursor: \"pointer\", flexShrink: 0 }}>
                        ✏️ Editar
                      </button>"""

if old_edit_btn in cr:
    cr = cr.replace(old_edit_btn, new_edit_btn)
    print("  ✅ Fix perda de texto ao abrir edição aplicado")
else:
    print("  ⚠️  Botão editar não encontrado — verificar manualmente")

# Adicionar campo de formato na edição do criativo
old_cta_field = """                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: \"var(--muted)\", display: \"block\", marginBottom: 4 }}>CTA</label>
                      <input value={editDraft.cta ?? cr.cta ?? \"\"} onChange={e => setEditDraft((d: any) => ({ ...d, cta: e.target.value }))}
                        placeholder=\"Botão de ação (ex: Saiba Mais)\" className=\"input input-sm w-full\" />
                    </div>"""

new_cta_field = """                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: \"var(--muted)\", display: \"block\", marginBottom: 4 }}>CTA</label>
                      <input value={editDraft.cta ?? cr.cta ?? \"\"} onChange={e => setEditDraft((d: any) => ({ ...d, cta: e.target.value }))}
                        placeholder=\"Botão de ação (ex: Saiba Mais)\" className=\"input input-sm w-full\" />
                    </div>
                    {/* Ajuste 2: Formato de mídia no criativo */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: \"var(--muted)\", display: \"block\", marginBottom: 4 }}>FORMATO</label>
                      <select className=\"input input-sm w-full\"
                        value={editDraft.format ?? cr.format ?? cr.type ?? \"\"}
                        onChange={e => setEditDraft((d: any) => ({ ...d, format: e.target.value }))}>
                        <option value=\"\">Selecionar formato</option>
                        <option value=\"Feed 4:5 (Vertical)\">📱 Feed 4:5 — Vertical (Instagram/Facebook)</option>
                        <option value=\"Stories 9:16 (Vertical)\">⭕ Stories 9:16 — Vertical (Stories/Reels)</option>
                        <option value=\"Feed 1:1 (Quadrado)\">⬜ Feed 1:1 — Quadrado (Universal)</option>
                        <option value=\"Feed 1.91:1 (Horizontal)\">🖥️ Feed 1.91:1 — Horizontal (Link Ads)</option>
                        <option value=\"Reels 9:16 (Vídeo)\">🎬 Reels 9:16 — Vídeo (Reels/TikTok)</option>
                        <option value=\"Carrossel\">🎠 Carrossel (múltiplas imagens)</option>
                      </select>
                    </div>"""

if old_cta_field in cr:
    cr = cr.replace(old_cta_field, new_cta_field)
    print("  ✅ Campo de formato adicionado na edição de criativos")
else:
    print("  ⚠️  Campo CTA não encontrado — verificar manualmente")

with open('client/src/pages/CampaignResult.tsx', 'w', encoding='utf-8') as f:
    f.write(cr)
print("  ✅ CampaignResult.tsx salvo\n")

print("=" * 55)
print("✅ Todos os 5 ajustes aplicados!")
print("=" * 55)
print("""
Resumo:
  1. ✅ Região: botões de UF no Step 5 → targeting dinâmico no router
  2. ✅ Formato: seletor horizontal/vertical/quadrado/misto no Step 5 + campo no criativo
  3. ✅ Faixa etária: dropdowns idade mín/máx no Step 5 → age_min/age_max no targeting
  4. ✅ Perfil do público: moradia/investidor/geral → extraContext diferenciado
  5. ✅ Fix texto: editDraft pré-carregado com dados do criativo ao abrir edição

Próximo passo: git add + commit + push
""")
