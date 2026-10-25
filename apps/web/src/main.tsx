import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import { App } from "./App";
import { TwoBotDemo } from "./demo/TwoBotDemo";
import "./styles/global.css";
// ?demo=two-bot opens the temporary two-bot conversation demo.
const demo = new URLSearchParams(window.location.search).get("demo");
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {demo === "two-bot" ? <TwoBotDemo /> : <App />}
  </React.StrictMode>,
);
