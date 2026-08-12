// analyze_best_campaigns.cjs
// Passo 1: busca insights (performance real) de TODAS as campanhas do ad account.
// Passo 2: ordena por leads e por custo-por-lead.
// Passo 3: pra top N, drilla em adsets -> ads -> creative pra pegar copy, título,
//          CTA button, link, formato de mídia.
//
// Uso: node analyze_best_campaigns.cjs <userId> [topN]

const { Pool } = require("pg");

const userId = process.argv[2];
const topN = parseInt(process.argv[3] || "5", 10);
if (!userId) {
  console.error("Uso: node analyze_best_campaigns.cjs <userId> [topN]");
  process.exit(1);
}

async function fetchAll(url) {
  let all = [];
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) {
      console.error("Erro Meta API:", JSON.stringify(json.error, null, 2));
      break;
    }
    all = all.concat(json.data || []);
    url = json.paging && json.paging.next ? json.paging.next : null;
  }
  return all;
}

function actionValue(actions, type) {
  return Number((actions || []).find((a) => a.action_type === type)?.value || 0);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows } = await pool.query(
    `SELECT "accessToken", "adAccountId" FROM api_integrations
     WHERE "userId" = $1 AND provider = 'meta' AND "isActive" = 1 LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) {
    console.error(`Sem integração Meta ativa pra userId=${userId}`);
    process.exit(1);
  }
  const { accessToken, adAccountId } = rows[0];
  const act = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  console.log("Buscando campanhas...");
  const campFields = "id,name,status,effective_status,objective,created_time";
  const campaigns = await fetchAll(
    `https://graph.facebook.com/v21.0/${act}/campaigns?fields=${campFields}&limit=100&access_token=${accessToken}`
  );
  console.log(`${campaigns.length} campanhas encontradas. Buscando insights de cada uma...\n`);

  const results = [];
  for (const c of campaigns) {
    const insFields = "impressions,clicks,spend,ctr,cpm,cpc,reach,frequency,actions,action_values,cost_per_action_type";
    const insUrl = `https://graph.facebook.com/v21.0/${c.id}/insights?fields=${insFields}&date_preset=maximum&access_token=${accessToken}`;
    const res = await fetch(insUrl);
    const json = await res.json();
    const ins = (json.data && json.data[0]) || null;

    if (!ins) {
      results.push({ ...c, impressions: 0, clicks: 0, spend: 0, leads: 0, purchases: 0, costPerLead: null });
      continue;
    }

    const leads = actionValue(ins.actions, "lead") || actionValue(ins.actions, "onsite_conversion.lead_grouped");
    const purchases = actionValue(ins.actions, "purchase");
    const linkClicks = actionValue(ins.actions, "link_click");
    const messagingConversations = actionValue(ins.actions, "onsite_conversion.messaging_conversation_started_7d");
    const spend = Number(ins.spend || 0);
    const costPerLead = leads > 0 ? spend / leads : null;

    results.push({
      ...c,
      impressions: Number(ins.impressions || 0),
      clicks: Number(ins.clicks || 0),
      ctr: Number(ins.ctr || 0),
      spend,
      reach: Number(ins.reach || 0),
      leads,
      purchases,
      linkClicks,
      messagingConversations,
      costPerLead,
    });
  }

  // Ordena: primeiro por leads desc, depois por messagingConversations desc, depois por linkClicks desc
  results.sort((a, b) => {
    if (b.leads !== a.leads) return b.leads - a.leads;
    if (b.messagingConversations !== a.messagingConversations) return b.messagingConversations - a.messagingConversations;
    return b.linkClicks - a.linkClicks;
  });

  console.log("=== RANKING DE PERFORMANCE (todas as campanhas) ===\n");
  for (const r of results) {
    console.log(
      `${r.id} | leads=${r.leads} | msgs=${r.messagingConversations} | linkClicks=${r.linkClicks} | ` +
      `spend=R$${r.spend.toFixed(2)} | custo/lead=${r.costPerLead ? "R$" + r.costPerLead.toFixed(2) : "-"} | ` +
      `CTR=${(r.ctr || 0).toFixed(2)}% | ${r.name}`
    );
  }

  const top = results.slice(0, topN);
  console.log(`\n\n=== DETALHE DE CONFIGURAÇÃO — TOP ${topN} ===\n`);

  for (const camp of top) {
    console.log(`\n########## ${camp.name} (${camp.id}) ##########`);
    console.log(`Objetivo: ${camp.objective} | Leads: ${camp.leads} | Gasto: R$${camp.spend.toFixed(2)}`);

    const adsetFields = "id,name,optimization_goal,billing_event,bid_strategy,targeting,daily_budget,lifetime_budget";
    const adsets = await fetchAll(
      `https://graph.facebook.com/v21.0/${camp.id}/adsets?fields=${adsetFields}&access_token=${accessToken}`
    );

    for (const as of adsets) {
      console.log(`\n  -- AdSet: ${as.name} (${as.id})`);
      console.log(`     optimization_goal=${as.optimization_goal} | billing_event=${as.billing_event} | bid_strategy=${as.bid_strategy || "-"}`);
      if (as.targeting) {
        const t = as.targeting;
        console.log(`     targeting: idade=${t.age_min || "-"}-${t.age_max || "-"} | geo=${JSON.stringify(t.geo_locations || {})}`);
      }

      const adFields = "id,name,creative{id,object_story_spec,asset_feed_spec,effective_object_story_id}";
      const ads = await fetchAll(
        `https://graph.facebook.com/v21.0/${as.id}/ads?fields=${adFields}&access_token=${accessToken}`
      );

      for (const ad of ads) {
        console.log(`\n     >> Ad: ${ad.name} (${ad.id})`);
        const cr = ad.creative;
        if (!cr) { console.log("        (sem creative)"); continue; }

        const oss = cr.object_story_spec;
        if (oss && oss.link_data) {
          const ld = oss.link_data;
          console.log(`        Copy (message): ${JSON.stringify(ld.message || "")}`);
          console.log(`        Título (name/headline): ${JSON.stringify(ld.name || "")}`);
          console.log(`        Descrição: ${JSON.stringify(ld.description || "")}`);
          console.log(`        Link: ${ld.link || "-"}`);
          console.log(`        CTA button: ${ld.call_to_action ? JSON.stringify(ld.call_to_action) : "-"}`);
        } else if (oss && oss.video_data) {
          const vd = oss.video_data;
          console.log(`        Copy (video message): ${JSON.stringify(vd.message || "")}`);
          console.log(`        Título: ${JSON.stringify(vd.title || "")}`);
          console.log(`        CTA button: ${vd.call_to_action ? JSON.stringify(vd.call_to_action) : "-"}`);
        } else if (cr.asset_feed_spec) {
          const afs = cr.asset_feed_spec;
          console.log(`        [Creative dinâmico/asset_feed_spec]`);
          console.log(`        Bodies: ${JSON.stringify((afs.bodies || []).map(b => b.text))}`);
          console.log(`        Titles: ${JSON.stringify((afs.titles || []).map(t => t.text))}`);
          console.log(`        CTAs: ${JSON.stringify((afs.call_to_action_types || []))}`);
        } else {
          console.log(`        (formato de creative não reconhecido — object_story_spec/asset_feed_spec ausentes)`);
        }
      }
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error("Erro:", e);
  process.exit(1);
});
