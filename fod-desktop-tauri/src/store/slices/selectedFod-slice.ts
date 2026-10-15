import { createSlice } from "@reduxjs/toolkit";

interface Fod {
  FodId: number | null;
  FodPoint: string | null;
  FodPoints: any; // Modify this to the actual type
  status: string | null;
}

export interface SelectedFodStateType {
  FodStatus: number;
  isSidebarVisible: boolean;
  isSidebarFodDetailVisible: boolean;
  fod: Fod;
  selectedFrame?:any;
  origin?:string;
}

const initialState: SelectedFodStateType = {
  FodStatus: 0,
  isSidebarVisible: false,
  isSidebarFodDetailVisible: false,
  fod: {
    FodId: null,
    FodPoint: null,
    FodPoints: null,
    status: null,
  },
  selectedFrame:null,
  origin:''
};

const SelectedFodReducer = createSlice({
  name: 'SelectedFodReducer',
  initialState,
  reducers: {
    update_SelectedFod: (state, action) => {
      const { payload } = action;
      let {fod,origin}=payload;
      console.log("updated selectedfod",fod)
      state.isSidebarFodDetailVisible = true;
      state.fod = { ...fod };
      state.origin=origin;
    },
    remove_SelectedFod: (state) => {
      console.log("remove selected fod")
      state.isSidebarFodDetailVisible = false;
      state.FodStatus = 0;
      state.fod.FodId = null;
      state.fod.FodPoint = null;
      state.fod.FodPoints = null;
      state.fod.status = null;
      state.selectedFrame=null;
      state.origin='';
    },
    set_FodStatus: (state, action) => {
      const { payload: FodStatus } = action;
      state.FodStatus = FodStatus;
    },
    set_StatusOFFod: (state, action) => {
      const { payload: status } = action;
      state.fod.status = status;
    },
    reset_SelectedFod: (state) => {
      state.isSidebarVisible = false;
      state.isSidebarFodDetailVisible = false;
      state.FodStatus = 0;
      state.fod.FodId = null;
      state.fod.FodPoint = null;
      state.fod.FodPoints = null;
      state.fod.status = null;
      state.selectedFrame=null;
      state.origin=''
    },
    setSideBarVisibility: (state, action) => {
      state.isSidebarVisible = action.payload;
    },
    close_SideBarFodDetail: (state) => {
      state.isSidebarFodDetailVisible = false;
      state.selectedFrame=null;
    },
    selectFrame_SideBar: (state,action) => {
      state.selectedFrame=action.payload;
    },
    unSelectFrame_SideBar: (state) => {
      state.selectedFrame=null;
    },
  },
});

export const {
  update_SelectedFod,
  remove_SelectedFod,
  reset_SelectedFod,
  set_FodStatus,
  setSideBarVisibility,
  set_StatusOFFod,
  close_SideBarFodDetail,
  selectFrame_SideBar,
  unSelectFrame_SideBar
} = SelectedFodReducer.actions;
export default SelectedFodReducer.reducer;
