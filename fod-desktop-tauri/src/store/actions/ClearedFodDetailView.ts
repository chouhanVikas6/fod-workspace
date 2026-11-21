import { getAllFrames, getAllFramesFromServer } from "@/ApiCalls/FodOperations";
import { remove_ClearedDetailedViewFod, update_ClearedDetailViewFod } from "../slices/clearedFodDetailView-slice";
import axiosClient from "@/utils/axios";

export const updateClearedDetailViewFod = (Fod: any) => async (dispatch: any, getState: any) => {
    const { missionNumber } = getState().MissionState;
    const fodWithMission = { ...Fod, missionId: Fod?.missionId ?? missionNumber };

    const initialFodPoints =
        Array.isArray(Fod?.FodPoints) && Fod.FodPoints.length > 0
            ? Fod.FodPoints
            : [fodWithMission];

    // 1. Open modal immediately with existing FOD data
    dispatch(
        update_ClearedDetailViewFod({
            fod: {
                ...fodWithMission,
                FodPoints: initialFodPoints,
                collectorResponse: Fod?.collectorResponse || {},
            },
            origin: 'initial',
        })
    );

    // 2. Fetch frames and collector response in parallel without blocking modal open
    const framesPromise = (async () => {
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
        return { data, origin };
    })();

    const responsePromise = axiosClient({
        url: `/api/cleared-fod/response?groupId=${Fod.groupId}&missionId=${missionNumber}`,
        method: "get",
    }).catch(() => null);

    const [framesResult, responseResult] = await Promise.allSettled([framesPromise, responsePromise]);

    const framesValue = framesResult.status === "fulfilled" ? framesResult.value : null;
    const collectorRes =
        responseResult.status === "fulfilled" && responseResult.value
            ? responseResult.value.data
            : Fod?.collectorResponse || {};

    const decodedFodPoints =
        Array.isArray(framesValue?.data) && framesValue.data.length > 0
            ? framesValue.data
            : initialFodPoints;

    dispatch(
        update_ClearedDetailViewFod({
            fod: {
                ...fodWithMission,
                FodPoints: decodedFodPoints,
                collectorResponse: collectorRes || {},
            },
            origin: framesValue?.origin || 'initial',
            onlyIfOpen: true,
        })
    );
};

export const removeClearedDetailedViewFod = () => (dispatch: any) => {
    dispatch(remove_ClearedDetailedViewFod());
};
