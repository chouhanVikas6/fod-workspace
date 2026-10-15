import { toast } from 'react-toastify';
import {config}  from '@/config/clientConfig';
import axiosClient from '../utils/axios'

const {ServerIP,ServerPort} = config;

export const UpdateFodStatus = async (fod) => {
    try {
        console.log("Fod in UpdateFodStatus",fod);
        const response = await axiosClient({
            method: 'POST',
            url: `/api/fod-group/update/${fod.groupId}`,
            headers: {
                'Content-Type': 'application/json'
            },
            data: {
                missionId: fod.missionId,
                status: fod.status,
            }
        });

        // axiosClient resolves only on 2xx, so a resolved response means success.
        return response;

    } catch (e) {
        console.log("Error in Updating Fod status:", e?.message);
        toast.error(e?.data?.message || e?.data?.error || 'Failed to update FOD status');
        return undefined;
    }
}

export const getAllFrames = async (fod) => {
    try {
        const fodId = fod.groupId;
        if(!fodId  || !isFinite(fodId)){
            return [];
        }

        // axiosClient resolves only on 2xx; non-2xx throws into the catch below.
        const response = await axiosClient({
            method: 'get',
            //the endpoint will be moved in some config file
            url: `/api/mission/group-fods/${fodId}?missionId=${fod.missionId}`,
            timeout:10000
        });

        if(Array.isArray(response.data.data)){
            return response.data
        }
        else{
            throw new Error("Error while fetching all frames");
        }

    } catch (error) {
        console.log("Error in fetching Fod Frames:", error?.message);
        return  {data:[fod],origin:'self'};
    }
}

export const getAllFramesFromServer=async (fod,missionId)=>{
    try{
        const fodId = fod.groupId;
        if(!fodId){
            return [];
        }

        // axiosClient resolves only on 2xx; non-2xx throws into the catch below.
        const response = await axiosClient({
            method: 'get',
            //the endpoint will be moved in some config file
            url: `/api/fod-group/list-fod/${fodId}?missionId=${missionId}`,
            data:{
                missionId:fod.missionId
            },
            timeout:10000
        });
        console.log({response})

        return {data:response.data.data,origin:response.data.origin};

    } catch (error) {
        console.log("Error in fetching Fod Frames:", error?.message);
        return  {data:[],origin:'self'};
    }
}

export const sendFodClearingInfo_ApiCall = async (Package) => {
    try {

        // Calculate size of the Package in KB
        const packageBlob = new Blob([JSON.stringify(Package)], { type: 'application/json' });
        const packageSizeKB = packageBlob.size / 1024;
        console.log('Package size:', packageSizeKB, 'KB');

        // axiosClient resolves only on 2xx, so reaching here means success.
        await axiosClient({
            method:"POST",
            url:"/api/mission/clear-fod",
            data:Package
          })

        return true;

    } catch (e) {
        console.log("Error while updating Collector Response", e?.message);
        toast.error(e?.data?.error || 'Failed to submit FOD clearing report');
        return false;
    }
}
