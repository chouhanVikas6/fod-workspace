// import { refresh_ApiCall ,loadPastMission_ApiCall} from "../../ApiCalls/LoadOperatons";
// import { setIsLoading,start_Mission } from "../reducers/MissionState";
import { loadPastMission_ApiCall, refresh_ApiCall } from "@/ApiCalls/LoadOperatons";
import { add_FodsOnRefresh } from "../slices/fodReducer-slice";
import { setIsLoading, start_Mission } from "../slices/missionState-slice";
// import { add_FodsOnRefresh } from "../reducers/FodReducer";
// import { decodeFods } from "../../utils/DecodeFrames";
import { closeMisionSelector } from "./MissionSelector";
import { decodeFods } from "@/utils/DecodeFrames";

export const LoadOnRefresh = async (dispatch,getState) => {
    try{
        dispatch(setIsLoading(true));
        const response = await refresh_ApiCall();
        const {missionNumber,alertQueueFods,clearenceQueueFods,rejectedFods,clearedFods} = response
        const decodedAlertQueueFods = await decodeFods(alertQueueFods);
        const decodedClearenceQueueFods = await decodeFods(clearenceQueueFods);
        const decodedRejectedFods = await decodeFods(rejectedFods);
        const decodedClearedFods = await decodeFods(clearedFods);

        const decodedData ={
            alertQueueFods:decodedAlertQueueFods,
            clearenceQueueFods:decodedClearenceQueueFods,
            rejectedFods:decodedRejectedFods,
            clearedFods:decodedClearedFods
        }


        dispatch(add_FodsOnRefresh(decodedData));
        dispatch(closeMisionSelector)
        dispatch(start_Mission({missionNumber}));
    }
    catch(e){
        dispatch(setIsLoading(false));
    }
   
}
export const LoadPastMission = (missionNumber) => async (dispatch,getState) => {
    try{
        if(!missionNumber) {
            console.log('mission number is null when loading previous mission');
            return
        }
        dispatch(setIsLoading(true));
        const response = await loadPastMission_ApiCall(missionNumber);
        const {alertQueueFods,clearenceQueueFods,rejectedFods,clearedFods} = response
        const decodedAlertQueueFods = await decodeFods(alertQueueFods);
        const decodedClearenceQueueFods = await decodeFods(clearenceQueueFods);
        const decodedRejectedFods = await decodeFods(rejectedFods);
        const decodedClearedFods = await decodeFods(clearedFods);

        const decodedData ={
            alertQueueFods:decodedAlertQueueFods,
            clearenceQueueFods:decodedClearenceQueueFods,
            rejectedFods:decodedRejectedFods,
            clearedFods:decodedClearedFods
        }


        dispatch(add_FodsOnRefresh(decodedData));
        dispatch(closeMisionSelector)
        dispatch(start_Mission({missionNumber}));
    }
    catch(e){
        dispatch(setIsLoading(false));
    }
   
}

