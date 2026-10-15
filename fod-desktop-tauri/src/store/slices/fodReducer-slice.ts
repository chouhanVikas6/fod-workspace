import { createSlice } from "@reduxjs/toolkit";
import { config } from "@/config/clientConfig";
import { base64decodedFrame } from "@/utils/DecodeFrames";

interface Fod {
  id?:number;
  FodId: number;
  FodPoint: string;
  // Other fod properties
  status?: string; // 0: Alert, 1: Cleared, 2: Rejected, 3: Cleared (permanent)
  imgModal?: boolean; // Flag for image modal visibility
  groupStatus?: string;
  groupId: number;
  sysid?:string;
}

interface FodQueue {
  [index: number]: Fod;
}

interface Filters {
  sortby: string;
  classes: string[];
  groupStatus: string;
  size: {
    min: number;
    // Other size filter properties
  };
}

export interface FodStateType {
  filters: Filters;
  fodMap:{
    [key: number]: number;
  };
  fods: Array<Fod>;
  doubleAccepted:{
    [key: number]: boolean;
  };
}

const { FodListsLimit } = config;

const initialState: FodStateType = {
  fodMap:{},
  filters: {
    sortby: 'latest',
    classes: ['Metallic', 'Rocks/Ashpalt', 'Organic', 'Non-Metallic'],
    size: { ...(config.filters.size) },
    groupStatus:'NEW'
  },
  fods: [],
  doubleAccepted: {},
};

const FodReducer = createSlice({
  name: 'FodReducer',
  initialState,
  reducers: {
    pushFod: (state, action) => {
      const { payload } = action;
      if(payload.frame)payload.frame="data:image/jpeg;base64,"+payload.frame;
      
      if(state.fodMap.hasOwnProperty(payload.id)){
        state.fods[state.fodMap[payload.id]]=payload;
      }else{
        state.fods.unshift(payload);
      }
      // Rebuild the fodMap
      let map:any={};
      state.fodMap = state.fods.reduce((map, fod, index) => {
        map[fod.groupId] = index;
        return map;
      }, map);
    },
    syncFod: (state, action) => {
      const { payload } = action;
      // Merge the new fods into the state
      let tempFod:any=[];
      payload.forEach((newFod) => {
        if(!newFod.groupId)return;
        
        // if(newFod.frame)newFod.frame=base64decodedFrame(newFod.frame);
        const existingFodIndex = state.fods.findIndex(fod => fod.groupId === newFod.groupId);
    
        if (existingFodIndex !== -1) {
          // If the FOD already exists, update it
          state.fods[existingFodIndex] = { ...state.fods[existingFodIndex], ...newFod };
        } else {
          // If the FOD doesn't exist, add it to the start of the array
          // state.fods.unshift(newFod);
          tempFod.push(newFod); 
        }
      });
      if(tempFod.length>0){
        state.fods=[...tempFod,...state.fods];
      }
    
      // Rebuild the fodMap
      let map:any={};
      state.fodMap = state.fods.reduce((map, fod, index) => {
        map[fod.groupId] = index;
        return map;
      }, map);
    },
    add_updateFod: (state, action) => {
      const { payload } = action;
      for (const listName in payload) {
        if (listName === 'newFod') {
          continue;
        }
        payload[listName].forEach((item) => {
          state[listName][item.index] = {
            ...state[listName][item.index],
            FodPoint: item.fod.FodPoint,
          };
        });
      }

      if (payload['newFod']) {
        state.fods.unshift(...payload['newFod'].reverse());
        if (state.fods.length > FodListsLimit) {
          state.fods = state.fods.slice(0, FodListsLimit);
        }
      }
    },
    accept_Fod: (state, action) => {
      const { payload: fodId } = action;
      const idx = state.fods.findIndex((f: any) => f.groupId === fodId);
      if (idx !== -1) {
        state.fods[idx].groupStatus = "ACCEPTED";
      } else if (state.fodMap && state.fodMap[fodId] !== undefined && state.fods[state.fodMap[fodId]]) {
        state.fods[state.fodMap[fodId]].groupStatus = "ACCEPTED";
      }
    },
    reject_Fod: (state, action) => {
      const { payload: fodId } = action;
      const idx = state.fods.findIndex((f: any) => f.groupId === fodId);
      if (idx !== -1) {
        state.fods[idx].groupStatus = "REJECTED";
      } else if (state.fodMap && state.fodMap[fodId] !== undefined && state.fods[state.fodMap[fodId]]) {
        state.fods[state.fodMap[fodId]].groupStatus = "REJECTED";
      }
    },
    undo_fod: (state, action) => {
      console.log({action})
      const { payload: fodId } = action;
      const idx = state.fods.findIndex((f: any) => f.groupId === fodId);
      if (idx !== -1) {
        state.fods[idx].groupStatus = "NEW";
      } else if (state.fodMap && state.fodMap[fodId] !== undefined && state.fods[state.fodMap[fodId]]) {
        state.fods[state.fodMap[fodId]].groupStatus = "NEW";
      }
    },
    add_ToClearedFod: (state, action) => {
       const { payload: fodId } = action;
       const idx = state.fods.findIndex((f: any) => f.groupId === fodId);
       if (idx !== -1) {
         state.fods[idx].groupStatus = "CLEARED";
       } else if (state.fodMap && state.fodMap[fodId] !== undefined && state.fods[state.fodMap[fodId]]) {
         state.fods[state.fodMap[fodId]].groupStatus = "CLEARED";
       }
    },
    add_FodsOnRefresh: (state, action) => {
      const { payload: data } = action;
      state.fods = [
        ...(data.alertQueueFods || []),
        ...(data.clearenceQueueFods || []), 
        ...(data.rejectedFods || []),
        ...(data.clearedFods || [])
      ];
      
      // Rebuild the fodMap
      let map:any = {};
      state.fodMap = state.fods.reduce((map, fod, index) => {
        map[fod.groupId] = index;
        return map;
      }, map);
    },
    set_ImageModal: (state, action) => {
      const { FodId, flag } = action.payload;
      if (state.fodMap.hasOwnProperty(FodId)) {
        state.fods[state.fodMap[FodId]] = { ...state.fods[state.fodMap[FodId]], imgModal: flag };
      }
    },
    set_SortBy: (state, action) => {
      const sortBy = action.payload;
      // Update the sortby filter value
      state.filters.sortby = sortBy;
    },
    set_Class_Size: (state, action) => {
      const { classes, minSize } = action.payload;
      state.filters.classes = classes;
      state.filters.size.min = minSize;
    },
    remove_Class: (state, action) => {
      const { payload: classToRemove } = action;
      state.filters.classes = state.filters.classes.filter((item) => item !== classToRemove)
    },
    setDashboardStatus:(state, action)=>{
      const { payload } = action;
      if(payload!='NEW' && payload!="ACCEPTED"){
        state.filters.groupStatus='NEW';
      }else{
        state.filters.groupStatus=payload;
      }
    },
    doubleAccept: (state, action) => {
      const { payload: fodId } = action;
      state.doubleAccepted[fodId] = true;
    },
  },
});

export const { pushFod, syncFod, add_updateFod, accept_Fod, reject_Fod, set_ImageModal, add_ToClearedFod, undo_fod, add_FodsOnRefresh, set_SortBy, set_Class_Size, remove_Class,setDashboardStatus ,doubleAccept} = FodReducer.actions;
export default FodReducer.reducer;
