import { createSlice } from "@reduxjs/toolkit";

interface Mission {
  // Define properties of a mission object here (e.g., id, name, details, etc.)
}

export interface MissionSelectorStateType {
  isMissionSelectorOpen: boolean;
  MissionsList: Mission[];
}

const initialState: MissionSelectorStateType = {
  isMissionSelectorOpen: true,
  MissionsList: [],
};

const MissionSelectorReducer = createSlice({
  name: 'MissionSelector',
  initialState,
  reducers: {
    close_MisionSelector: (state, action) => {
      state.isMissionSelectorOpen = false;
    },
    update_MissionsList: (state, action) => {
      const { payload: pastMissions } = action;
      state.MissionsList = [...state.MissionsList, ...pastMissions];
    },
  },
});

export const { close_MisionSelector, update_MissionsList } = MissionSelectorReducer.actions;
export default MissionSelectorReducer.reducer;
