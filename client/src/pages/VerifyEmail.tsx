/**
 * client/src/pages/VerifyEmail.tsx
 * Compatível com: GET /api/auth/verify-email?token=XXX (index.ts)
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";

type Status = "loading" | "success" | "error" | "missing";

export default function VerifyEmail() {
  const [status, setStatus]   = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [, navigate]          = useLocation();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");

    if (!token) {
      setStatus("missing");
      return;
    }

    async function verify() {
      try {
        // index.ts usa GET /api/auth/verify-email?token=
        const res  = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token!)}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          setStatus("error");
          setMessage(data.error ?? "Falha na verificação.");
        } else {
          setStatus("success");
        }
      } catch {
        setStatus("error");
        setMessage("Erro de conexão. Tente novamente.");
      }
    }

    verify();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10
                      max-w-md w-full text-center">

        {/* Loading */}
        {status === "loading" && (
          <>
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center
                            justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-indigo-500 animate-spin"
                   fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10"
                        stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-800 mb-2">
              Verificando seu email…
            </h1>
            <p className="text-gray-500 text-sm">Aguarde um instante.</p>
          </>
        )}

        {/* Sucesso */}
        {status === "success" && (
          <>
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center
                            justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-green-500" fill="none"
                   stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                      strokeWidth={2.5} d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-800 mb-2">
              Email verificado! 🎉
            </h1>
            <p className="text-gray-500 text-sm mb-8">
              Sua conta está ativa. Você já pode acessar a plataforma.
            </p>
            <button
              onClick={() => navigate("/dashboard")}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white
                         font-semibold py-3 rounded-lg transition-colors"
            >
              Ir para o Dashboard
            </button>
          </>
        )}

        {/* Erro */}
        {status === "error" && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center
                            justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-500" fill="none"
                   stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                      strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-800 mb-2">
              Falha na verificação
            </h1>
            <p className="text-gray-500 text-sm mb-8">{message}</p>
            <button
              onClick={() => navigate("/login")}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white
                         font-semibold py-3 rounded-lg transition-colors"
            >
              Voltar ao login
            </button>
          </>
        )}

        {/* Token ausente */}
        {status === "missing" && (
          <>
            <div className="w-16 h-16 rounded-full bg-yellow-50 flex items-center
                            justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-yellow-500" fill="none"
                   stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94
                     a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-800 mb-2">
              Link inválido
            </h1>
            <p className="text-gray-500 text-sm mb-8">
              O link de verificação está incompleto ou foi copiado incorretamente.
              Verifique seu email e tente novamente.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white
                         font-semibold py-3 rounded-lg transition-colors"
            >
              Voltar ao login
            </button>
          </>
        )}

      </div>
    </div>
  );
}
