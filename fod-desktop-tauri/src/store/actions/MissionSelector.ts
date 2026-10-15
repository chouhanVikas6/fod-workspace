import {close_MisionSelector,update_MissionsList} from '@/store/slices/missionSelector-slice';
// import { getMissionsList_ApiCall } from '../../ApiCalls/LoadOperatons';
// import { startNewMissionApi } from '../../ApiCalls/MissionControls';

import { getMissionsList_ApiCall } from '@/ApiCalls/LoadOperatons';
import { setIsLoading, start_Mission } from '../slices/missionState-slice';
import { startNewMissionApi } from '@/ApiCalls/MissionControls';
import { persistor } from '../index';

export const closeMisionSelector = (dispatch,getState)=>{
         dispatch(close_MisionSelector(getState))
}

export const startNewMission = async(dispatch,getState)=>{
     try{
        await persistor.purge()
        const {isStart} = getState().MissionState;
  
        if(isStart){
            console.log('Mission Already started')
            return;
         }
  
         dispatch(setIsLoading(true))
  
         const response = await startNewMissionApi();
         
         dispatch(start_Mission(response));
         dispatch(close_MisionSelector(getState));
     }
     catch(e){
          console.log(e);
          window.alert("Server is not running.  Please restart the server")
          dispatch(setIsLoading(false))

     }
  
  }


export const getPastMissionsList = async(dispatch,getState) =>{
       try{ 
            dispatch(setIsLoading(true))
            const missionsList =  await getMissionsList_ApiCall();
            const {MissionsList} = getState().MissionSelector;
            
            const missionNumbersToRemove = MissionsList.map(item => item.missionNumber);

            // Filter array1 to remove items with mission numbers present in missionsList
            const filteredMissionList = missionsList.filter(item => !missionNumbersToRemove.includes(item.missionNumber));

            dispatch(setIsLoading(false))
            dispatch(update_MissionsList(filteredMissionList));
            
       }
       catch(e){
           console.log(e);
           window.alert("Server is not running.  Please restart the server")
           dispatch(setIsLoading(false))
       }
}