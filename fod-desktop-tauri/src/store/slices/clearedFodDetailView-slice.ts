import { createSlice } from '@reduxjs/toolkit';

export interface ClearedFodDetailedViewType {
  isOpen: boolean;
  fod: {
    FodId: number | null;
    FodPoint: string | null;
    FodPoints: string[] | null;
    status: string | null;
    collectorResponse: string | null;
    origin?:string;
  };
  
}

const initialState: ClearedFodDetailedViewType= {
  isOpen: false,
  fod: {
    FodId: null,
    FodPoint: null,
    FodPoints: null,
    status: null,
    collectorResponse: null,
      origin:''
  },

};

const ClearedFodDetailedViewReducer = createSlice({
  name: 'ClearedFodDetailedViewReducer',
  initialState,
  reducers: {
    update_ClearedDetailViewFod(state, action) {
      const { fod } = action.payload;
      state.isOpen = true;
      state.fod = { ...fod };
    },
    remove_ClearedDetailedViewFod(state) {
      state.isOpen = false;
      state.fod.FodId = null;
      state.fod.FodPoint = null;
      state.fod.FodPoints = null;
      state.fod.status = null;
      state.fod.collectorResponse = null;
    },
    reset_ClearedDetailedViewFod(state) {
      state.isOpen = false;
      state.fod.FodId = null;
      state.fod.FodPoint = null;
      state.fod.FodPoints = null;
      state.fod.status = null;
      state.fod.collectorResponse = null;
    },
  },
});

export const {
  update_ClearedDetailViewFod,
  remove_ClearedDetailedViewFod,
  reset_ClearedDetailedViewFod,
} = ClearedFodDetailedViewReducer.actions;
export default ClearedFodDetailedViewReducer.reducer;
