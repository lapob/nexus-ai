import { graphEdges, graphNodes, nodeById } from './graph-data.js';
import { GraphCamera } from './graph-camera.js';
import { clamp, motionQuery } from '../utils/motion.js';

const COLORS = { core: '#f2a65a', memory: '#b98455', vault: '#e69a52', agents: '#c0785c', projects: '#de7c38', research: '#a98c78', university: '#bd8c69', cybersecurity: '#cb7550', models: '#b98e67', labs: '#9d7d68' };

export class GraphEngine extends EventTarget {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.camera = new GraphCamera();
    this.metrics = { width: 1, height: 1, left: 0, top: 0, dpr: 1 };
    this.frame = 0;
    this.lastTime = 0;
    this.selected = null;
    this.hovered = null;
    this.pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.stars = Array.from({ length: 150 }, (_, index) => ({ x: ((index * 73) % 997) / 997, y: ((index * 131) % 991) / 991, r: .2 + (index % 5) * .15, phase: index * .37, depth: .2 + (index % 7) / 8 }));
    this.coreParticles = Array.from({ length: 480 }, (_, index) => {
      const phi = Math.acos(1 - 2 * (index + .5) / 480);
      const theta = Math.PI * (1 + Math.sqrt(5)) * index;
      return { x: Math.cos(theta) * Math.sin(phi), y: Math.sin(theta) * Math.sin(phi) * .84, z: Math.cos(phi), phase: theta + phi };
    });
    this.filaments = Array.from({ length: 18 }, (_, index) => ({ phase: index * .77, radius: .52 + (index % 6) * .075, speed: .35 + (index % 5) * .045 }));
    this.render = this.render.bind(this);
    this.handleVisibility = this.handleVisibility.bind(this);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.metrics = { width: bounds.width, height: bounds.height, left: bounds.left, top: bounds.top, dpr };
    this.canvas.width = Math.max(1, Math.round(bounds.width * dpr));
    this.canvas.height = Math.max(1, Math.round(bounds.height * dpr));
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (motionQuery.matches) this.draw(performance.now());
  }

  point(node, time = 0) {
    const { width, height } = this.metrics;
    const drift = motionQuery.matches || node.id === 'core' ? 0 : Math.sin(time * .0001 + node.x * 20) * 2.5;
    return {
      x: node.x * width * this.camera.current.zoom + this.camera.current.x + drift,
      y: node.y * height * this.camera.current.zoom + this.camera.current.y + drift * .55,
      size: (node.id === 'core' ? clamp(width * .095, 130, 190) : 34 + node.importance * 30) * this.camera.current.zoom
    };
  }

  pick(x, y) {
    return [...graphNodes].sort((a, b) => b.importance - a.importance).find((node) => {
      const point = this.point(node, performance.now());
      return Math.hypot(x - point.x, y - point.y) <= Math.max(24, point.size * (node.id === 'core' ? .8 : .55));
    });
  }

  select(node, { chatOpen = false, focus = true } = {}) {
    this.selected = node;
    if (focus) this.camera.focus(node, this.metrics, chatOpen);
    this.dispatchEvent(new CustomEvent('selectionchange', { detail: node }));
    if (motionQuery.matches) this.draw(performance.now());
  }

  clearSelection() {
    this.selected = null;
    this.camera.restore();
    this.dispatchEvent(new CustomEvent('selectionchange', { detail: null }));
  }

  setHovered(node) { this.hovered = node; }

  draw(time) {
    const ctx = this.context;
    const { width, height } = this.metrics;
    const seconds = motionQuery.matches ? 0 : time * .0002;
    ctx.clearRect(0, 0, width, height);
    const field = ctx.createRadialGradient(width * .44, height * .48, 0, width * .44, height * .48, width * .44);
    field.addColorStop(0, 'rgba(120,45,16,.11)'); field.addColorStop(.5, 'rgba(55,22,18,.035)'); field.addColorStop(1, 'transparent');
    ctx.fillStyle = field; ctx.fillRect(0, 0, width, height);

    for (const star of this.stars) {
      const parallaxX = this.pointer.x * star.depth * .004;
      const parallaxY = this.pointer.y * star.depth * .004;
      ctx.fillStyle = `rgba(225,205,192,${.045 + star.depth * .08 + Math.sin(seconds + star.phase) * .015})`;
      ctx.beginPath(); ctx.arc(star.x * width + parallaxX, star.y * height + parallaxY, star.r, 0, Math.PI * 2); ctx.fill();
    }

    const points = new Map(graphNodes.map((node) => [node.id, this.point(node, time)]));
    for (const [index, [sourceId, targetId]] of graphEdges.entries()) {
      const source = points.get(sourceId); const target = points.get(targetId); const targetNode = nodeById.get(targetId);
      const relevant = !this.selected || this.selected.id === 'core' || [sourceId, targetId].includes(this.selected.id);
      const cx = (source.x + target.x) / 2 + Math.sin(index * 1.9) * 26;
      const cy = (source.y + target.y) / 2 - Math.cos(index * 1.4) * 18;
      ctx.globalAlpha = relevant ? 1 : .36;
      const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
      gradient.addColorStop(0, 'rgba(242,166,90,.26)'); gradient.addColorStop(1, `${COLORS[targetNode.id]}35`);
      ctx.strokeStyle = gradient; ctx.lineWidth = relevant ? .85 : .55;
      ctx.beginPath(); ctx.moveTo(source.x, source.y); ctx.quadraticCurveTo(cx, cy, target.x, target.y); ctx.stroke();
      if (!motionQuery.matches && relevant) {
        const progress = (seconds * .18 + index * .09) % 1; const inverse = 1 - progress;
        const x = inverse * inverse * source.x + 2 * inverse * progress * cx + progress * progress * target.x;
        const y = inverse * inverse * source.y + 2 * inverse * progress * cy + progress * progress * target.y;
        ctx.fillStyle = COLORS[targetNode.id]; ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const core = points.get('core'); const breathe = motionQuery.matches ? 1 : 1 + Math.sin(seconds * 1.2) * .018; const radius = core.size * breathe;
    const glow = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, radius * 1.45);
    glow.addColorStop(0, 'rgba(242,166,90,.13)'); glow.addColorStop(.48, 'rgba(232,111,44,.05)'); glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(core.x, core.y, radius * 1.45, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const filament of this.filaments) {
      ctx.beginPath();
      for (let step = 0; step <= 20; step += 1) {
        const progress = step / 20; const angle = seconds * filament.speed + filament.phase + progress * Math.PI * 1.3; const swell = Math.sin(progress * Math.PI);
        const x = core.x + Math.cos(angle) * radius * filament.radius * (1 + swell * .7);
        const y = core.y + Math.sin(angle * .8) * radius * filament.radius * .58 + Math.cos(progress * Math.PI * 2 + filament.phase) * radius * .1;
        step ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = 'rgba(242,142,67,.09)'; ctx.lineWidth = .6; ctx.stroke();
    }
    ctx.restore();
    for (const particle of this.coreParticles) {
      const rotatedX = particle.x * Math.cos(seconds) - particle.z * Math.sin(seconds);
      const depth = particle.x * Math.sin(seconds) + particle.z * Math.cos(seconds);
      ctx.fillStyle = depth > .1 ? `rgba(242,166,90,${.15 + (depth + 1) * .24})` : `rgba(222,103,49,${.1 + (depth + 1) * .18})`;
      ctx.beginPath(); ctx.arc(core.x + rotatedX * radius, core.y + particle.y * radius, .45 + (depth + 1) * .35, 0, Math.PI * 2); ctx.fill();
    }

    for (const node of graphNodes) {
      const point = points.get(node.id); const selected = this.selected?.id === node.id; const hovered = this.hovered?.id === node.id;
      const connected = !this.selected || this.selected.id === 'core' || node.id === 'core' || graphEdges.some((edge) => edge.includes(this.selected.id) && edge.includes(node.id));
      ctx.globalAlpha = connected ? 1 : .42;
      if (node.id !== 'core') {
        const nodeRadius = point.size * .47 * (hovered ? 1.04 : 1);
        ctx.shadowColor = COLORS[node.id]; ctx.shadowBlur = selected ? 22 : hovered ? 14 : 7;
        ctx.fillStyle = `${COLORS[node.id]}12`; ctx.strokeStyle = COLORS[node.id]; ctx.lineWidth = selected ? 1.6 : .8;
        ctx.beginPath(); ctx.arc(point.x, point.y, nodeRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        if (selected) { ctx.setLineDash([3, 6]); ctx.strokeStyle = 'rgba(243,239,235,.72)'; ctx.beginPath(); ctx.arc(point.x, point.y, nodeRadius + 8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      }
      ctx.textAlign = 'center'; ctx.fillStyle = node.id === 'core' ? '#f3c38f' : '#d5cfcb';
      ctx.font = `${node.id === 'core' ? 650 : 550} ${node.id === 'core' ? 24 : 13}px "Segoe UI"`;
      ctx.fillText(node.label, point.x, point.y + (node.id === 'core' ? 7 : point.size * .78));
      if (node.id === 'core') { ctx.fillStyle = '#8f8783'; ctx.font = '13px "Cascadia Mono", Consolas'; ctx.fillText('COGNITIVE SYSTEM', point.x, point.y + 30); }
      ctx.globalAlpha = 1;
    }
  }

  render(time) {
    const delta = this.lastTime ? Math.min((time - this.lastTime) / 1000, .05) : .016;
    this.lastTime = time;
    this.camera.update(delta);
    this.pointer.x += (this.pointer.targetX - this.pointer.x) * .06;
    this.pointer.y += (this.pointer.targetY - this.pointer.y) * .06;
    this.draw(time);
    if (!document.hidden && !motionQuery.matches) this.frame = requestAnimationFrame(this.render);
  }

  start() { this.stop(); this.lastTime = 0; motionQuery.matches ? this.draw(performance.now()) : this.frame = requestAnimationFrame(this.render); }
  stop() { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; }
  handleVisibility() { document.hidden ? this.stop() : this.start(); }
  destroy() { this.stop(); document.removeEventListener('visibilitychange', this.handleVisibility); }
}
