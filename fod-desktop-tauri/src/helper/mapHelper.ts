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
    const [p1, p2, p3, p4] = boundaryPoints;

    const isWithinX = point.x >= Math.min(p1.x, p2.x, p3.x, p4.x) && point.x <= Math.max(p1.x, p2.x, p3.x, p4.x);
    const isWithinY = point.y >= Math.min(p1.y, p2.y, p3.y, p4.y) && point.y <= Math.max(p1.y, p2.y, p3.y, p4.y);

    return isWithinX && isWithinY;
}

export type PathDirection = 'LENGTHWISE' | 'CROSSWISE' | 'OPTIMAL';

export function mapArea(
    boundaryPoints: Array<{ lat: number; lon: number }>,
    lateralDistance: number,
    offset: number = 0,
    direction: PathDirection = 'OPTIMAL',
    reverse: boolean = false
) {
    if (!boundaryPoints || boundaryPoints.length < 4) return [];
    const cartesianBoundaryPoints = boundaryPoints.slice(0, 4).map(p => latLonToCartesian(p.lat, p.lon));
    const [p1, p2, p3, p4] = cartesianBoundaryPoints;

    const lenPair1 = (distance(p1, p2) + distance(p4, p3)) / 2;
    const lenPair2 = (distance(p1, p4) + distance(p2, p3)) / 2;

    // For LENGTHWISE / OPTIMAL: sweeps run parallel to the longer pair of edges
    // For CROSSWISE: sweeps run parallel to the shorter pair of edges
    const wantParallelToPair2 = direction === 'CROSSWISE' ? (lenPair2 < lenPair1) : (lenPair2 >= lenPair1);

    let startSideA: Array<{ x: number; y: number }>;
    let startSideB: Array<{ x: number; y: number }>;
    let stepWidth: number;

    if (wantParallelToPair2) {
        startSideA = pointsOnLine(p1, p2, lateralDistance, offset);
        startSideB = pointsOnLine(p4, p3, lateralDistance, offset);
        stepWidth = lenPair1;
    } else {
        startSideA = pointsOnLine(p1, p4, lateralDistance, offset);
        startSideB = pointsOnLine(p2, p3, lateralDistance, offset);
        stepWidth = lenPair2;
    }

    if (reverse) {
        startSideA.reverse();
        startSideB.reverse();
    }

    const numSweeps = Math.min(
        Math.ceil(stepWidth / lateralDistance),
        startSideA.length,
        startSideB.length
    );

    const linesCoordinatesData: number[][][] = [];

    for (let i = 0; i < numSweeps; i++) {
        if (!startSideA[i] || !startSideB[i]) continue;
        const point1 = cartesianToLatLon(startSideA[i].x, startSideA[i].y);
        const point2 = cartesianToLatLon(startSideB[i].x, startSideB[i].y);
        if (i % 2 === 0) {
            linesCoordinatesData.push([
                [point1.lon, point1.lat],
                [point2.lon, point2.lat]
            ]);
        } else {
            linesCoordinatesData.push([
                [point2.lon, point2.lat],
                [point1.lon, point1.lat]
            ]);
        }
    }

    return linesCoordinatesData;
}


