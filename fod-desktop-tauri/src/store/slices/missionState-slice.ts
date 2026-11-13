import { Mission } from "@prisma/client";
import { createSlice } from "@reduxjs/toolkit";

export interface MissionStateType {
  missionNumber: number | null;
  displayId?: number | null;
  duration:number|null;
  isStart: boolean;
  isTerminate: boolean;
  isPause: boolean;
  isLoading: boolean;
  isNotificationOn: boolean;
  isPauseLoading: boolean;
  isActive:boolean;
  isExplore?: boolean;
  status?: string;
}

const initialState: MissionStateType = {
  missionNumber: null,
  displayId: null,
  duration:null,
  isStart: false,
  isTerminate: false,
  isPause: true,
  isLoading: false,
  isNotificationOn: false,
  isPauseLoading: false,
  isActive:false,
  isExplore: false,
  status: undefined,
};

const MissionStateReducer = createSlice({
  name: 'MissionState',
  initialState,
  reducers: {
    start_Mission: (state, action) => {
      const { id:missionNumber, displayId=null, isActive=true, duration=null, isExplore=false, status}= action.payload;
      state.missionNumber = missionNumber;
      state.displayId = displayId;
      state.isStart = true;
      state.isLoading = false;
      state.isActive=isActive;
      state.isExplore = isExplore || !isActive;
      state.duration=duration;
      state.status = status;
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
      state.displayId = null;
      state.isLoading = false;
      state.isNotificationOn = false;
      state.isPauseLoading = false;
      state.isActive = false;
      state.isExplore = false;
      state.status = undefined;
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
