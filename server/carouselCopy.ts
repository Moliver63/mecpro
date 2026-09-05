import type { CampaignFacts } from "./campaignFactGuard";
import { normalizeCopyText, trimCopyField } from "../shared/campaignCopyQuality";

export interface CarouselCopyAngle {
  headline: string;
  description: string;
  copy: string;
  hook: string;
  pain: string;
  solution: string;
  cta: string;
}

/** Finished ad messages: operational instructions belong in prompts, never here. */
export function buildRealEstateCarouselAngles(facts: CampaignFacts, city = ""): CarouselCopyAngle[] {
  const estate = facts.realEstate;
  const type = estate.propertyType || "imóvel";
  const commercial = type === "sala comercial";
  const purposes: Record<string, string> = { locacao: "locação", venda: "venda", temporada: "locação por temporada" };
  const purpose = purposes[estate.purpose || ""];
  const area = estate.areaM2 || "";
  const address = estate.address || "";
  const location = [address, city].filter(Boolean).join(", ");
  const features = estate.structuralFeatures.filter(Boolean);
  const condition = [estate.price, estate.includedFees].filter(Boolean).join(", ");
  const summary = [type + (purpose ? " para " + purpose : "") + (area ? " com " + area : ""), location].filter(Boolean).join(", ");
  const offer = condition ? "Valor: " + condition + "." : "Converse com a equipe sobre as condições.";
  const visit = "Fale com a equipe e agende sua visita.";
  const title = (candidate: string, fallback: string) =>
    normalizeCopyText(candidate).length <= 40 ? normalizeCopyText(candidate) : fallback;
  const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  const details = features.length ? "O espaço conta com " + features.join(", ") + "." : "Conheça os detalhes do imóvel durante a visita.";
  const usage = estate.usagePossibilities.length
    ? "Avalie o espaço para " + estate.usagePossibilities.join(", ") + "."
    : commercial ? "Avalie como o espaço pode atender à rotina da sua atividade profissional." : "Avalie como o espaço se encaixa no seu dia a dia.";
  const rows = [
    {
      headline: title(capitalize(type + (purpose ? " para " + purpose : "")), "Conheça este imóvel"),
      description: area || "Conheça os detalhes",
      copy: [commercial ? "Seu próximo espaço profissional pode estar aqui." : "Um novo espaço para os seus planos.", capitalize(summary) + ".", offer, visit],
    },
    {
      headline: title(address || city || "Veja a localização", "Conheça a localização"),
      description: city && address ? city : "Endereço para sua visita",
      copy: ["A localização faz parte da sua escolha.", location ? "Conheça o imóvel em " + location + "." : "Converse com a equipe sobre a localização do imóvel.", area ? "São " + area + " para avaliar pessoalmente." : "", visit],
    },
    {
      headline: title(capitalize(features[0] || "Conheça a estrutura"), "Conheça a estrutura"),
      description: "Detalhes para sua rotina",
      copy: ["O que você procura na estrutura do seu próximo espaço?", details, capitalize(summary) + ".", visit],
    },
    {
      headline: title(condition || "Converse sobre as condições", "Veja o valor do imóvel"),
      description: "Planeje o próximo passo",
      copy: ["Planeje o custo do seu próximo espaço.", offer, capitalize(summary) + ".", "Tire suas dúvidas com a equipe e agende uma visita."],
    },
    {
      headline: title(area ? area + " para conhecer de perto" : "Veja como o espaço se distribui", "Conheça a área do imóvel"),
      description: "Compare o espaço disponível",
      copy: [area ? area + " para você avaliar de perto." : "Veja como o espaço se encaixa nos seus planos.", capitalize(summary) + ".", usage, visit],
    },
    {
      headline: commercial ? "Espaço para sua atividade" : "Um espaço para o seu dia a dia",
      description: "Avalie o uso do imóvel",
      copy: ["Como esse espaço se encaixa no seu dia a dia?", usage, details, visit],
    },
    {
      headline: "Detalhes para conhecer na visita",
      description: "Veja pessoalmente",
      copy: ["Os detalhes fazem diferença na escolha.", details, estate.furnished ? "Imóvel " + estate.furnished + "." : "", capitalize(summary) + ".", visit],
    },
    {
      headline: "Conheça antes de decidir",
      description: "Reserve um horário",
      copy: ["Conheça pessoalmente antes de decidir.", "Visite o imóvel" + (location ? " em " + location : "") + " e avalie o espaço para os seus planos.", offer, visit],
    },
    {
      headline: "Tire suas dúvidas sobre o imóvel",
      description: "Converse com a equipe",
      copy: ["Ficou alguma dúvida sobre o imóvel?", capitalize(summary) + ".", offer, "Converse com a equipe sobre os detalhes e combine sua visita."],
    },
    {
      headline: "Vamos agendar sua visita?",
      description: "Conheça seu próximo espaço",
      copy: ["Vamos combinar sua visita?", capitalize(summary) + ".", offer, "Conheça o espaço de perto e avalie se ele atende ao que você procura.", visit],
    },
  ];
  return rows.map((row) => ({
    headline: trimCopyField(row.headline, 40),
    description: trimCopyField(row.description, 30),
    copy: normalizeCopyText(row.copy.filter(Boolean).join(" ")),
    hook: row.headline,
    pain: commercial ? "Encontrar um espaço adequado à rotina profissional." : "Encontrar um imóvel adequado aos seus planos.",
    solution: normalizeCopyText(capitalize(summary) + ". " + offer),
    cta: "Agendar visita",
  }));
}
