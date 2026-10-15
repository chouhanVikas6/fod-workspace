import { decodeFodPoints } from "../../utils/DecodeFrames";
import { getAllFrames, getAllFramesFromServer } from "../../ApiCalls/FodOperations";
import { remove_DetailedViewFod, update_DetailViewFod } from "../slices/fodDetailesView-slice";


export const updateDetailViewFod = (Fod: any, isFilteredFod: boolean = false) => async (dispatch: any, getState: any) => {
    const state = getState();
    const { missionNumber } = state.MissionState;
    const { isOpen, fod: currentFod } = state.FodDetailedView;

    // Only skip if the exact same FOD is already currently displayed in an open modal
    if (isOpen && currentFod?.groupId != null && Fod?.groupId != null && currentFod.groupId === Fod.groupId) {
        return;
    }

    const fodWithMission = {
        ...Fod,
        missionId: missionNumber,
        FodPoints: Fod.FodPoints && Fod.FodPoints.length > 0 ? Fod.FodPoints : [Fod],
    };

    // 1. Immediately open the detail view so the modal transition happens instantly and smoothly
    dispatch(update_DetailViewFod({ fod: fodWithMission, isFilteredFod, origin: 'initial' }));

    // 2. Fetch all frames asynchronously without blocking the UI
    try {
        const listFod = await getAllFrames(fodWithMission);
        if (listFod?.data && Array.isArray(listFod.data) && listFod.data.length > 0) {
            const fod = { ...fodWithMission, FodPoints: listFod.data };
            dispatch(update_DetailViewFod({ fod, isFilteredFod, origin: listFod.origin }));
        }
    } catch (err) {
        console.error("Error fetching frames for detail view:", err);
    }

    // 3. Fallback to server frames if needed
    getAllFramesFromServer(fodWithMission, missionNumber)
        .then((res: any) => {
            if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
                const updatedFod = { ...fodWithMission, FodPoints: res.data };
                dispatch(update_DetailViewFod({ fod: updatedFod, isFilteredFod, origin: res.origin }));
            }
        })
        .catch(() => {});
};


export const removeDetailedViewFod = () => (dispatch, getState) => {
    dispatch(remove_DetailedViewFod())
}
