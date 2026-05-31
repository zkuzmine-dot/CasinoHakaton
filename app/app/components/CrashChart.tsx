"use client";

import { useEffect, useRef } from "react";
import { useGameStore, GamePhase } from "../store/gameStore";

const K = 0.00006; // must match useGame.ts calcMultiplier

function elapsedFromMultiplier(m: number): number {
  return Math.log(Math.max(m, 1)) / K;
}

function phaseColor(phase: GamePhase): string {
  return phase === "crashed" ? "#ff4757" : "#00ff88";
}

export default function CrashChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const phase = useGameStore((s) => s.phase);
  const multiplier = useGameStore((s) => s.multiplier);
  const crashPoint = useGameStore((s) => s.crashPoint);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function draw() {
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const W = canvas!.offsetWidth;
      const H = canvas!.offsetHeight;
      if (W === 0 || H === 0) return;

      // Sync canvas buffer to physical pixels
      const pw = Math.round(W * dpr);
      const ph = Math.round(H * dpr);
      if (canvas!.width !== pw || canvas!.height !== ph) {
        canvas!.width = pw;
        canvas!.height = ph;
      }
      // Set exact DPR transform every frame (never accumulate)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const PAD = { top: 20, right: 20, bottom: 40, left: 55 };
      const plotW = W - PAD.left - PAD.right;
      const plotH = H - PAD.top - PAD.bottom;

      const currentMultiplier = phase === "idle" || phase === "waiting" ? 1.0 : multiplier;
      const maxMultiplier = Math.max(currentMultiplier * 1.15, 2.0);

      const maxElapsed = elapsedFromMultiplier(maxMultiplier);

      const toX = (m: number) =>
        PAD.left + (elapsedFromMultiplier(m) / Math.max(maxElapsed, 1)) * plotW;

      const toY = (m: number) => {
        const logM = Math.log(Math.max(m, 1));
        const logMax = Math.log(Math.max(maxMultiplier, 1.01));
        return PAD.top + plotH * (1 - logM / logMax);
      };

      // ── clear ─────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#0d0f14";
      ctx.fillRect(0, 0, W, H);

      // ── grid lines ────────────────────────────────────────────
      const gridMultipliers = [1, 1.5, 2, 3, 5, 10, 20, 50, 100].filter(
        (v) => v <= maxMultiplier
      );
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.font = "11px monospace";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.3)";

      gridMultipliers.forEach((gm) => {
        const y = toY(gm);
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(W - PAD.right, y);
        ctx.stroke();
        ctx.fillText(`${gm.toFixed(gm < 10 ? 2 : 0)}x`, PAD.left - 6, y + 4);
      });

      // Vertical time guides
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      for (let i = 0; i <= 4; i++) {
        const x = PAD.left + (i / 4) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, PAD.top);
        ctx.lineTo(x, H - PAD.bottom);
        ctx.stroke();
      }

      // ── curve ─────────────────────────────────────────────────
      if (phase === "idle" || phase === "waiting") {
        ctx.save();
        ctx.strokeStyle = "rgba(0,255,136,0.12)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(toX(1), toY(1));
        let m = 1.0;
        while (m < maxMultiplier) {
          m = Math.min(m * 1.02, maxMultiplier);
          ctx.lineTo(toX(m), toY(m));
        }
        ctx.stroke();
        ctx.restore();
        return;
      }

      const color = phaseColor(phase);
      const endM = phase === "crashed" && crashPoint ? crashPoint : currentMultiplier;

      const points: Array<{ x: number; y: number }> = [];
      let m = 1.0;
      const step = endM / 120;
      while (m <= endM) {
        points.push({ x: toX(m), y: toY(m) });
        m += Math.max(step, 0.001);
      }
      points.push({ x: toX(endM), y: toY(endM) });

      if (points.length < 2) return;

      // Glow layers
      [6, 3, 1].forEach((blur) => {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = blur * 5;
        ctx.strokeStyle = color;
        ctx.lineWidth = blur === 1 ? 2.5 : 1;
        ctx.globalAlpha = blur === 1 ? 1 : 0.25;
        ctx.lineJoin = "round";
        ctx.beginPath();
        points.forEach((p, i) =>
          i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
        );
        ctx.stroke();
        ctx.restore();
      });

      // Fill under curve
      ctx.save();
      ctx.beginPath();
      points.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
      );
      const last = points[points.length - 1];
      ctx.lineTo(last.x, H - PAD.bottom);
      ctx.lineTo(PAD.left, H - PAD.bottom);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
      grad.addColorStop(0, `${color}20`);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      // Endpoint dot
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Crashed dashed line
      if (phase === "crashed" && crashPoint) {
        const cy = toY(crashPoint);
        ctx.save();
        ctx.strokeStyle = "#ff475780";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(PAD.left, cy);
        ctx.lineTo(W - PAD.right, cy);
        ctx.stroke();
        ctx.restore();
      }
    }

    draw();

    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [phase, multiplier, crashPoint]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: "block" }}
    />
  );
}
