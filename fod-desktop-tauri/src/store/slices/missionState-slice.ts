import { Mission } from "@prisma/client";
import { createSlice } from "@reduxjs/toolkit";

export interface MissionStateType {
  missionNumber: number | null;
  duration:number|null;
  isStart: boolean;
  isTerminate: boolean;
  isPause: boolean;
  isLoading: boolean;
  isNotificationOn: boolean;
  isPauseLoading: boolean;
  isActive:boolean;
}

const initialState: MissionStateType = {
  missionNumber: null,
  duration:null,
  isStart: false,
  isTerminate: false,
  isPause: true,
  isLoading: false,
  isNotificationOn: false,
  isPauseLoading: false,
  isActive:false
};

const MissionStateReducer = createSlice({
  name: 'MissionState',
  initialState,
  reducers: {
    start_Mission: (state, action) => {
      const { id:missionNumber ,isActive=true , duration=null}= action.payload;
      state.missionNumber = missionNumber;
      state.isStart = true;
      state.isLoading = false;
      state.isActive=isActive;
      state.duration=duration;
    },
    pause_resumeMission: (state, action) => {
      const { payload: pauseStatus } = action;
      state.isPause = pauseStatus;
      state.isLoading = false;
    },
    setIsLoading: (state, action) => {
      const { payload } = action;
      if (typeof payload === 'boolean') {
        state.isLoading = payload;
      }
    },
    toggleNotification: (state, action) => {
      state.isNotificationOn = !state.isNotificationOn;
    },
    set_PauseLoader: (state, action) => {
      const { payload: loading } = action;
      if (typeof loading === 'boolean') {
        state.isPauseLoading = loading;
      }
    },
    set_Terminate: (state) => {
      state.isTerminate = true;
      state.duration=null;
      state.isStart = false;
      state.isPause = true;
      state.missionNumber = null;
      state.isLoading = false;
      state.isNotificationOn = false;
      state.isPauseLoading = false;
    },
  },
});

export const {
  start_Mission,
  pause_resumeMission,
  setIsLoading,
  toggleNotification,
  set_PauseLoader,
  set_Terminate,
} = MissionStateReducer.actions;
export default MissionStateReducer.reducer;
