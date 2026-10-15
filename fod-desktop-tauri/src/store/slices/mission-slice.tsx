import { createSlice } from '@reduxjs/toolkit';

interface Item {
  id: number;
  name: string;
}

interface MissionState {
  fod: any[];
}

const initialState: MissionState = {
  fod: [],
};

const missionSlice = createSlice({
  name: 'mission',
  initialState,
  reducers: {
    pushFod(state, action) {
      state.fod.push(action.payload)
    },
  },
});

export const { pushFod } = missionSlice.actions;
export default missionSlice.reducer;