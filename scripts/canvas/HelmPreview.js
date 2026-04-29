import { THEME, pixi } from "../theme.js";

/**
 * HelmPreview – draws a semi-transparent ghost of the ship token at the
 * projected position on the canvas, connected by a curved arc.
 *
 * Movement uses a FIXED-RADIUS circular arc:
 *  - Radius R = (speed × gridSize) / |bearingRad|   -  constant for a given bearing
 *  - Arc length = (thrustPct / 100) × speed × gridSize   -  scales with power
 *  - Total heading change = (thrustPct / 100) × bearingDeg   -  grows with both
 *  - More power → further along the same curve, not a tighter turn
 *
 * Usage:
 *   HelmPreview.show(token, { x, y, rotation })
 *   HelmPreview.hide()
 *   HelmPreview.projectPosition(token, bearingDeg, thrustPct, speed)
 *   HelmPreview.updateLine(bearingDeg, thrustPct, speed)
 */
export class HelmPreview {

  static _container = null;
  static _sprite    = null;
  static _token     = null;
  static _line      = null;

  /** Number of polyline segments used to approximate the arc. */
  static ARC_SEGMENTS = 48;

  /**
   * Calculate where the ship ends up after committing `thrustPct`% of its
   * maximum power, curving at a radius determined solely by `bearingDeg`.
   * An optional `minMoveGridUnits` drift is always applied straight-ahead first
   * (the mandatory minimum movement every turn).
   *
   * @param {Token}  token             – the ship token on the canvas
   * @param {number} bearingDeg        – bearing in degrees (±). Defines turn radius.
   * @param {number} thrustPct         – additional thrust this move (0–100)
   * @param {number} speed             – ship speed stat (VU at 100% thrust)
   * @param {number} minMoveGridUnits  – mandatory straight-ahead drift in grid squares
   * @returns {{ x, y, rotation }}
   */
  static projectPosition(token, bearingDeg, thrustPct, speed, minMoveGridUnits = 0) {
    if (!token) return null;

    const { cx0, cy0, h0, gridSize } = this._tokenBasis(token);
    const tokenW = token.document.width  * gridSize;
    const tokenH = token.document.height * gridSize;

    const bearingRad = bearingDeg * (Math.PI / 180);
    // Fold min move into the arc  -  both thrust and mandatory drift follow the bearing.
    const thrustDist = (thrustPct / 100) * speed * gridSize;
    const minDist    = minMoveGridUnits * gridSize;
    const totalDist  = thrustDist + minDist;

    if (totalDist <= 0) {
      return { x: cx0 - tokenW / 2, y: cy0 - tokenH / 2, rotation: token.document.rotation };
    }

    return this._arcEndpoint(cx0, cy0, h0, bearingRad, totalDist, speed, gridSize, token);
  }

  /**
   * Return an array of screen {x, y} centre-points along the full path for the
   * preview line: first the straight drift (minMoveGridUnits), then the arc.
   */
  static projectPath(token, bearingDeg, thrustPct, speed, segments = this.ARC_SEGMENTS, minMoveGridUnits = 0) {
    if (!token) return [];

    const { cx0, cy0, h0, gridSize } = this._tokenBasis(token);
    const bearingRad = bearingDeg * (Math.PI / 180);
    const thrustDist = (thrustPct / 100) * speed * gridSize;
    const minDist    = minMoveGridUnits * gridSize;
    const totalDist  = thrustDist + minDist;
    const maxDist    = speed * gridSize;

    const pts = [{ x: cx0, y: cy0 }];
    if (totalDist <= 0) return pts;

    for (let i = 1; i <= segments; i++) {
      const t   = i / segments;
      const arc = t * totalDist;
      if (Math.abs(bearingRad) < 0.001) {
        pts.push({ x: cx0 + arc * Math.cos(h0), y: cy0 + arc * Math.sin(h0) });
      } else {
        const dRad = (arc / maxDist) * bearingRad;
        pts.push({
          x: cx0 + (maxDist / bearingRad) * (Math.sin(h0 + dRad) - Math.sin(h0)),
          y: cy0 + (maxDist / bearingRad) * (-Math.cos(h0 + dRad) + Math.cos(h0)),
        });
      }
    }
    return pts;
  }

  // ── Public rendering API ─────────────────────────────────────────────────

  static show(token, { x, y, rotation }) {
    this._token = token;
    this.hide();

    if (!canvas?.stage || !token?.mesh) return;

    this._container = new PIXI.Container();
    this._container.name = "imsc-helm-ghost";
    canvas.tokens.addChild(this._container);

    const texture = token.mesh?.texture;
    if (!texture) return;

    this._sprite = new PIXI.Sprite(texture);
    this._sprite.anchor.set(0.5, 0.5);

    const gridSize = canvas.grid.size;
    this._sprite.width  = token.document.width  * gridSize;
    this._sprite.height = token.document.height * gridSize;
    this._sprite.alpha  = 0.4;
    this._sprite.tint   = pixi(THEME.overlay.helmGhost);

    this._setPosition(x, y, rotation);
    this._container.addChild(this._sprite);

    this._line = new PIXI.Graphics();
    this._line.name = "imsc-helm-line";
    this._container.addChild(this._line);
  }

