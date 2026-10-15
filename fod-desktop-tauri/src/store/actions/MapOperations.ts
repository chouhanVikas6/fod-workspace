import { UnknownAction } from "@reduxjs/toolkit"
import { set_Mapview, set_selectedQueue, toggle_Mapview, update_collector_location } from "../slices/mapReducer-slice"

export const toggelMapView = (dispatch,getState)=>{
   console.log("called toggle map")
  dispatch(toggle_Mapview())
}


export const set_Map_view =(dispatch,getState)=>{
   return dispatch(set_Mapview())
}


export const set_selected_Queue =(payload)=> async(dispatch,getState)=>{
   return dispatch(set_selectedQueue(payload))
}

export const updatecollectorlocation=(payload)=>async(dispatch,getState)=>{
    return dispatch(update_collector_location(payload))
}

