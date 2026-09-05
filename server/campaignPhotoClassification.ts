import { detectRealEstateSegment } from "../shared/segmentConfig";

export function classifyCampaignPhoto(vision: any, index: number, total: number, segmentHint = ""): { role: string; copyAngle: string; orderWeight: number } {
  // The campaign determines the business; labels determine the scene.
  // "lookalike" in an audience instruction is not a fashion photograph.
  if (detectRealEstateSegment(segmentHint)) return classifyPropertyPhoto(vision, index, total);
  const text = [
    ...(Array.isArray(vision?.labels) ? vision.labels : []),
    ...(Array.isArray(vision?.objects) ? vision.objects : []),
    vision?.text_found || "",
    segmentHint,
  ].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const has = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));

  if (has([/food|meal|dessert|cake|sweet|chocolate|cookie|brigadeiro|beijinho|doce|bolo|confeito|doceria|aliment|restaurante|delivery/])) {
    if (vision?.has_text || has([/card|logo|brand|marca|telefone|whatsapp|instagram|texto/])) {
      return { role: "offer_information", copyAngle: "contato, marca, pedido e chamada para acao", orderWeight: total > 1 ? 85 : 20 };
    }
    if (has([/box|package|gift|tray|kit|caixa|embalagem|presente|bandeja/])) {
      return { role: "package_proof", copyAngle: "apresentacao, quantidade e prova visual do produto", orderWeight: 25 };
    }
    if (has([/variety|assorted|mix|flavor|sabores|variado|sortido/]) || total > 2) {
      return { role: "menu_variety", copyAngle: "variedade de sabores, escolha e desejo imediato", orderWeight: index === 0 ? 10 : 30 };
    }
    return { role: "food_hero", copyAngle: "apetite, frescor e desejo de pedir agora", orderWeight: 10 + index };
  }

  if (has([/\b(?:fashion|clothing|shirts?|dress(?:es)?|shoes?|bags?|looks?|moda|roupas?|camisas?|vestidos?|sapatos?|bolsas?)\b/])) {
    if (has([/hanger|rack|shelf|mirror|cabide|arara|prateleira|espelho/])) {
      return { role: "product_variation", copyAngle: "variedade, estilo e combinacoes disponiveis", orderWeight: 30 };
    }
    return { role: index === 0 ? "look_hero" : "material_detail", copyAngle: index === 0 ? "estilo principal e desejo de compra" : "acabamento, caimento e detalhe do produto", orderWeight: index === 0 ? 10 : 45 };
  }

  if (has([/clinic|doctor|dentist|procedure|treatment|beauty|aesthetic|saude|clinica|dentista|procedimento|tratamento|estetica/])) {
    if (has([/machine|equipment|technology|device|aparelho|equipamento|tecnologia/])) {
      return { role: "technology_detail", copyAngle: "tecnologia, seguranca e resultado esperado", orderWeight: 30 };
    }
    return { role: index === 0 ? "clinic_environment" : "procedure_context", copyAngle: index === 0 ? "confianca, acolhimento e autoridade" : "beneficio do tratamento e reducao de objecoes", orderWeight: index === 0 ? 10 : 40 };
  }

  if (has([/\b(?:cars?|vehicles?|auto|motor|wheels?|oficina|carros?|veiculos?|automotivo|rodas?)\b/])) {
    if (has([/seat|dashboard|interior|banco|painel|interno/])) {
      return { role: "interior_detail", copyAngle: "conforto, conservacao e detalhe interno", orderWeight: 35 };
    }
    return { role: index === 0 ? "vehicle_hero" : "service_detail", copyAngle: index === 0 ? "impacto do veiculo e desejo inicial" : "diferencial tecnico, estado e prova visual", orderWeight: index === 0 ? 10 : 45 };
  }

  if (has([/gym|fitness|training|workout|exercise|academia|treino|musculacao|personal/])) {
    if (has([/equipment|machine|weight|halter|aparelho|equipamento|peso/])) {
      return { role: "equipment_detail", copyAngle: "estrutura, variedade de treino e suporte", orderWeight: 35 };
    }
    return { role: index === 0 ? "gym_environment" : "class_experience", copyAngle: index === 0 ? "ambiente, energia e transformacao" : "experiencia de aula, acompanhamento e consistencia", orderWeight: index === 0 ? 10 : 45 };
  }

  return classifyPropertyPhoto(vision, index, total);
}

function classifyPropertyPhoto(vision: any, index: number, total: number): { role: string; copyAngle: string; orderWeight: number } {
  const text = [
    ...(Array.isArray(vision?.labels) ? vision.labels : []),
    ...(Array.isArray(vision?.objects) ? vision.objects : []),
    vision?.text_found || "",
  ].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const has = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));
  if (has([/swimming|pool|water|terrace|balcony|deck|outdoor|facade|building|sky|view|vista|piscina|varanda/])) {
    return { role: "hero_exterior_amenity", copyAngle: "impacto visual, estilo de vida e desejo principal", orderWeight: 10 };
  }
  if (has([/kitchen|countertop|cabinet|appliance|dining|table|gourmet|restaurant|food|meal|cozinha|mesa|gourmet/])) {
    return { role: "main_living_gourmet", copyAngle: "uso diario, conforto e experiencia do produto", orderWeight: 30 };
  }
  if (has([/bed|bedroom|suite|pillow|mattress|quarto|suite|cama/])) {
    return { role: "private_suite", copyAngle: "privacidade, descanso e padrao de acabamento", orderWeight: 45 };
  }
  if (has([/living room|sofa|couch|room|interior|stair|stairs|lounge|sala|escada/])) {
    return { role: "living_space", copyAngle: "amplitude, integracao e conforto", orderWeight: 35 };
  }
  if (has([/wardrobe|closet|clothing|hanger|shelf|mirror|closet|roupa|cabide|espelho/])) {
    return { role: "detail_storage", copyAngle: "detalhes funcionais e praticidade", orderWeight: 60 };
  }
  if (vision?.has_text) {
    return { role: "offer_information", copyAngle: "informacoes objetivas, oferta e chamada para acao", orderWeight: total > 1 ? 90 : 20 };
  }
  return { role: index === 0 ? "hero_general" : "supporting_detail", copyAngle: index === 0 ? "impacto inicial" : "diferencial complementar", orderWeight: 50 + index };
}

