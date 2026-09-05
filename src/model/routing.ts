export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OrthogonalPathResult {
  path: string;
  labelPosition: Point;
  points: Point[];
}

/**
 * Calculates a clean orthogonal (right-angled) edge route with corner fillets.
 * Supports source/target handles and basic obstacle avoidance.
 */
export function calculateOrthogonalPath(
  source: Point,
  target: Point,
  sourceSide: 'left' | 'right' | 'top' | 'bottom' = 'bottom',
  targetSide: 'left' | 'right' | 'top' | 'bottom' = 'top',
  borderRadius = 8,
  obstacles: Box[] = []
): OrthogonalPathResult {
  const points: Point[] = [source];

  const dx = target.x - source.x;
  const dy = target.y - source.y;

  // Compute intermediate elbow points based on connection sides
  if (sourceSide === 'bottom' && targetSide === 'top') {
    if (dy > 20) {
      // Standard downward flow: midpoint Y
      const midY = source.y + dy / 2;
      points.push({ x: source.x, y: midY });
      points.push({ x: target.x, y: midY });
    } else {
      // Loopback upward (target is above source): detour around
      const offset = 40;
      const detourX = Math.max(source.x, target.x) + 80;
      points.push({ x: source.x, y: source.y + offset });
      points.push({ x: detourX, y: source.y + offset });
      points.push({ x: detourX, y: target.y - offset });
      points.push({ x: target.x, y: target.y - offset });
    }
  } else if (sourceSide === 'right' && targetSide === 'left') {
    if (dx > 20) {
      // Standard left-to-right flow: midpoint X
      const midX = source.x + dx / 2;
      points.push({ x: midX, y: source.y });
      points.push({ x: midX, y: target.y });
    } else {
      // Loopback right-to-left
      const offset = 40;
      const detourY = Math.max(source.y, target.y) + 60;
      points.push({ x: source.x + offset, y: source.y });
      points.push({ x: source.x + offset, y: detourY });
      points.push({ x: target.x - offset, y: detourY });
      points.push({ x: target.x - offset, y: target.y });
    }
  } else if (sourceSide === 'left' && targetSide === 'right') {
    if (dx < -20) {
      const midX = source.x + dx / 2;
      points.push({ x: midX, y: source.y });
      points.push({ x: midX, y: target.y });
    } else {
      const offset = 40;
      const detourY = Math.max(source.y, target.y) + 60;
      points.push({ x: source.x - offset, y: source.y });
      points.push({ x: source.x - offset, y: detourY });
      points.push({ x: target.x + offset, y: detourY });
      points.push({ x: target.x + offset, y: target.y });
    }
  } else {
    // General fallback: simple right-angle step
    const midX = source.x + dx / 2;
    points.push({ x: midX, y: source.y });
    points.push({ x: midX, y: target.y });
  }

  points.push(target);

  // Check if any segment passes through an obstacle box
  if (obstacles.length > 0) {
    // Basic avoidance: shift X if vertical segment collides
    for (const obs of obstacles) {
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        if (p1.x === p2.x && p1.x >= obs.x && p1.x <= obs.x + obs.width) {
          const minY = Math.min(p1.y, p2.y);
          const maxY = Math.max(p1.y, p2.y);
          if (maxY > obs.y && minY < obs.y + obs.height) {
            // Collision detected! Nudge path outside obstacle right edge
            const bypassX = obs.x + obs.width + 20;
            p1.x = bypassX;
            p2.x = bypassX;
          }
        }
      }
    }
  }

  // Generate SVG path string with corner fillets
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    if (!next || borderRadius <= 0) {
      path += ` L ${curr.x} ${curr.y}`;
    } else {
      // Fillet bend
      const d1 = { x: curr.x - prev.x, y: curr.y - prev.y };
      const d2 = { x: next.x - curr.x, y: next.y - curr.y };
      const r = Math.min(
        borderRadius,
        Math.hypot(d1.x, d1.y) / 2,
        Math.hypot(d2.x, d2.y) / 2
      );

      const len1 = Math.hypot(d1.x, d1.y);
      const len2 = Math.hypot(d2.x, d2.y);

      if (len1 > 0 && len2 > 0) {
        const startFillet = {
          x: curr.x - (d1.x / len1) * r,
          y: curr.y - (d1.y / len1) * r,
        };
        const endFillet = {
          x: curr.x + (d2.x / len2) * r,
          y: curr.y + (d2.y / len2) * r,
        };
        path += ` L ${startFillet.x} ${startFillet.y} Q ${curr.x} ${curr.y} ${endFillet.x} ${endFillet.y}`;
      } else {
        path += ` L ${curr.x} ${curr.y}`;
      }
    }
  }

  // Compute label center point at middle segment
  const midIdx = Math.floor(points.length / 2);
  const labelPosition = {
    x: (points[midIdx - 1].x + points[midIdx].x) / 2,
    y: (points[midIdx - 1].y + points[midIdx].y) / 2,
  };

  return { path, labelPosition, points };
}