  static update({ x, y, rotation }) {
    if (!this._sprite || !this._token) return;
    this._setPosition(x, y, rotation);
  }

  static hide() {
    if (this._container) {
      this._container.destroy({ children: true });
      this._container = null;
      this._sprite    = null;
      this._line      = null;
    }
  }

  /**
   * Compute waypoints for animating the token along its arc path.
   * Returns an array of {x, y, rotation} document-coordinate points, not
   * including the starting position.  Use with token.document.move().
   *
   * @param {Token}  token
   * @param {number} bearingDeg
   * @param {number} thrustPct         – additional thrust (0–100)
   * @param {number} speed             – ship speed stat
   * @param {number} minMoveGridUnits  – mandatory drift in grid squares
   * @param {number} steps             – number of animation waypoints (default 12)
   */
  static projectWaypoints(token, bearingDeg, thrustPct, speed, minMoveGridUnits = 0) {
    if (!token) return [];
    const { cx0, cy0, h0, gridSize } = this._tokenBasis(token);
    const bearingRad = bearingDeg * (Math.PI / 180);
    const thrustDist = (thrustPct / 100) * speed * gridSize;
    const minDist    = minMoveGridUnits * gridSize;
    const totalDist  = thrustDist + minDist;
    if (totalDist <= 0) return [];

    // One waypoint per grid unit of travel for smooth per-square animation
    const steps = Math.max(1, Math.round(totalDist / gridSize));
    const waypoints = [];
    for (let i = 1; i <= steps; i++) {
      const arcLen = (i / steps) * totalDist;
      waypoints.push(this._arcEndpoint(cx0, cy0, h0, bearingRad, arcLen, speed, gridSize, token));
    }
    return waypoints;
  }

  /**
   * Compute waypoints for animating a lateral strafe movement.
   * Returns an array of {x, y, rotation} document-coordinate points.
   *
   * @param {Token}  token
   * @param {number} dir    +1 = starboard, -1 = port
   * @param {number} dist   grid squares to slide
   * @param {number} steps  number of animation waypoints (default 6)
   */
  static projectStrafeWaypoints(token, dir, dist) {
    if (!token || dist === 0) return [];
    const { cx0, cy0, h0, gridSize } = this._tokenBasis(token);
    const tokenW = token.document.width  * gridSize;
    const tokenH = token.document.height * gridSize;
    const perpAngle = h0 + dir * (Math.PI / 2);
    const totalDist = dist * gridSize;
    // One waypoint per grid unit
    const steps = Math.max(1, dist);
    const waypoints = [];
    for (let i = 1; i <= steps; i++) {
      const d = (i / steps) * totalDist;
      waypoints.push({
        x: Math.round(cx0 + d * Math.cos(perpAngle) - tokenW / 2),
        y: Math.round(cy0 + d * Math.sin(perpAngle) - tokenH / 2),
        rotation: token.document.rotation,
      });
    }
    return waypoints;
  }

  /**
   * Project a retrograde (backward) position.
   * dist: grid squares to move directly aft (opposite of current heading).
   */
  static projectRetrograde(token, dist) {
    if (!token || dist <= 0) return null;
    const { cx0, cy0, h0, gridSize } = this._tokenBasis(token);
    const tokenW = token.document.width  * gridSize;
    const tokenH = token.document.height * gridSize;
    // Backward = opposite heading direction
    const backAngle = h0 + Math.PI;
    const newCx = cx0 + dist * gridSize * Math.cos(backAngle);
    const newCy = cy0 + dist * gridSize * Math.sin(backAngle);
    return {
      x: newCx - tokenW / 2,
      y: newCy - tokenH / 2,
      rotation: token.document.rotation,
    };
  }

  /**
   * Compute waypoints for animating a retrograde (backward) movement.
   * One waypoint per grid unit of travel.
   */
  static projectRetrogradeWaypoints(token, dist) {
    if (!token || dist <= 0) return [];
    const { cx0, cy0, h0, gridSize } = this._tokenBasis(token);
    const tokenW = token.document.width  * gridSize;
    const tokenH = token.document.height * gridSize;
    const backAngle = h0 + Math.PI;
    const steps = Math.max(1, dist);
    const waypoints = [];
    for (let i = 1; i <= steps; i++) {
      const d = (i / steps) * dist * gridSize;
      waypoints.push({
        x: Math.round(cx0 + d * Math.cos(backAngle) - tokenW / 2),
        y: Math.round(cy0 + d * Math.sin(backAngle) - tokenH / 2),
        rotation: token.document.rotation,
      });
    }
    return waypoints;
  }

