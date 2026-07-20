import { clamp, damp, motionQuery } from '../utils/motion.js';

export class GraphCamera {
  constructor() {
    this.current = { x: 0, y: 0, zoom: 1 };
    this.target = { x: 0, y: 0, zoom: 1 };
    this.previous = { ...this.target };
  }

  update(deltaSeconds) {
    this.current.x = damp(this.current.x, this.target.x, 11, deltaSeconds);
    this.current.y = damp(this.current.y, this.target.y, 11, deltaSeconds);
    this.current.zoom = damp(this.current.zoom, this.target.zoom, 9, deltaSeconds);
  }

  pan(dx, dy) {
    this.target.x = clamp(this.target.x + dx, -900, 900);
    this.target.y = clamp(this.target.y + dy, -650, 650);
  }

  projectVelocity(vx, vy) {
    if (!motionQuery.matches) this.pan(clamp(vx * 150, -180, 180), clamp(vy * 150, -180, 180));
  }

  zoomBy(delta) {
    this.target.zoom = clamp(this.target.zoom * Math.exp(-delta * .001), .62, 1.85);
  }

  focus(node, metrics, chatOpen = false) {
    this.previous = { ...this.target };
    const desiredX = metrics.width * (chatOpen ? .38 : .44);
    const desiredY = metrics.height * .48;
    this.target.zoom = node.id === 'core' ? 1 : 1.12;
    this.target.x = desiredX - node.x * metrics.width * this.target.zoom;
    this.target.y = desiredY - node.y * metrics.height * this.target.zoom;
  }

  restore() { Object.assign(this.target, this.previous); }
  reset() { Object.assign(this.target, { x: 0, y: 0, zoom: 1 }); }
}
