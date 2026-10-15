import { rawHttpRequest } from '@/utils/axios';
import {config}  from '@/config/clientConfig';

const {ServerIP,ServerPort} = config;

export const getMissionsList_ApiCall = async () => {
    try {

        const batchSize = config.MissionListBatchSize || 100;
 
        let data = JSON.stringify({ batchSize});
        let Apiconfig = {
            method: 'post',
            maxBodyLength: Infinity,
            //the endpoint will be moved in some config file
            url: `http://${ServerIP}:${String(ServerPort)}/loadOperations/getMissionsList`,
            headers: {
                'Content-Type': 'application/json'
            },
            data: data
        };

        const response = await rawHttpRequest(Apiconfig);
        if (response.status !== 200 ) {
            const errorMessage = "Response status for getMissionsList is not OK";
            throw new Error(errorMessage);
        }
        
        const MissionsList = response.data;
        if(MissionsList){
            // console.log("Mission Number",missionNumber)
            return MissionsList || [];
        }
        else{
            throw new Error('MissionsList is not present in Api response')
        }
        
    } catch (error) {
        console.log("Error in fetching Missions Data:", error.message);
        throw new Error("Error in fetching missions data");
    }
}

export const refresh_ApiCall = async () => {
    try {
        const limit = config.FodListsLimit || 1000;
        let data = JSON.stringify({limit});
        let Apiconfig = {
            method: 'post',
            maxBodyLength: Infinity,
            //the endpoint will be moved in some config file
            url: `http://${ServerIP}:${String(ServerPort)}/loadOperations/refresh`,
            headers: {
                'Content-Type': 'application/json'
            },
            data: data
        };

        const response = await rawHttpRequest(Apiconfig);
        if (response.status !== 200 ) {
            const errorMessage = "Response status for Refresh Api is not OK";
            throw new Error(errorMessage);
        }
        

        if(response.hasOwnProperty('data')){
            return response.data;
        }
        else{
            throw new Error('Data  is not present in Api response');
        }
        
    } catch (error) {
        console.log("Error in fetching data during Refresh:", error.message);
        throw new Error("Error in etching data during Refresh");
    }
}


export const loadPastMission_ApiCall = async (missionNumber) => {
    try {

        if(!missionNumber){
            return 
        }
        const limit = config.FodListsLimit || 1000;
        let data = JSON.stringify({limit,missionNumber});
        let Apiconfig = {
            method: 'post',
            maxBodyLength: Infinity,
            //the endpoint will be moved in some config file
            url: `http://${ServerIP}:${String(ServerPort)}/loadOperations/loadPastMission`,
            headers: {
                'Content-Type': 'application/json'
            },
            data: data
        };

        const response = await rawHttpRequest(Apiconfig);
        if (response.status !== 200 ) {
            const errorMessage = "Response status for Refresh Api is not OK";
            throw new Error(errorMessage);
        }
        

        if(response.hasOwnProperty('data')){
            return response.data;
        }
        else{
            throw new Error('Data  is not present in Api response');
        }
        
    } catch (error) {
        console.log("Error in fetching data during Refresh:", error.message);
        throw new Error("Error in etching data during Refresh");
    }
}



export const fetchFodsByFiltersApiCall =async (selectedCategories,range,sortBy) => {
    try {
        //error handling need to be implemented

        const limit = config.FodListsLimit || 1000;
        const rangeValues={   minSize:range[0],
                              maxSize:range[1],
                          }

        let data = JSON.stringify({limit,selectedCategories,rangeValues,sortBy});
        let Apiconfig = {
            method: 'post',
            maxBodyLength: Infinity,
            //the endpoint will be moved in some config file
            url: `http://${ServerIP}:${String(ServerPort)}/loadOperations/filter`,
            headers: {
                'Content-Type': 'application/json'
            },
            data: data
        };

        const response = await rawHttpRequest(Apiconfig);
        if (response.status !== 200 ) {
            const errorMessage = "Response status for fetch During Filter Call Api is not OK";
            throw new Error(errorMessage);
        }
        

        if(response.hasOwnProperty('data')){
            return response.data;
        }
        else{
            throw new Error('Data  is not present in Api response');
        }
        
    } catch (error) {
        console.log("Error in fetching data during fetch During Filter Call:", error.message);
        throw new Error("Error in etching data during fetch During Filter Call");
    }
}