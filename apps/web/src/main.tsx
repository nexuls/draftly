import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles/fonts.css";
import "./styles/globals.css";

import { App } from "./app";

const container = document.getElementById("root");
if (!container) throw new Error("No #root element — index.html is out of sync with main.tsx.");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
