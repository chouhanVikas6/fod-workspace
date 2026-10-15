import axiosClient from "@/utils/axios";
import { toast } from "react-toastify";
import { pauseResumeMissionApiCall, terminateMissionApi } from "../../ApiCalls/MissionControls";
import { pause_resumeMission, setIsLoading, set_PauseLoader, set_Terminate } from "../slices/missionState-slice";
import { url } from "inspector";
import { UnknownAction } from "@reduxjs/toolkit";
import { persistor } from "../index";

export const pauseResumeMission = async(dispatch,getState)=>{
   try{
      const {isStart,isPause} = getState().MissionState;
      if(!isStart || typeof(isPause) !== 'boolean'){
          return;
       }

       dispatch(set_PauseLoader(true));
       const response = await pauseResumeMissionApiCall(!isPause);
       
       if(response){
        dispatch(pause_resumeMission(!isPause));
      }
      dispatch(set_PauseLoader(false))
   }
   catch(e){
        console.log(e);
        dispatch(set_PauseLoader(false))
   }

}

export const terminateMission = (dispatch: any, getState: any): void => {
   try{
      const mission = getState().MissionState;
      if(!mission){
         console.error("Mission not found");
         return;
      }
      console.log({mission})
       dispatch(setIsLoading(true))

      axiosClient({
         method:"POST",
         url:"/api/mission/terminate/"+mission.missionNumber,
       }).then((_)=>{
         // Only tear the session down once the vehicle confirmed termination.
         dispatch(set_Terminate());
         persistor.purge()
         window.location.reload()
       }).catch((e)=>{
         toast.error(e?.data?.error || 'Failed to terminate mission — is the vehicle connected?')
       }).finally(()=>{
         dispatch(setIsLoading(false))
       })
   }
   catch(e){
        console.log(e);
        toast.error("Failed to terminate mission")
        dispatch(setIsLoading(false))

   }

}


export const exitMission = (dispatch: any, getState: any): void => {
   try{

       dispatch(setIsLoading(true))

       dispatch(set_Terminate());

       dispatch(setIsLoading(false))
       persistor.purge()
   }
   catch(e){
        console.log(e);
        dispatch(setIsLoading(false))

   }

}