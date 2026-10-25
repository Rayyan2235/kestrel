import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import { WelcomePage } from "./welcome/WelcomePage";
import "./styles/global.css";

const Console = lazy(() =>
  import("./sandbox/SandboxApp").then(({ SandboxApp }) => ({
    default: SandboxApp,
  })),
);
const TwoBotDemo = lazy(() =>
  import("./demo/TwoBotDemo").then(({ TwoBotDemo }) => ({
    default: TwoBotDemo,
  })),
);
const path = window.location.pathname.replace(/\/$/, "");
const inConsole =
  path === "/console" || path === "/lab" || path.startsWith("/lab/");
const demo =
  new URLSearchParams(window.location.search).get("demo") === "two-bot";
if (inConsole) document.title = "Kestrel — Console";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Suspense
    fallback={
      <div className="scene-fallback" role="status">
        Opening Kestrel…
      </div>
    }
  >
    {/* MuJoCo and ONNX initialize once; keep the console outside StrictMode. */}
    {inConsole ? (
      <Console />
    ) : (
      <React.StrictMode>
        {demo ? <TwoBotDemo /> : <WelcomePage />}
      </React.StrictMode>
    )}
  </Suspense>,
);
