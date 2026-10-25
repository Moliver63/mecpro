import test from "node:test";
import assert from "node:assert/strict";
import { mesclarTargeting, temIntencaoDePlacement, CAMPOS_DE_PLACEMENT } from "../metaTargetingMerge";

/**
 * Editar idade nao pode apagar interesses (24/10).
 *
 * A Meta substitui o objeto `targeting` inteiro no POST do ad set. O
 * `updateAdSetPlacements` montava esse objeto do zero, entao toda edicao
 * apagava em silencio o que nao estivesse na lista: interesses, genero,
 * idioma, publicos salvos. Isso ja aconteceu duas vezes com idade e geo, em
 * campanha de cliente rodando com orcamento real.
 *
 * O que estes testes travam: o payload tem que sair do targeting REAL, nao de
 * um objeto novo. Se alguem voltar a montar `targeting` do zero, o primeiro
 * teste cai.
 */

const MAPA = {
  fb_feed: { pub: "facebook", pos: "feed" },
  fb_story: { pub: "facebook", pos: "story" },
  ig_feed: { pub: "instagram", pos: "stream" },
  ig_reels: { pub: "instagram", pos: "reels" },
  an_classic: { pub: "audience_network", pos: "classic" },
};

/** Targeting no formato que a Meta devolve para a 804, com interesses. */
function targetingReal(): Record<string, any> {
  return {
    age_min: 18,
    age_max: 65,
    geo_locations: { countries: ["BR"] },
    flexible_spec: [{ interests: [{ id: "6003139266461" }, { id: "6003020834693" }] }],
    targeting_automation: { advantage_audience: 0 },
    device_platforms: ["mobile"],
    genders: [2],
    locales: [6],
    brand_safety_content_filter_levels: ["FACEBOOK_STANDARD"],
  };
}

const GEO_PRESERVADO = { countries: ["BR"] };

// ── O bug ────────────────────────────────────────────────────────────────
test("editar so a idade preserva os interesses", () => {
  const atual = targetingReal();
  const r = mesclarTargeting({
    atual,
    ageMin: 45,
    ageMax: 65,
    geoLocations: GEO_PRESERVADO,
  });

  assert.equal(r.age_min, 45, "a idade pedida tem que entrar");
  assert.equal(r.age_max, 65);
  assert.deepEqual(r.flexible_spec, atual.flexible_spec, "interesses NAO podem sumir");
});

test("editar so a idade preserva genero, idioma e filtro de marca", () => {
  const atual = targetingReal();
  const r = mesclarTargeting({ atual, ageMin: 45, ageMax: 65, geoLocations: GEO_PRESERVADO });
  assert.deepEqual(r.genders, [2]);
  assert.deepEqual(r.locales, [6]);
  assert.deepEqual(r.brand_safety_content_filter_levels, ["FACEBOOK_STANDARD"]);
});

test("nao forca advantage_audience: preserva o que a campanha tem", () => {
  // O codigo antigo cravava advantage_audience 0 em toda edicao. Quem publicou
  // com expansao ligada (sem interesses) perdia a configuracao.
  const ligado = { ...targetingReal(), targeting_automation: { advantage_audience: 1 } };
  const r = mesclarTargeting({ atual: ligado, ageMin: 45, ageMax: 65, geoLocations: GEO_PRESERVADO });
  assert.deepEqual(r.targeting_automation, { advantage_audience: 1 });
});

test("preserva publicos salvos e exclusoes", () => {
  const atual = {
    ...targetingReal(),
    custom_audiences: [{ id: "120250000000000001" }],
    excluded_custom_audiences: [{ id: "120250000000000002" }],
    exclusions: { interests: [{ id: "6003000000000" }] },
  };
  const r = mesclarTargeting({ atual, ageMin: 45, ageMax: 65, geoLocations: GEO_PRESERVADO });
  assert.deepEqual(r.custom_audiences, atual.custom_audiences);
  assert.deepEqual(r.excluded_custom_audiences, atual.excluded_custom_audiences);
  assert.deepEqual(r.exclusions, atual.exclusions);
});

test("campo de targeting que este codigo nunca viu continua preservado", () => {
  // A lista de campos da Meta cresce. Preservar por padrao e o que evita que o
  // proximo campo novo entre ja quebrado.
  const atual = { ...targetingReal(), campo_que_a_meta_inventou_depois: { foo: "bar" } };
  const r = mesclarTargeting({ atual, ageMin: 45, ageMax: 65, geoLocations: GEO_PRESERVADO });
  assert.deepEqual(r.campo_que_a_meta_inventou_depois, { foo: "bar" });
});

// ── Posicionamento ───────────────────────────────────────────────────────
test("sem intencao de placement, os posicionamentos ficam como estao", () => {
  const atual = {
    ...targetingReal(),
    publisher_platforms: ["facebook"],
    facebook_positions: ["feed", "marketplace"],
  };
  const r = mesclarTargeting({ atual, ageMin: 45, ageMax: 65, geoLocations: GEO_PRESERVADO });
  assert.deepEqual(r.publisher_platforms, ["facebook"]);
  assert.deepEqual(r.facebook_positions, ["feed", "marketplace"]);
});

