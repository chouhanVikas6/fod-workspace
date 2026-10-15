import { getAllFrames } from "@/ApiCalls/FodOperations";
import { decodeFodPoints } from "../../utils/DecodeFrames";
import { findFodInQueues } from "../../utils/FodSearch";
import { remove_ClearedDetailedViewFod, update_ClearedDetailViewFod } from "../slices/clearedFodDetailView-slice";
import axiosClient from "@/utils/axios";
import { url } from "inspector";


export const updateClearedDetailViewFod = (Fod) => async (dispatch, getState) => {

    let { data, origin } = await getAllFrames(Fod);
    const { FodId } = getState().ClearedFodDetailView.fod;
    const { missionNumber } = getState().MissionState;
    let collectorResponse=await axiosClient({
        url: `/api/cleared-fod/response?groupId=${Fod.groupId}&missionId=${missionNumber}`,
        method: "get"
    });
    collectorResponse=!!collectorResponse?collectorResponse.data:{}

    const decodedFodPoints = data;

    const fod = { ...Fod, FodPoints: decodedFodPoints,collectorResponse };
    dispatch(update_ClearedDetailViewFod({ fod, origin }));
};


export const removeClearedDetailedViewFod = () => (dispatch, getState) => {
    dispatch(remove_ClearedDetailedViewFod())
}







