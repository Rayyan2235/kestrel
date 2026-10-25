import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import { App } from "./App";
import { TwoBotDemo } from "./demo/TwoBotDemo";
import "./styles/global.css";
// ?demo=two-bot opens the temporary two-bot conversation demo;
// ?demo=progress adds challenges, XP and the Workshop on top of it.
const demo = new URLSearchParams(window.location.search).get("demo");
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {demo === "two-bot" ? (
      <TwoBotDemo />
    ) : demo === "progress" ? (
      <TwoBotDemo progress />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