test("placementMode auto explicito limpa os posicionamentos", () => {
  // Quem pede auto quer Advantage+ Placements: ausencia de publisher_platforms
  // e justamente o que liga isso na Meta.
  const atual: Record<string, any> = {
    ...targetingReal(),
    publisher_platforms: ["facebook", "instagram"],
    facebook_positions: ["feed"],
    instagram_positions: ["stream"],
  };
  const r = mesclarTargeting({ atual, ageMin: 45, ageMax: 65, geoLocations: GEO_PRESERVADO, placementMode: "auto" });
  for (const campo of CAMPOS_DE_PLACEMENT) {
    assert.ok(!(campo in r), `${campo} deveria sair no modo auto`);
  }
  assert.deepEqual(r.flexible_spec, atual.flexible_spec, "mesmo trocando placement, interesse fica");
});

test("placementMode manual monta plataformas e posicoes", () => {
  const r = mesclarTargeting({
    atual: targetingReal(),
    ageMin: 45,
    ageMax: 65,
    geoLocations: GEO_PRESERVADO,
    placementMode: "manual",
    placements: ["fb_feed", "fb_story", "ig_reels", "an_classic"],
    mapaDePlacement: MAPA,
  });
  assert.deepEqual(r.publisher_platforms.sort(), ["audience_network", "facebook", "instagram"]);
  assert.deepEqual(r.facebook_positions, ["feed", "story"]);
  assert.deepEqual(r.instagram_positions, ["reels"]);
  assert.deepEqual(r.audience_network_positions, ["classic"]);
});

test("id de placement desconhecido nao gera publisher_platforms vazio", () => {
  // Lista vazia a Meta recusa. Cair em Advantage+ e melhor que erro.
  const r = mesclarTargeting({
    atual: targetingReal(),
    ageMin: 45,
    ageMax: 65,
    geoLocations: GEO_PRESERVADO,
    placementMode: "manual",
    placements: ["nao_existe"],
    mapaDePlacement: MAPA,
  });
  assert.ok(!("publisher_platforms" in r));
});

test("placements sem placementMode conta como intencao manual", () => {
  const r = mesclarTargeting({
    atual: targetingReal(),
    ageMin: 45,
    ageMax: 65,
    geoLocations: GEO_PRESERVADO,
    placements: ["fb_feed"],
    mapaDePlacement: MAPA,
  });
  assert.deepEqual(r.publisher_platforms, ["facebook"]);
});

test("temIntencaoDePlacement so e verdade quando algo foi pedido", () => {
  assert.equal(temIntencaoDePlacement({}), false);
  assert.equal(temIntencaoDePlacement({ placements: [] }), false);
  assert.equal(temIntencaoDePlacement({ placementMode: "auto" }), true);
  assert.equal(temIntencaoDePlacement({ placements: ["fb_feed"] }), true);
});

// ── Detalhes que a Meta cobra ────────────────────────────────────────────
test("device_platforms real e preservado, nao sobrescrito", () => {
  const r = mesclarTargeting({ atual: targetingReal(), ageMin: 45, ageMax: 65, geoLocations: GEO_PRESERVADO });
  assert.deepEqual(r.device_platforms, ["mobile"], "o codigo antigo cravava mobile+desktop");
});

test("device_platforms ausente recebe padrao, para evitar erro #1885366", () => {
  const atual = targetingReal();
  delete atual.device_platforms;
  const r = mesclarTargeting({ atual, ageMin: 45, ageMax: 65, geoLocations: GEO_PRESERVADO });
  assert.deepEqual(r.device_platforms, ["mobile", "desktop"]);
});

test("age_range legado sai do payload", () => {
  const atual = { ...targetingReal(), age_range: [18, 65] };
  const r = mesclarTargeting({ atual, ageMin: 45, ageMax: 65, geoLocations: GEO_PRESERVADO });
  assert.ok(!("age_range" in r), "age_range conflita com age_min/age_max no POST");
});

test("geo resolvido pelo chamador manda", () => {
  const r = mesclarTargeting({
    atual: targetingReal(),
    ageMin: 45,
    ageMax: 65,
    geoLocations: { regions: [{ key: "1234" }] },
  });
  assert.deepEqual(r.geo_locations, { regions: [{ key: "1234" }] });
});

test("nao modifica o targeting recebido", () => {
  // O chamador loga o targeting atual depois; mutar quebraria o log.
  const atual = targetingReal();
  const copia = JSON.parse(JSON.stringify(atual));
  mesclarTargeting({ atual, ageMin: 45, ageMax: 65, geoLocations: GEO_PRESERVADO, placementMode: "auto" });
  assert.deepEqual(atual, copia);
});

test("targeting vazio nao lanca", () => {
  // A busca do targeting atual pode falhar (timeout) e cair para {}.
  const r = mesclarTargeting({ atual: {}, ageMin: 45, ageMax: 65, geoLocations: GEO_PRESERVADO });
  assert.equal(r.age_min, 45);
  assert.deepEqual(r.device_platforms, ["mobile", "desktop"]);
});

// ── O caso real ──────────────────────────────────────────────────────────
test("caso 804: 18-65 para 45-65 mantendo tudo o resto", () => {
  const atual = targetingReal();
  const r = mesclarTargeting({
    atual,
    ageMin: 45,
    ageMax: 65,
    geoLocations: atual.geo_locations,
  });

  assert.deepEqual(r, {
    age_min: 45,
    age_max: 65,
    geo_locations: { countries: ["BR"] },
    flexible_spec: [{ interests: [{ id: "6003139266461" }, { id: "6003020834693" }] }],
    targeting_automation: { advantage_audience: 0 },
    device_platforms: ["mobile"],
    genders: [2],
    locales: [6],
    brand_safety_content_filter_levels: ["FACEBOOK_STANDARD"],
  }, "so age_min muda; o resto sai identico");
});
