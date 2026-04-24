export interface LandingOfferProps {
  annualPrice: string;
  creditValue: string;   // líquido (60% bruto − 10% taxa)
  creditGross: string;   // 60% bruto
  creditFee:   string;   // 10% taxa
  signupUrl: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}
