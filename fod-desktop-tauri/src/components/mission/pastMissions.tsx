import React from "react";
import MissionCard from "./missionCard";

// Mission list comes from MissionSelector's 1.5s poll so card stats stay live.
const PastMission = ({ missions, setMission, selectedMission }) => {
    return (
        <div className='flex-1 min-h-0 w-full flex flex-col justify-start items-center gap-2 bg-slate-50/70 border border-slate-200/90 rounded-2xl p-2.5 overflow-y-auto'>
            {missions?.length ?
                missions.map((mission) => (
                    <MissionCard missionData={mission} key={mission.mission_id} {...{ selectedMission, setMission }} />
                ))
                :
                <div className="m-auto text-sm text-slate-400 font-medium py-8">No missions yet</div>
            }
        </div>
    );
}

export default PastMission;
