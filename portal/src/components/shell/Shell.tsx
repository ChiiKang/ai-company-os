import type { ReactNode } from "react";
import { Rail } from "./Sidebar";
import { Starfield } from "./Starfield";
import "./shell.css";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <div className="bg-glow" aria-hidden="true" />
      <Starfield />
      <Rail />
      <main className="main">
        <div className="main-inner">{children}</div>
      </main>
    </div>
  );
}
