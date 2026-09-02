import { useEffect, useRef } from "react";

/** Subtle animated starfield behind the dark theme. Bounded: ≤160 stars, pauses when hidden or reduced-motion. */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    const stars: { x: number; y: number; r: number; a: number; s: number }[] = [];
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars.length = 0;
      const n = Math.min(160, Math.floor((w * h) / 9000));
      for (let i = 0; i < n; i++) stars.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.1 + 0.2, a: Math.random(), s: 0.002 + Math.random() * 0.004 });
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const st of stars) {
        const tw = reduce ? 0.7 : 0.55 + 0.45 * Math.sin(t * st.s + st.a * 6.28);
        ctx.globalAlpha = 0.25 + 0.6 * tw;
        ctx.fillStyle = "#c9d1ff";
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce && !document.hidden) raf = requestAnimationFrame(draw);
    };
    resize();
    draw(0);
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return (
    <div className="starfield" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
