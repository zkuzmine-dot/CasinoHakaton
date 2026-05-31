"use client";

import { useEffect, useRef, useCallback } from "react";
import { useGameStore, GamePhase } from "../store/gameStore";

interface Point {
  x: number;
  y: number;
}

const HISTORY_POINTS = 200;

function phaseColor(phase: GamePhase): string {
  if (phase === "crashed") return "#ff4757";
  if (phase === "cashed_out") return "#00ff88";
  return "#00ff88";
}

export default function CrashChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Point[]>([]);
  const animFrameRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);

  const phase = useGameStore((s) => s.phase);
  const multiplier = useGameStore((s) => s.multiplier);
  const crashPoint = useGameStore((s) => s.crashPoint);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const PAD = { top: 20, right: 20, bottom: 40, left: 55 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    // Background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0d0f14";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    const gridLines = [1, 1.5, 2, 3, 5, 10];
    const maxMultiplier = Math.max(multiplier * 1.1, 2);

    gridLines.forEach((gm) => {
      if (gm > maxMultiplier) return;
      const yPct = 1 - Math.log(gm) / Math.log(maxMultiplier);
      const y = PAD.top + yPct * plotH;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "11px Inter, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${gm.toFixed(2)}x`, PAD.left - 6, y + 4);
    });

    // Time axis
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i <= 5; i++) {
      const x = PAD.left + (i / 5) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, H - PAD.bottom);
      ctx.stroke();
    }

    if (pointsRef.current.length < 2) return;

    const color = phaseColor(phase);

    // Glowing curve
    const pts = pointsRef.current;
    const maxX = pts[pts.length - 1].x;

    const toCanvasX = (px: number) => PAD.left + (px / Math.max(maxX, 1)) * plotW;
    const toCanvasY = (pm: number) => {
      const logM = Math.log(Math.max(pm, 1));
      const logMax = Math.log(Math.max(maxMultiplier, 1.01));
      return PAD.top + plotH - (logM / logMax) * plotH;
    };

    // Glow layers
    [8, 4, 2, 1].forEach((blur) => {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = blur * 4;
      ctx.strokeStyle = color;
      ctx.lineWidth = blur === 1 ? 2.5 : 1;
      ctx.globalAlpha = blur === 1 ? 1 : 0.3 / blur;

      ctx.beginPath();
      pts.forEach((pt, i) => {
        const cx = toCanvasX(pt.x);
        const cy = toCanvasY(pt.y);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
      ctx.restore();
    });

    // Fill under curve
    ctx.save();
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const cx = toCanvasX(pt.x);
      const cy = toCanvasY(pt.y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.lineTo(toCanvasX(pts[pts.length - 1].x), H - PAD.bottom);
    ctx.lineTo(PAD.left, H - PAD.bottom);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
    grad.addColorStop(0, `${color}22`);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Current multiplier dot
    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      const cx = toCanvasX(last.x);
      const cy = toCanvasY(last.y);

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Crashed line
    if (phase === "crashed" && crashPoint) {
      const cy = toCanvasY(crashPoint);
      ctx.save();
      ctx.strokeStyle = "#ff4757";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(PAD.left, cy);
      ctx.lineTo(W - PAD.right, cy);
      ctx.stroke();
      ctx.restore();
    }
  }, [phase, multiplier, crashPoint]);

  // Accumulate points when flying
  useEffect(() => {
    if (phase === "waiting" || phase === "idle") {
      pointsRef.current = [];
      lastTickRef.current = 0;
    }

    if (phase === "flying" || phase === "crashed" || phase === "cashed_out") {
      const now = performance.now();
      if (lastTickRef.current === 0) lastTickRef.current = now;
      const elapsed = now - lastTickRef.current;

      // Only add point every ~50ms to keep array size manageable
      if (elapsed > 40 || pointsRef.current.length === 0) {
        lastTickRef.current = now;
        const totalElapsed = pointsRef.current.length > 0
          ? pointsRef.current[pointsRef.current.length - 1].x + elapsed
          : 0;
        pointsRef.current = [
          ...pointsRef.current,
          { x: totalElapsed, y: multiplier },
        ].slice(-HISTORY_POINTS);
      }
    }

    draw();
  }, [phase, multiplier, draw]);

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      const ctx = canvas.getContext("2d");
      ctx?.scale(window.devicePixelRatio, window.devicePixelRatio);
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: "block" }}
    />
  );
}
