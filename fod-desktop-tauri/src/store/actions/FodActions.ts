import { segregateFods } from '../../utils/FodSearch';
import { decodeFods } from '../../utils/DecodeFrames';
import { UpdateFodStatus } from '../../ApiCalls/FodOperations';
import { fetchFodsByFiltersApiCall } from '../../ApiCalls/LoadOperatons';
import { accept_Fod, add_updateFod, reject_Fod, set_ImageModal, undo_fod } from '../slices/fodReducer-slice';
import axiosClient from '@/utils/axios';
import { pushFod } from '../slices/fodReducer-slice';
import { toast } from 'react-toastify';

// Updated Action Creator
export const addFod = (payload,audioRef) => async (dispatch, getState) => {
  console.log(payload)
  const decodedPayload = await decodeFods(payload);
  const FodReducer = getState().FodReducer
  if(!FodReducer){
    console.log('FodReducer does not exist');
    return;
  }

  const modifiedPayload = segregateFods(decodedPayload,FodReducer)
  dispatch(add_updateFod(modifiedPayload));

  // playNotificationSound(audioRef,getState)
};


export const acceptFod = (fod)=>async (dispatch, getState) =>{
  try{
    const {groupId:FodId,missionId} = fod;
    console.log(fod)
    const response = await axiosClient({
      method:"POST",
      url:"/api/fod-group/update/"+FodId,
      data:{
        status:"ACCEPTED",
        missionId
      }
    })
    
    dispatch(set_ImageModal({FodId,flag:true}))
  
    if(response){
      dispatch(accept_Fod(FodId))
    }
    dispatch(set_ImageModal({FodId,flag:false}))

  }
  catch(e){
    console.error(e)
    toast.error(e?.data?.message || e?.data?.error || 'Failed to accept FOD');
  }

}

export const rejectFod = (fod) => async (dispatch,getState)=>{
  try{
    const {groupId:FodId,missionId} = fod;
    const response = await axiosClient({
      method:"POST",
      url:"/api/fod-group/update/"+FodId,
      data:{
        status:"REJECTED",
        missionId
      }
    })
    
    dispatch(set_ImageModal({FodId,flag:true})) 

    if(response){
       dispatch(reject_Fod(FodId))
    }
    dispatch(set_ImageModal({FodId,flag:false}))
  }
  catch(e){
    console.error(e);
    toast.error(e?.data?.message || e?.data?.error || 'Failed to reject FOD');
  }

}

export const undoFod = (fod) => async (dispatch,getState)=>{
  try{
    console.log("undo fod",fod)
    const { missionNumber } = getState().MissionState;
    const response =await UpdateFodStatus({...fod,status:'NEW',missionId:missionNumber});
    if(response){
       dispatch(undo_fod(fod.groupId))
      //  dispatch(set_ImageModal({FodId})) 
    }
    // dispatch(set_ImageModal({FodId,flag:false})) 
  }
  catch(e){
    console.error("errooroooro",e);
  }

}

export const fetchFodsByFilters =(selectedClasses,rangeValues)=> async(dispatch,getState)=>{
    try{
        const sortby = getState().FodReducer.filters.sortby;
        const response = await fetchFodsByFiltersApiCall(selectedClasses,rangeValues,sortby);

        console.log(response);
    
    }catch(e){
      console.log(e)
    }
}










export const push_Fod =(fod) =>(dispatch,getState)=>{

  dispatch(pushFod(fod));

  playNotificationSound(getState)
}


const playNotificationSound = (getState) => {
  const {isNotificationOn} = getState().MissionState;
  if(!isNotificationOn) return
  const audio = new Audio('/audios/notification.mp3');
  audio.play();
};