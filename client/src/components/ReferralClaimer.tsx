import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";

/**
 * Programa de parceiros: quem entra por Google nao passa pelo formulario de
 * cadastro, entao o codigo de ?ref= (guardado em localStorage como `mp_ref`)
 * e vinculado aqui, assim que a pessoa estiver logada. O servidor ignora
 * codigo invalido, usuario ja vinculado ou que ja assina, e nunca falha o login.
 * Depois de qualquer resposta o codigo e apagado para nao ser reaplicado.
 */
export default function ReferralClaimer() {
  const { isAuthenticated } = useAuth();
  const claim = (trpc as any).affiliates?.claim?.useMutation?.({
    onSettled: () => { try { window.localStorage.removeItem("mp_ref"); } catch { /* storage indisponivel */ } },
  });

  useEffect(() => {
    if (!isAuthenticated || !claim?.mutate) return;
    let code = "";
    try { code = window.localStorage.getItem("mp_ref") || ""; } catch { return; }
    if (code.length >= 3) claim.mutate({ code });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return null;
}
