import { distanceBwCollectorAndFod } from "./MapUtils";

const KNOWN_CLASSES = ['Metallic', 'Rocks/Ashpalt', 'Organic', 'Non-Metallic'];

// A FOD passes the filter when its size >= the min slider AND, if it carries a
// recognised classification, that class is currently selected. FODs with no
// class (or an unrecognised one) are never hidden by the class filter.
export const FiltersCheck = (fod, filters) => {
    const { classes = KNOWN_CLASSES, size } = filters;
    const minSize = size?.min || 0;

    const sizeInRange = (fod.size ?? 0) >= minSize;

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
        case 'nearestFirst': {
            if (!currentLocation) {
                return list; // no self location -> leave order untouched
            }
            // Compute distance once per item (O(N)) instead of O(N log N) inside comparator
            const withDist = list.map((item) => {
                const d = distanceBwCollectorAndFod(item, currentLocation);
                return { item, d: typeof d === 'number' ? d : Infinity };
            });
            withDist.sort((a, b) => a.d - b.d);
            return withDist.map((entry) => entry.item);
        }
        default:
            return list;
    }
};
