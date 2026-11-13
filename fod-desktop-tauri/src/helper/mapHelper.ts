import * as turf from '@turf/turf';

export function latLonToCartesian(lat, lon) {
    const point = turf.point([lon, lat]);
    const projected = turf.toMercator(point);
    return { x: projected.geometry.coordinates[0], y: projected.geometry.coordinates[1] };
}

export function cartesianToLatLon(x, y) {
    const point = turf.point([x, y]);
    const unprojected = turf.toWgs84(point);
    return { lat: unprojected.geometry.coordinates[1], lon: unprojected.geometry.coordinates[0] };
}

export function distance(point1, point2) {
    return Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2));
}

export function directionVector(point1, point2) {
    const dist = distance(point1, point2);
    return { x: (point2.x - point1.x) / dist, y: (point2.y - point1.y) / dist };
}

export function pointsOnLine(P1, P4, spacing, offset = 0) {
    const direction = directionVector(P1, P4);
    const vP1 = { x: P1.x + spacing * direction.x/2 + offset * direction.x, y: P1.y + spacing * direction.y/2 + offset * direction.y };
    const vP4 = { x: P4.x + spacing * direction.x/2 + offset * direction.x, y: P4.y + spacing * direction.y/2 + offset * direction.y };
    const vecP1P4 = { x: vP4.x - vP1.x, y: vP4.y - vP1.y };
    const length = Math.sqrt(vecP1P4.x ** 2 + vecP1P4.y ** 2);
    const vecP1P4_normalized = { x: vecP1P4.x / length, y: vecP1P4.y / length };
    const numPoints = Math.floor(length / spacing) + 1;

    const points = [];
    for (let i = 0; i < numPoints; i++) {
        const newX = vP1.x + i * spacing * vecP1P4_normalized.x;
        const newY = vP1.y + i * spacing * vecP1P4_normalized.y;
        points.push({ x: newX, y: newY });
    }

    return points;
}

export function isWithinBoundary(point, boundaryPoints) {
    if (!boundaryPoints || boundaryPoints.length < 3) return false;
    let inside = false;
    for (let i = 0, j = boundaryPoints.length - 1; i < boundaryPoints.length; j = i++) {
        const xi = boundaryPoints[i].x;
        const yi = boundaryPoints[i].y;
        const xj = boundaryPoints[j].x;
        const yj = boundaryPoints[j].y;

        const intersect =
            (yi > point.y) !== (yj > point.y) &&
            point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

export type PathDirection = 'LENGTHWISE' | 'CROSSWISE' | 'OPTIMAL';

export function mapArea(
    boundaryPoints: Array<{ lat: number; lon: number }>,
    lateralDistance: number,
    offset: number = 0,
    direction: PathDirection = 'OPTIMAL',
    reverse: boolean = false
) {
    if (!boundaryPoints || boundaryPoints.length < 3) return [];
    const spacing = Math.max(0.5, lateralDistance || 5);
    const pts = boundaryPoints.map((p) => latLonToCartesian(p.lat, p.lon));
    const n = pts.length;

    // Pick orientation from the longest polygon edge
    let longestLen = -1;
    let edgeAngle = 0;
    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const len = distance(a, b);
        if (len > longestLen) {
            longestLen = len;
            edgeAngle = Math.atan2(b.y - a.y, b.x - a.x);
        }
    }

    const rotatePts = (angle: number) => {
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        return pts.map((p) => ({
            u: p.x * cosA + p.y * sinA,
            v: -p.x * sinA + p.y * cosA,
        }));
    };

    const boundsFor = (rot: Array<{ u: number; v: number }>) => {
        let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
        for (const p of rot) {
            if (p.u < uMin) uMin = p.u;
            if (p.u > uMax) uMax = p.u;
            if (p.v < vMin) vMin = p.v;
            if (p.v > vMax) vMax = p.v;
        }
        return { uSpan: uMax - uMin, vSpan: vMax - vMin, vMin, vMax };
    };

    // Ensure LENGTHWISE/OPTIMAL sweeps along the longer axis of the polygon,
    // and CROSSWISE sweeps along the shorter axis.
    let sweepAngle = edgeAngle;
    let rotated = rotatePts(sweepAngle);
    let bounds = boundsFor(rotated);
    const wantLengthwise = direction !== 'CROSSWISE';
    if ((wantLengthwise && bounds.vSpan > bounds.uSpan) || (!wantLengthwise && bounds.uSpan > bounds.vSpan)) {
        sweepAngle += Math.PI / 2;
        rotated = rotatePts(sweepAngle);
        bounds = boundsFor(rotated);
    }

    const { vMin, vMax } = bounds;
    const totalSpan = vMax - vMin;
    if (totalSpan <= 0) return [];

    // Generate scanline v positions inside [vMin, vMax]
    const scanVs: number[] = [];
    const startOffset = Math.min(spacing / 2 + Math.max(0, offset) * 0.1, totalSpan / 2);
    if (totalSpan <= spacing) {
        scanVs.push((vMin + vMax) / 2);
    } else {
        for (let v = vMin + startOffset; v < vMax; v += spacing) {
            scanVs.push(v);
        }
        if (scanVs.length === 0) {
            scanVs.push((vMin + vMax) / 2);
        }
    }

    if (reverse) {
        scanVs.reverse();
    }

    const cosA = Math.cos(sweepAngle);
    const sinA = Math.sin(sweepAngle);
    const unrotate = (u: number, v: number) => ({
        x: u * cosA - v * sinA,
        y: u * sinA + v * cosA,
    });

    const linesCoordinatesData: number[][][] = [];

    for (let i = 0; i < scanVs.length; i++) {
        const vLine = scanVs[i];
        const intersections: number[] = [];

        for (let e = 0; e < n; e++) {
            const p1 = rotated[e];
            const p2 = rotated[(e + 1) % n];
            if ((p1.v <= vLine && p2.v > vLine) || (p2.v <= vLine && p1.v > vLine)) {
                const t = (vLine - p1.v) / (p2.v - p1.v);
                intersections.push(p1.u + t * (p2.u - p1.u));
            }
        }

        intersections.sort((a, b) => a - b);

        for (let k = 0; k + 1 < intersections.length; k += 2) {
            const uStart = intersections[k];
            const uEnd = intersections[k + 1];
            if (Math.abs(uEnd - uStart) < 0.1) continue;

            const c1 = unrotate(uStart, vLine);
            const c2 = unrotate(uEnd, vLine);
            const ll1 = cartesianToLatLon(c1.x, c1.y);
            const ll2 = cartesianToLatLon(c2.x, c2.y);

            if (i % 2 === 0) {
                linesCoordinatesData.push([
                    [ll1.lon, ll1.lat],
                    [ll2.lon, ll2.lat],
                ]);
            } else {
                linesCoordinatesData.push([
                    [ll2.lon, ll2.lat],
                    [ll1.lon, ll1.lat],
                ]);
            }
        }
    }

    return linesCoordinatesData;
}


