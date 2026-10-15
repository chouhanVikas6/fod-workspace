import { clearWebCamImages } from "../slices/webCam-slice";
import { remove_SelectedFod, set_FodStatus, update_SelectedFod } from "../slices/selectedFod-slice";
import { ThunkAction } from "@reduxjs/toolkit";
// import { RootState, AppDispatch } from "../store";
import axiosClient from "@/utils/axios";
import { getAllFrames, getAllFramesFromServer } from "@/ApiCalls/FodOperations";
import { update_DetailViewFod } from "../slices/fodDetailesView-slice";
import { RootState } from "..";

interface FodType {
  FodPoint: { size: number };
  FodPoints?: any[];
}

// Define the return type for Thunk actions
type AppThunk<ReturnType = void> = ThunkAction<ReturnType, RootState, unknown, any>;

export const updateSelectedFod = (Fod): AppThunk<void> => async (dispatch, getState) => {
  console.log("updateSelectedFod",Fod)
const missionState=getState().MissionState;
console.log("missionState",missionState)
const { missionNumber } = missionState;
const { FodId } = getState().SelectedFod.fod;
  const {groupId}=Fod;
  if(!groupId){
    console.log("No groupId is provided");
    return [];
  }
  if (FodId === groupId) {
    console.log("returning  cause id same")
    return;
  }
  console.log({Fod})
  dispatch(clearWebCamImages());
  const localFod={...Fod,FodPoint:[{...Fod}]};
  dispatch(update_SelectedFod({fod:localFod,origin:"self"}));
 
  const listFod = await getAllFrames(Fod);
  const selfFod = { ...Fod, FodPoint: listFod.data };

  dispatch(update_SelectedFod({ fod:selfFod, origin: listFod.origin }));
  getAllFramesFromServer(Fod, missionNumber).then((res: any) => {
          const updatedFod = { ...Fod, FodPoint: res.data };
          dispatch(update_SelectedFod({ fod:updatedFod, origin: res.origin }));
      });
};

export const removeSelectedFod = (): AppThunk<void> => (dispatch) => {
  dispatch(remove_SelectedFod());
}

export const setFodStatus = (FodStatus: number): AppThunk<void> => (dispatch) => {
  if (typeof FodStatus !== 'number' || FodStatus < 1 || FodStatus > 3) {
    return;
  }
  dispatch(set_FodStatus(FodStatus));
}
