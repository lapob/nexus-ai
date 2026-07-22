import { clamp, damp, motionQuery } from '../utils/motion.js';

export class GraphCamera {
  constructor() {
    this.current = { x: 0, y: 0, zoom: 1 };
    this.target = { x: 0, y: 0, zoom: 1 };
    this.previous = { ...this.target };
    this.metrics = null;
    this.focusedNode = null;
    this.focusChatOpen = false;
  }

  update(deltaSeconds) {
    this.current.x = damp(this.current.x, this.target.x, 11, deltaSeconds);
    this.current.y = damp(this.current.y, this.target.y, 11, deltaSeconds);
    this.current.zoom = damp(this.current.zoom, this.target.zoom, 9, deltaSeconds);
  }

  pan(dx, dy) {
    this.target.x += dx;
    this.target.y += dy;
    this.clampState(this.target);
  }

  projectVelocity(vx, vy) {
    if (!motionQuery.matches) this.pan(clamp(vx * 150, -180, 180), clamp(vy * 150, -180, 180));
  }

  zoomBy(delta) {
    this.target.zoom = clamp(this.target.zoom * Math.exp(-delta * .001), .62, 1.85);
    this.clampState(this.target);
  }

  contentHeight(metrics = this.metrics) {
    return metrics?.contentHeight || metrics?.height || 1;
  }

  nodePoint(node, metrics = this.metrics, zoom = this.target.zoom) {
    return {
      x: node.x * metrics.width * zoom,
      y: (metrics.safeTop || 0) + node.y * this.contentHeight(metrics) * zoom
    };
  }

  clampState(state) {
    if (!this.metrics) return state;
    const { width, safeTop = 0 } = this.metrics; const height = this.contentHeight();
    const core = this.nodePoint({ x: .44, y: .48 }, this.metrics, state.zoom);
    const marginX = Math.min(150, width * .18); const marginY = Math.min(120, height * .2);
    state.x = clamp(state.x, marginX - core.x, width - marginX - core.x);
    state.y = clamp(state.y, safeTop + marginY - core.y, safeTop + height - marginY - core.y);
    return state;
  }

  resize(metrics, { chatOpen = this.focusChatOpen } = {}) {
    const previousMetrics = this.metrics;
    this.metrics = metrics;
    if (this.focusedNode) {
      this.focus(this.focusedNode, metrics, chatOpen, { remember: false, immediate: true });
      return;
    }
    if (previousMetrics) {
      const scaleX = metrics.width / previousMetrics.width;
      const scaleY = this.contentHeight(metrics) / this.contentHeight(previousMetrics);
      for (const state of [this.current, this.target, this.previous]) { state.x *= scaleX; state.y *= scaleY; this.clampState(state); }
    }
  }

  focus(node, metrics, chatOpen = false, { remember = true, immediate = false } = {}) {
    this.metrics = metrics;
    if (remember && !this.focusedNode) this.previous = { ...this.target };
    this.focusedNode = node; this.focusChatOpen = chatOpen;
    const desiredX = metrics.width * (chatOpen ? .38 : .44);
    const desiredY = (metrics.safeTop || 0) + this.contentHeight(metrics) * .48;
    this.target.zoom = node.id === 'core' ? 1 : 1.12;
    const point = this.nodePoint(node, metrics, this.target.zoom);
    this.target.x = desiredX - point.x;
    this.target.y = desiredY - point.y;
    this.clampState(this.target);
    if (immediate || motionQuery.matches) Object.assign(this.current, this.target);
  }

  setChatOpen(open) {
    this.focusChatOpen = open;
    if (this.focusedNode && this.metrics) this.focus(this.focusedNode, this.metrics, open, { remember: false });
  }

  restore() { this.focusedNode = null; Object.assign(this.target, this.previous); this.clampState(this.target); }
  reset() { this.focusedNode = null; Object.assign(this.target, { x: 0, y: 0, zoom: 1 }); this.clampState(this.target); }
}
