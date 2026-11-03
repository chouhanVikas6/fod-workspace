import React from "react";
import MissionCard from "./missionCard";

// Mission list comes from MissionSelector's 1.5s poll so card stats stay live.
const PastMission = ({ missions, setMission, selectedMission }: any) => {
    return (
        <div className='flex-1 min-h-0 w-full flex flex-col justify-start items-stretch space-y-2.5 overflow-y-auto pr-1'>
            {missions?.length ?
                missions.map((mission: any, index: number) => (
                    <MissionCard
                        missionData={mission}
                        key={mission.mission_id || index}
                        index={index}
                        {...{ selectedMission, setMission }}
                    />
                ))
                :
                <div className="m-auto text-sm text-slate-500 font-medium py-12 text-center">
                    No missions found
                </div>
            }
        </div>
    );
};

export default PastMission;
