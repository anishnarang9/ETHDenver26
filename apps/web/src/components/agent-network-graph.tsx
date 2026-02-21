"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSSEState, type AgentNode, type EmailEdge } from "../lib/sse-context";

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, string> = {
  spawning: "#f59e0b",
  active: "#22c55e",
  completed: "#a78bfa",
  failed: "#ef4444",
};

/* ------------------------------------------------------------------ */
/*  Graph data                                                         */
/* ------------------------------------------------------------------ */

interface GraphNode {
  id: string;
  role: string;
  status: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  color: string;
  size: number;
}

interface GraphLink {
  id: string;
  source: string;
  target: string;
  emailCount: number;
  lastTimestamp: number;
}

/* ------------------------------------------------------------------ */
/*  Canvas-based 2D force graph                                        */
/* ------------------------------------------------------------------ */

export function AgentNetworkGraph() {
  const { state, dispatch } = useSSEState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const hoveredRef = useRef<string | null>(null);
  const dragRef = useRef<{ nodeId: string } | null>(null);

  const { nodes, links } = useMemo(() => {
    const nodes: GraphNode[] = state.agentNodes.map((n: AgentNode, i: number) => {
      const existing = nodesRef.current.find((e) => e.id === n.id);
      const isPlanner = n.id === "planner";
      return {
        id: n.id,
        role: n.role,
        status: n.status,
        x: existing?.x ?? (isPlanner ? 0 : Math.cos((i / Math.max(state.agentNodes.length, 1)) * Math.PI * 2) * 150 + (Math.random() - 0.5) * 40),
        y: existing?.y ?? (isPlanner ? 0 : Math.sin((i / Math.max(state.agentNodes.length, 1)) * Math.PI * 2) * 150 + (Math.random() - 0.5) * 40),
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        color: STATUS_COLORS[n.status] || "#64748b",
        size: isPlanner ? 24 : 16,
      };
    });

    const edgeMap = new Map<string, GraphLink>();
    for (const edge of state.emailEdges) {
      const key = [edge.fromAgentId, edge.toAgentId].sort().join("--");
      const existing = edgeMap.get(key);
      if (existing) {
        existing.emailCount++;
        existing.lastTimestamp = Math.max(existing.lastTimestamp, edge.timestamp);
      } else {
        edgeMap.set(key, {
          id: key,
          source: edge.fromAgentId,
          target: edge.toAgentId,
          emailCount: 1,
          lastTimestamp: edge.timestamp,
        });
      }
    }

    return { nodes, links: Array.from(edgeMap.values()) };
  }, [state.agentNodes, state.emailEdges]);

  useEffect(() => {
    const prevMap = new Map(nodesRef.current.map((n) => [n.id, n]));
    for (const node of nodes) {
      const prev = prevMap.get(node.id);
      if (prev) {
        node.x = prev.x;
        node.y = prev.y;
        node.vx = prev.vx;
        node.vy = prev.vy;
      }
    }
    nodesRef.current = nodes;
    linksRef.current = links;
  }, [nodes, links]);

  const simulate = useCallback(() => {
    const ns = nodesRef.current;
    const ls = linksRef.current;
    const alpha = 0.3;
    const repulsion = 3000;
    const attraction = 0.005;
    const centerForce = 0.01;

    for (const node of ns) {
      node.vx = (node.vx || 0) - (node.x || 0) * centerForce;
      node.vy = (node.vy || 0) - (node.y || 0) * centerForce;

      for (const other of ns) {
        if (node.id === other.id) continue;
        const dx = (node.x || 0) - (other.x || 0);
        const dy = (node.y || 0) - (other.y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        node.vx! += (dx / dist) * force * alpha;
        node.vy! += (dy / dist) * force * alpha;
      }
    }

    for (const link of ls) {
      const source = ns.find((n) => n.id === link.source);
      const target = ns.find((n) => n.id === link.target);
      if (!source || !target) continue;
      const dx = (target.x || 0) - (source.x || 0);
      const dy = (target.y || 0) - (source.y || 0);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - 120) * attraction;
      source.vx! += dx * force * alpha;
      source.vy! += dy * force * alpha;
      target.vx! -= dx * force * alpha;
      target.vy! -= dy * force * alpha;
    }

    for (const node of ns) {
      if (dragRef.current?.nodeId === node.id) continue;
      node.vx! *= 0.6;
      node.vy! *= 0.6;
      node.x = (node.x || 0) + (node.vx || 0);
      node.y = (node.y || 0) + (node.vy || 0);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const cx = rect.width / 2;
      const cy = rect.height / 2;

      simulate();
      ctx.clearRect(0, 0, rect.width, rect.height);

      const ns = nodesRef.current;
      const ls = linksRef.current;
      const now = Date.now();

      // Draw edges
      for (const link of ls) {
        const source = ns.find((n) => n.id === link.source);
        const target = ns.find((n) => n.id === link.target);
        if (!source || !target) continue;

        const sx = cx + (source.x || 0);
        const sy = cy + (source.y || 0);
        const tx = cx + (target.x || 0);
        const ty = cy + (target.y || 0);

        const age = now - link.lastTimestamp;
        const isRecent = age < 5000;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = isRecent ? "rgba(129, 140, 248, 0.8)" : "rgba(100, 116, 139, 0.3)";
        ctx.lineWidth = Math.min(link.emailCount, 4);
        ctx.stroke();

        // Animated particle traveling along edge for recent emails
        if (isRecent) {
          const progress = (age % 1500) / 1500;
          const px = sx + (tx - sx) * progress;
          const py = sy + (ty - sy) * progress;

          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#818cf8";
          ctx.shadowColor = "#818cf8";
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Email pop burst at midpoint for brand-new emails (< 2.5s)
        if (isRecent && age < 2500) {
          const mx = (sx + tx) / 2;
          const my = (sy + ty) / 2;
          const popProgress = age / 2500;

          // Expanding ring
          const ringRadius = 8 + popProgress * 30;
          const ringAlpha = Math.max(0, 1 - popProgress * 1.3);
          ctx.beginPath();
          ctx.arc(mx, my, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(129, 140, 248, ${(ringAlpha * 0.5).toFixed(2)})`;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Inner glow dot
          const dotAlpha = Math.max(0, 1 - popProgress * 1.5);
          const dotSize = popProgress < 0.1 ? (popProgress / 0.1) * 6 : 6 * (1 - popProgress * 0.5);
          ctx.beginPath();
          ctx.arc(mx, my, Math.max(dotSize, 1), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(129, 140, 248, ${dotAlpha.toFixed(2)})`;
          ctx.shadowColor = "#818cf8";
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;

          // Mail emoji pop
          const envAlpha = Math.max(0, 1 - popProgress * 1.2);
          if (envAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = envAlpha;
            const envSize = popProgress < 0.12 ? 10 + (popProgress / 0.12) * 6 : 16 - popProgress * 4;
            ctx.font = `${Math.max(envSize, 8)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("\u2709", mx, my - 12);
            ctx.restore();
          }
        }

        // Email count label
        if (link.emailCount > 0) {
          const mx = (sx + tx) / 2;
          const my = (sy + ty) / 2;
          ctx.font = "10px Inter, sans-serif";
          ctx.fillStyle = "#64748b";
          ctx.textAlign = "center";
          ctx.fillText(String(link.emailCount), mx, my - 6);
        }
      }

      // Draw nodes
      for (const node of ns) {
        const nx = cx + (node.x || 0);
        const ny = cy + (node.y || 0);
        const isHovered = hoveredRef.current === node.id;
        const isSelected = state.selectedNodeId === node.id;
        const size = node.size * (isHovered ? 1.2 : 1);

        // Glow
        if (node.status === "active" || isSelected) {
          ctx.beginPath();
          ctx.arc(nx, ny, size + 8, 0, Math.PI * 2);
          const glow = ctx.createRadialGradient(nx, ny, size, nx, ny, size + 12);
          glow.addColorStop(0, node.color + "40");
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Selection ring
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(nx, ny, size + 4, 0, Math.PI * 2);
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(nx, ny, size, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(nx - size * 0.3, ny - size * 0.3, 0, nx, ny, size);
        gradient.addColorStop(0, node.color + "dd");
        gradient.addColorStop(1, node.color + "88");
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Role label
        ctx.font = (isHovered ? "bold " : "") + "11px Inter, sans-serif";
        ctx.fillStyle = "#e2e8f0";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const label = node.id === "planner" ? "Orchestrator" : node.role;
        ctx.fillText(label, nx, ny + size + 6);

        // Status dot
        ctx.beginPath();
        ctx.arc(nx + size * 0.7, ny - size * 0.7, 4, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();
        ctx.strokeStyle = "#0a0a0f";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [simulate, state.selectedNodeId]);

  const handleCanvasEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>, eventType: "move" | "down" | "up") => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ns = nodesRef.current;

      let hitNode: GraphNode | null = null;
      for (const node of ns) {
        const nx = cx + (node.x || 0);
        const ny = cy + (node.y || 0);
        const dist = Math.sqrt((mx - nx) ** 2 + (my - ny) ** 2);
        if (dist < node.size + 4) {
          hitNode = node;
          break;
        }
      }

      if (eventType === "move") {
        hoveredRef.current = hitNode?.id || null;
        canvas.style.cursor = hitNode ? "pointer" : "default";
        if (dragRef.current) {
          const node = ns.find((n) => n.id === dragRef.current!.nodeId);
          if (node) {
            node.x = mx - cx;
            node.y = my - cy;
          }
        }
      } else if (eventType === "down" && hitNode) {
        dragRef.current = { nodeId: hitNode.id };
      } else if (eventType === "up") {
        if (dragRef.current && hitNode && dragRef.current.nodeId === hitNode.id) {
          dispatch({ type: "SELECT_NODE", nodeId: hitNode.id === state.selectedNodeId ? null : hitNode.id });
        } else if (!hitNode && !dragRef.current) {
          const ls = linksRef.current;
          for (const link of ls) {
            const source = ns.find((n) => n.id === link.source);
            const target = ns.find((n) => n.id === link.target);
            if (!source || !target) continue;
            const sx = cx + (source.x || 0), sy = cy + (source.y || 0);
            const tx = cx + (target.x || 0), ty = cy + (target.y || 0);
            const len = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2) || 1;
            const d = Math.abs((ty - sy) * mx - (tx - sx) * my + tx * sy - ty * sx) / len;
            const t = ((mx - sx) * (tx - sx) + (my - sy) * (ty - sy)) / (len * len);
            if (d < 8 && t > 0 && t < 1) {
              dispatch({ type: "SELECT_EDGE", edgeId: link.id });
              dragRef.current = null;
              return;
            }
          }
          dispatch({ type: "SELECT_NODE", nodeId: null });
        }
        dragRef.current = null;
      }
    },
    [dispatch, state.selectedNodeId],
  );

  return (
    <div
      style={{
        background: "linear-gradient(180deg, #0c0c14 0%, #0a0a0f 100%)",
        borderRadius: 12,
        border: "1px solid #1e293b",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(100,116,139,0.08) 1px, transparent 0)",
          backgroundSize: "24px 24px",
          pointerEvents: "none",
        }}
      />
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
        onMouseMove={(e) => handleCanvasEvent(e, "move")}
        onMouseDown={(e) => handleCanvasEvent(e, "down")}
        onMouseUp={(e) => handleCanvasEvent(e, "up")}
      />
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 12,
          display: "flex",
          gap: 12,
          fontSize: "0.65rem",
          color: "#64748b",
        }}
      >
        {Object.entries(STATUS_COLORS).map(([label, color]) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
