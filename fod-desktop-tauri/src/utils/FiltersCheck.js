import { distanceBwCollectorAndFod } from "./MapUtils";
import { getFodRiskRank } from "@/config/riskConfig";

const KNOWN_CLASSES = ['Metallic', 'Rocks/Ashpalt', 'Organic', 'Non-Metallic'];

// A FOD passes the filter when its size >= the min slider AND, if it carries a
// recognised classification, that class is currently selected. FODs with no
// class (or an unrecognised one) are never hidden by the class filter.
export const FiltersCheck = (fod, filters) => {
    const { classes = KNOWN_CLASSES, size } = filters;
    const minSize = Number.isFinite(Number(size?.min)) ? Number(size.min) : 0;

    const fodSize = Number(fod.size ?? 0);
    const sizeInRange = Number.isFinite(fodSize) ? fodSize >= minSize : true;

    const fodClass = fod.class;
    const classExists =
        !fodClass ||
        !KNOWN_CLASSES.includes(fodClass) ||
        classes.includes(fodClass);

    return classExists && sizeInRange;
};

const getTimestampMs = (fod) => {
    if (typeof fod._ts === 'number') return fod._ts;
    if (typeof fod.timestamp === 'number') return fod.timestamp;
    return fod.timestamp ? Date.parse(fod.timestamp) || 0 : 0;
};

export const sortByFilter = (filters, fods, currentLocation = null) => {
    if (!fods || fods.length === 0) return [];
    const { sortby } = filters;
    // Never mutate the source array (Redux state / memoised list).
    const list = fods.slice();
    if (list.length <= 1) return list;

    switch (sortby) {
        case 'latest':
            return list.sort((a, b) => {
                const diff = getTimestampMs(b) - getTimestampMs(a);
                return diff !== 0 ? diff : (b.groupId || 0) - (a.groupId || 0);
            });
        case 'oldest':
            return list.sort((a, b) => {
                const diff = getTimestampMs(a) - getTimestampMs(b);
                return diff !== 0 ? diff : (a.groupId || 0) - (b.groupId || 0);
            });
        case 'biggestTosmallest':
            return list.sort((a, b) => (b.size || 0) - (a.size || 0));
        case 'smallestTobiggest':
            return list.sort((a, b) => (a.size || 0) - (b.size || 0));
        case 'riskHighToLow':
            return list.sort((a, b) => {
                const rankDiff =
                    getFodRiskRank(b.class, b.size) - getFodRiskRank(a.class, a.size);
                if (rankDiff !== 0) return rankDiff;
                const sizeDiff = (Number(b.size) || 0) - (Number(a.size) || 0);
                if (sizeDiff !== 0) return sizeDiff;
                const tsDiff = getTimestampMs(b) - getTimestampMs(a);
                return tsDiff !== 0 ? tsDiff : (b.groupId || 0) - (a.groupId || 0);
            });
        case 'riskLowToHigh':
            return list.sort((a, b) => {
                const rankDiff =
                    getFodRiskRank(a.class, a.size) - getFodRiskRank(b.class, b.size);
                if (rankDiff !== 0) return rankDiff;
                const sizeDiff = (Number(a.size) || 0) - (Number(b.size) || 0);
                if (sizeDiff !== 0) return sizeDiff;
                const tsDiff = getTimestampMs(b) - getTimestampMs(a);
                return tsDiff !== 0 ? tsDiff : (b.groupId || 0) - (a.groupId || 0);
            });
        case 'nearestFirst': {
            if (
                !currentLocation ||
                typeof currentLocation.lat !== 'number' ||
                typeof currentLocation.lon !== 'number'
            ) {
                return list; // no self location -> leave order untouched
            }
            // Fast O(N) equirectangular approximation (no Turf allocation per item)
            const refLat = currentLocation.lat;
            const refLon = currentLocation.lon;
            const cosLat = Math.cos((refLat * Math.PI) / 180);
            const withDist = list.map((item) => {
                const loc =
                    item._loc ??
                    (typeof item.location === 'object' ? item.location : null);
                const lat = loc?.lat;
                const lon = loc?.lon;
                if (typeof lat !== 'number' || typeof lon !== 'number') {
                    return { item, d: Infinity };
                }
                const dLat = lat - refLat;
                const dLon = (lon - refLon) * cosLat;
                return { item, d: dLat * dLat + dLon * dLon };
            });
            withDist.sort((a, b) => a.d - b.d);
            return withDist.map((entry) => entry.item);
        }
        default:
            return list;
    }
};
