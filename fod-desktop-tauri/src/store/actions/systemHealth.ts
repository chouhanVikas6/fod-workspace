import { update_SystemHealth } from "../slices/system-health-slice"

export const updateSystemHealth = (payload) =>(dispatch,getState)=>{
   //may add payload validation
   // console.log(payload)
   dispatch(update_SystemHealth(payload))

}