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

export const sortByFilter = (filters, fods, currentLocation = null) => {
    const { sortby } = filters;
    // Never mutate the source array (Redux state / memoised list).
    const list = [...(fods || [])];
    let sortingFunction;
    switch (sortby) {
        case 'latest':
            sortingFunction = (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
            break;
        case 'oldest':
            sortingFunction = (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            break;
        case 'biggestTosmallest':
            sortingFunction = (a, b) => b.size - a.size;
            break;
        case 'smallestTobiggest':
            sortingFunction = (a, b) => a.size - b.size;
            break;
        case 'nearestFirst':
            if (!currentLocation) {
                return list; // no self location -> leave order untouched
            }
            sortingFunction = (a, b) => {
                const distanceA = distanceBwCollectorAndFod(a, currentLocation);
                const distanceB = distanceBwCollectorAndFod(b, currentLocation);
                // Invalid distances (empty string) sort to the end.
                const da = typeof distanceA === 'number' ? distanceA : Infinity;
                const db = typeof distanceB === 'number' ? distanceB : Infinity;
                return da - db; // ascending -> nearest first
            };
            break;
        default:
            return list;
    }
    return list.sort(sortingFunction);
};
