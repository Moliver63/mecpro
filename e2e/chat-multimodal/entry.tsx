// Harness de teste: monta o componente REAL do chat (mesmo hook e mesma view da tela inicial).
import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import ChatHomeView from "@/components/shared/ChatHomeView";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}><ChatHomeView /></div>
);
