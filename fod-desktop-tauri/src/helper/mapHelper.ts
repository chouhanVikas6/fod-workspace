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

export function mapArea(boundaryPoints, lateralDistance, offset) {
    const cartesianBoundaryPoints = boundaryPoints.map(p => latLonToCartesian(p.lat, p.lon));
    const [p1, p2, p3, p4] = cartesianBoundaryPoints;

    const points_1 = pointsOnLine(p1, p4, lateralDistance, offset);
    const points_2 = pointsOnLine(p2, p3, lateralDistance, offset);

    const width = Math.min(distance(p2, p3), distance(p1, p4));
    // const height = distance(p1, p2);

    const numSweeps = Math.ceil(width / lateralDistance);

    const linesCoordinatesData = [];

    for (let i = 0; i < numSweeps; i++) {
        const point1 = cartesianToLatLon(points_1[i].x, points_1[i].y);
        const point2 = cartesianToLatLon(points_2[i].x, points_2[i].y);
        if (i % 2 == 0) {
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


