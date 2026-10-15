import { createSlice } from "@reduxjs/toolkit";

interface CollectorLocation {
  coord: [number, number]; 
  heading: number;
}

export interface MissionControlStateType {
  isMapOpen: boolean;
  selectedQueue: string[]; 
  collector_location: CollectorLocation;
}

const initialState: MissionControlStateType = {
  isMapOpen: false,
  selectedQueue: ["ACCEPTED"],
  collector_location: { coord: [9.9482644, 76.270702], heading: 0 },
};

const Mission_Control_Reducer = createSlice({
  name: "map_state",
  initialState,
  reducers: {
    toggle_Mapview: (state) => {
      console.log(state.isMapOpen)
      state.isMapOpen = !state.isMapOpen;
    },
    set_Mapview: (state) => {
      state.isMapOpen = true;
    },

    update_collector_location: (state, action) => {
      const { payload } = action;
      state.collector_location = payload;
    },
    set_selectedQueue: (state, action) => {
      const { payload } = action;
      const index = state.selectedQueue.findIndex((item) => item === payload);
      const updatedSelectedQueue = [...state.selectedQueue];

      if (index !== -1) {
        updatedSelectedQueue.splice(index, 1);
      } else {
        updatedSelectedQueue.push(payload);
      }

      console.log(updatedSelectedQueue)

      state.selectedQueue= updatedSelectedQueue; // Return a new state object with updated selectedQueue
    },
  },
});

export const {
  toggle_Mapview,
  set_Mapview,
  update_collector_location,
  set_selectedQueue,
} = Mission_Control_Reducer.actions;
export default Mission_Control_Reducer.reducer;
