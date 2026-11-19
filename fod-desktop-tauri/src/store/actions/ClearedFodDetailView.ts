import { getAllFrames, getAllFramesFromServer } from "@/ApiCalls/FodOperations";
import { remove_ClearedDetailedViewFod, update_ClearedDetailViewFod } from "../slices/clearedFodDetailView-slice";
import axiosClient from "@/utils/axios";

export const updateClearedDetailViewFod = (Fod: any) => async (dispatch: any, getState: any) => {
    const { missionNumber } = getState().MissionState;
    const fodWithMission = { ...Fod, missionId: Fod?.missionId ?? missionNumber };

    let { data, origin } = await getAllFrames(fodWithMission);
    if (!Array.isArray(data) || data.length === 0) {
        try {
            const serverRes: any = await getAllFramesFromServer(fodWithMission, missionNumber);
            if (Array.isArray(serverRes?.data) && serverRes.data.length > 0) {
                data = serverRes.data;
                origin = serverRes.origin;
            }
        } catch {
            // Fall back to existing FOD point / card preview
        }
    }

    let collectorResponse = await axiosClient({
        url: `/api/cleared-fod/response?groupId=${Fod.groupId}&missionId=${missionNumber}`,
        method: "get"
    });
    collectorResponse = collectorResponse ? collectorResponse.data : {};

    const decodedFodPoints =
        Array.isArray(data) && data.length > 0
            ? data
            : Array.isArray(Fod?.FodPoints) && Fod.FodPoints.length > 0
                ? Fod.FodPoints
                : [fodWithMission];

    const fod = { ...fodWithMission, FodPoints: decodedFodPoints, collectorResponse };
    dispatch(update_ClearedDetailViewFod({ fod, origin }));
};

export const removeClearedDetailedViewFod = () => (dispatch: any) => {
    dispatch(remove_ClearedDetailedViewFod());
};
