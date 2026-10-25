import ReactDOM from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import { SandboxApp } from "./SandboxApp";
import "../styles/global.css";
// No StrictMode here: its double effect run would boot two MuJoCo/ONNX runtimes.
ReactDOM.createRoot(document.getElementById("root")!).render(<SandboxApp />);
