// campaign_detail.cjs — detalhe completo de UMA campanha específica
// Uso: node campaign_detail.cjs <userId> <campaignId>
const { Pool } = require("pg");
const userId = process.argv[2];
const campaignId = process.argv[3];
if (!userId || !campaignId) {
  console.error("Uso: node campaign_detail.cjs <userId> <campaignId>");
  process.exit(1);
}

async function fetchAll(url) {
  let all = [];
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) { console.error("Erro Meta API:", JSON.stringify(json.error, null, 2)); break; }
    all = all.concat(json.data || []);
    url = json.paging && json.paging.next ? json.paging.next : null;
  }
  return all;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `SELECT "accessToken" FROM api_integrations WHERE "userId"=$1 AND provider='meta' AND "isActive"=1 LIMIT 1`,
    [userId]
  );
  const accessToken = rows[0].accessToken;

  const insFields = "impressions,clicks,spend,ctr,cpm,cpc,reach,frequency,actions,action_values";
  const insRes = await fetch(`https://graph.facebook.com/v21.0/${campaignId}/insights?fields=${insFields}&date_preset=maximum&access_token=${accessToken}`);
  const insJson = await insRes.json();
  console.log("=== INSIGHTS ===");
  console.log(JSON.stringify(insJson.data && insJson.data[0], null, 2));

  const adsetFields = "id,name,optimization_goal,billing_event,bid_strategy,destination_type,targeting,daily_budget,lifetime_budget,status";
  const adsets = await fetchAll(`https://graph.facebook.com/v21.0/${campaignId}/adsets?fields=${adsetFields}&access_token=${accessToken}`);

  for (const as of adsets) {
    console.log(`\n\n=== AdSet: ${as.name} (${as.id}) ===`);
    console.log(`optimization_goal=${as.optimization_goal} | destination_type=${as.destination_type || "-"} | status=${as.status}`);
    console.log("targeting:", JSON.stringify(as.targeting, null, 2));

    const adFields = "id,name,status,creative{id,object_story_spec,asset_feed_spec,effective_object_story_id}";
    const ads = await fetchAll(`https://graph.facebook.com/v21.0/${as.id}/ads?fields=${adFields}&access_token=${accessToken}`);
    for (const ad of ads) {
      console.log(`\n  -- Ad: ${ad.name} (${ad.id}) status=${ad.status}`);
      console.log(JSON.stringify(ad.creative, null, 2));
    }
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
