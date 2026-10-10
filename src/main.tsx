import "@/themes/store"; // applies the saved theme before first paint
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { audio } from "@/game/audio";

// Browsers (and the Android WebView) only allow audio after a user gesture.
audio.installAutoUnlock();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
