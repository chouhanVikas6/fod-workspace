import { rawHttpRequest } from '@/utils/axios';
import {config}  from '@/config/clientConfig';
//pauseResumeMission

const {ServerIP,ServerPort} = config;

export const startNewMissionApi = async () => {
    try {
        let data = JSON.stringify({ message: 'Start New Mission' });
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            //the endpoint will be moved in some config file
            url: `http://${ServerIP}:${String(ServerPort)}/missionOperations/initializeMission`,
            headers: {
                'Content-Type': 'application/json'
            },
            data: data
        };

        const response = await rawHttpRequest(config);
        if (response.status !== 200 ) {
            const errorMessage = "Response status for Start New Mission is not OK";
            throw new Error(errorMessage);
        }
        
        const {missionNumber} = response.data;
        if(missionNumber){
            console.log("Mission Number",missionNumber)
            return {missionNumber}
        }
        else{
            throw new Error('Mission Number is not present in Api response')
        }
        
    } catch (error) {
        console.log("Error in Starting Mission:", error.message);
        throw new Error("Error in Starting Mission");
    }
}
export const terminateMissionApi = async () => {
    try {
        let data = JSON.stringify({ message: 'Terminate Mission' });
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            //the endpoint will be moved in some config file
            url: `http://${ServerIP}:${String(ServerPort)}/missionOperations/terminate`,
            headers: {
                'Content-Type': 'application/json'
            },
            data: data
        };

        const response = await rawHttpRequest(config);
        // console.log(response,"------------------")
        if (response.status === 200 ) {
           return true
        }
        
         return false
        
    } catch (error) {
        console.log("Error in Terminating Mission:", error.message);
       return false
    }
}

export const pauseResumeMissionApiCall = async (pauseStatus) => {
    try {
        console.log("PauseStatus",pauseStatus)
        if(typeof(pauseStatus)!=='boolean'){
            return false;
        }
        
        let data = JSON.stringify({pauseStatus});
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            //the endpoint will be moved in some config file
            url: `http://${ServerIP}:${String(ServerPort)}/missionOperations/pauseResumeMission`,
            headers: {
                'Content-Type': 'application/json'
            },
            data: data
        };

        const response = await rawHttpRequest(config);
        if (response.status !== 200 ) {
            throw new Error('Error occured while updating PauseStatus in ServerNode')
        }


        //-->> this part is just for logs 
        return true;
    } catch (error) {
        console.log( error.message);
        return false;
    }
}