  /**
   * Project a lateral strafe position.
   * dir: +1 = starboard (right of heading), -1 = port (left of heading)
   * dist: grid squares to slide
   */
  static projectStrafe(token, dir, dist) {
    if (!token) return null;
    const { cx0, cy0, h0, gridSize } = this._tokenBasis(token);
    const tokenW = token.document.width  * gridSize;
    const tokenH = token.document.height * gridSize;
    // Perpendicular to heading: heading h0 points forward, so +90° = starboard
    const perpAngle = h0 + dir * (Math.PI / 2);
    const slideDist = dist * gridSize;
    const newCx = cx0 + slideDist * Math.cos(perpAngle);
    const newCy = cy0 + slideDist * Math.sin(perpAngle);
    return {
      x: newCx - tokenW / 2,
      y: newCy - tokenH / 2,
      rotation: token.document.rotation,
    };
  }

  /** Show strafe ghost and a dashed lateral line. */
  static showStrafe(token, dir, dist) {
    const projected = this.projectStrafe(token, dir, dist);
    if (!projected) return;
    this.show(token, projected);

    // Draw the lateral line over the existing line graphics
    if (!this._line || !this._token) return;
    const { cx0, cy0, h0, gridSize } = this._tokenBasis(token);
    const perpAngle = h0 + dir * (Math.PI / 2);
    const slideDist = dist * gridSize;
    this._line.clear();
    this._line.lineStyle(2, pixi(THEME.overlay.helmGhost), 0.6);
    this._line.moveTo(cx0, cy0);
    this._line.lineTo(cx0 + slideDist * Math.cos(perpAngle), cy0 + slideDist * Math.sin(perpAngle));
  }

  /** Show retrograde ghost and a dashed sternward line. */
  static showRetrograde(token, dist) {
    const projected = this.projectRetrograde(token, dist);
    if (!projected) return;
    this.show(token, projected);

    if (!this._line || !this._token) return;
    const { cx0, cy0, h0, gridSize } = this._tokenBasis(token);
    const backAngle = h0 + Math.PI;
    const backDist = dist * gridSize;
    this._line.clear();
    this._line.lineStyle(2, pixi(THEME.overlay.helmGhost), 0.6);
    this._line.moveTo(cx0, cy0);
    this._line.lineTo(cx0 + backDist * Math.cos(backAngle), cy0 + backDist * Math.sin(backAngle));
  }

  /**
   * Redraw the full preview line (drift + arc).
   *
   * @param {number} bearingDeg        – current bearing
   * @param {number} thrustPct         – additional thrust (0–100)
   * @param {number} speed             – ship speed stat
   * @param {number} minMoveGridUnits  – mandatory drift in grid squares
   */
  static updateLine(bearingDeg, thrustPct, speed, minMoveGridUnits = 0) {
    if (!this._line || !this._token) return;

    const points = this.projectPath(this._token, bearingDeg, thrustPct, speed, this.ARC_SEGMENTS, minMoveGridUnits);
    if (points.length < 2) return;

    this._line.clear();
    this._line.lineStyle(2, pixi(THEME.overlay.helmGhost), 0.6);
    this._line.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this._line.lineTo(points[i].x, points[i].y);
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────

  static _tokenBasis(token) {
    const gridSize = canvas.grid.size;
    const tokenW   = token.document.width  * gridSize;
    const tokenH   = token.document.height * gridSize;
    const cx0      = token.document.x + tokenW / 2;
    const cy0      = token.document.y + tokenH / 2;
    // Foundry: rotation 0 = north, CW positive, y-axis down on screen.
    // Converted to math angle: 0 = east, CCW positive with y-down = CW visually.
    const h0 = (token.document.rotation - 90) * (Math.PI / 180);
    return { cx0, cy0, h0, gridSize, tokenW, tokenH };
  }

  static _arcEndpoint(cx0, cy0, h0, bearingRad, arcLength, speed, gridSize, token) {
    const tokenW = token.document.width  * gridSize;
    const tokenH = token.document.height * gridSize;
    // deltaRad = thrustPct/100 × bearingRad  (derived from arcLength and fixed R)
    const maxDist = speed * gridSize;
    const deltaRad = arcLength / maxDist * bearingRad;
    let newCx, newCy;

    if (Math.abs(bearingRad) < 0.001) {
      newCx = cx0 + arcLength * Math.cos(h0);
      newCy = cy0 + arcLength * Math.sin(h0);
    } else {
      newCx = cx0 + (maxDist / bearingRad) * (Math.sin(h0 + deltaRad) - Math.sin(h0));
      newCy = cy0 + (maxDist / bearingRad) * (-Math.cos(h0 + deltaRad) + Math.cos(h0));
    }

    return {
      x:        newCx - tokenW / 2,
      y:        newCy - tokenH / 2,
      rotation: token.document.rotation + deltaRad * (180 / Math.PI),
    };
  }

  static _setPosition(x, y, rotation) {
    if (!this._sprite || !this._token) return;
    const gridSize = canvas.grid.size;
    const tokenW   = this._token.document.width  * gridSize;
    const tokenH   = this._token.document.height * gridSize;
    this._sprite.position.set(x + tokenW / 2, y + tokenH / 2);
    this._sprite.angle = rotation;
  }
}
