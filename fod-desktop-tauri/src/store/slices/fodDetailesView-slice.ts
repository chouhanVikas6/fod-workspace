import { createSlice } from '@reduxjs/toolkit';

export interface FodDetailedViewType {
  isOpen: boolean;
  isFilteredFod: boolean | null; // Can be null if not applicable
  fod: {
    FodId: number | null;
    FodPoint: string | null;
    FodPoints: string[] | null;
    status: string | null;
  };
  origin?:string;
}

const initialState: FodDetailedViewType = {
  isOpen: false,
  isFilteredFod: null,
  fod: {
    FodId: null,
    FodPoint: null,
    FodPoints: null,
    status: null,
  },
  origin:''
};

const FodDetailedViewReducer = createSlice({
  name: 'FodDetailedViewReducer',
  initialState,
  reducers: {
    update_DetailViewFod(state, action) {
      const { fod, isFilteredFod, origin, onlyIfOpen } = action.payload;
      if (onlyIfOpen) {
        if (!state.isOpen) return;
        const currentGroupId = (state.fod as any)?.groupId;
        if (currentGroupId != null && fod?.groupId != null && currentGroupId !== fod.groupId) {
          return;
        }
      }
      state.isFilteredFod = isFilteredFod;
      state.isOpen = true;
      state.fod = { ...fod };
      state.origin = origin;
    },
    remove_DetailedViewFod(state) {
      state.isOpen = false;
      state.fod = {
        FodId: null,
        FodPoint: null,
        FodPoints: null,
        status: null,
      };
      state.origin = '';
    },
    reset_DetailedViewFod(state) {
      state.isOpen = false;
      state.isFilteredFod = null;
      state.fod = {
        FodId: null,
        FodPoint: null,
        FodPoints: null,
        status: null,
      };
      state.origin = '';
    },
  },
});

export const {
  update_DetailViewFod,
  remove_DetailedViewFod,
  reset_DetailedViewFod,
} = FodDetailedViewReducer.actions;
export default FodDetailedViewReducer.reducer;
