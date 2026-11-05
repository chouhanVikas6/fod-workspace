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

function normalizeFodItem(item: any) {
  if (!item || typeof item !== 'object') return item;
  const parsedTs =
    typeof item._ts === 'number'
      ? item._ts
      : typeof item.timestamp === 'number'
      ? item.timestamp
      : item.timestamp
      ? Date.parse(item.timestamp) || 0
      : 0;
  let parsedLoc = item._loc;
  if (parsedLoc === undefined && item.location) {
    if (typeof item.location === 'object') {
      parsedLoc = item.location;
    } else if (typeof item.location === 'string') {
      try {
        parsedLoc = JSON.parse(item.location);
      } catch {
        parsedLoc = null;
      }
    }
  }
  return {
    ...item,
    groupId: Number(item.groupId),
    _ts: parsedTs,
    _loc: parsedLoc ?? null,
  };
}

const FodReducer = createSlice({
  name: 'FodReducer',
  initialState,
  reducers: {
    pushFod: (state, action) => {
      const raw = action.payload;
      if (!raw) return;
      const payload = normalizeFodItem(raw);
      if (payload.frame && !String(payload.frame).startsWith('data:')) {
        payload.frame = "data:image/jpeg;base64," + payload.frame;
      }

      const gid = payload.groupId;
      const existingIdx = state.fodMap[gid];
      if (existingIdx !== undefined && state.fods[existingIdx]) {
        state.fods[existingIdx] = payload;
        return;
      }

      state.fods.unshift(payload);
      if (state.fods.length > FodListsLimit) {
        state.fods.length = FodListsLimit;
      }
      const map: Record<number, number> = {};
      for (let i = 0; i < state.fods.length; i++) {
        map[state.fods[i].groupId] = i;
      }
      state.fodMap = map;
    },
    syncFod: (state, action) => {
      const { payload } = action;
      if (!Array.isArray(payload) || payload.length === 0) return;

      const addedGroups = new Set<number>();
      const tempFod: any[] = [];

      for (let i = 0; i < payload.length; i++) {
        const raw = payload[i];
        if (!raw || raw.groupId === undefined || raw.groupId === null) continue;
        const gid = Number(raw.groupId);
        const existingIdx = state.fodMap[gid];

        if (existingIdx !== undefined && state.fods[existingIdx]) {
          const prev = state.fods[existingIdx];
          state.fods[existingIdx] = normalizeFodItem({ ...prev, ...raw });
        } else if (!addedGroups.has(gid)) {
          addedGroups.add(gid);
          tempFod.push(normalizeFodItem(raw));
        }
      }

      if (tempFod.length > 0) {
        // Prepend new items (ordered newest-first) and cap at FodListsLimit (25,000)
        tempFod.reverse();
        const combined = tempFod.concat(state.fods);
        if (combined.length > FodListsLimit) {
          combined.length = FodListsLimit;
        }
        state.fods = combined;

        const map: Record<number, number> = {};
        for (let i = 0; i < state.fods.length; i++) {
          map[state.fods[i].groupId] = i;
        }
        state.fodMap = map;
      }
    },
    add_updateFod: (state, action) => {
      const { payload } = action;
      for (const listName in payload) {
        if (listName === 'newFod') {
          continue;
        }
        payload[listName].forEach((item: any) => {
          state[listName][item.index] = {
            ...state[listName][item.index],
            FodPoint: item.fod.FodPoint,
          };
        });
      }

      if (payload['newFod']) {
        const normalized = payload['newFod'].map(normalizeFodItem).reverse();
        state.fods.unshift(...normalized);
        if (state.fods.length > FodListsLimit) {
          state.fods = state.fods.slice(0, FodListsLimit);
        }
        const map: Record<number, number> = {};
        for (let i = 0; i < state.fods.length; i++) {
          map[state.fods[i].groupId] = i;
        }
        state.fodMap = map;
      }
    },
    accept_Fod: (state, action) => {
      const fodId = Number(action.payload);
      const mappedIdx = state.fodMap[fodId];
      const idx = mappedIdx !== undefined ? mappedIdx : state.fods.findIndex((f: any) => Number(f.groupId) === fodId);
      if (idx !== -1 && state.fods[idx]) {
        state.fods[idx].groupStatus = "ACCEPTED";
        state.fods[idx].status = "ACCEPTED";
      }
    },
    reject_Fod: (state, action) => {
      const fodId = Number(action.payload);
      const mappedIdx = state.fodMap[fodId];
      const idx = mappedIdx !== undefined ? mappedIdx : state.fods.findIndex((f: any) => Number(f.groupId) === fodId);
      if (idx !== -1 && state.fods[idx]) {
        state.fods[idx].groupStatus = "REJECTED";
        state.fods[idx].status = "REJECTED";
      }
    },
    undo_fod: (state, action) => {
      const fodId = Number(action.payload);
      const mappedIdx = state.fodMap[fodId];
      const idx = mappedIdx !== undefined ? mappedIdx : state.fods.findIndex((f: any) => Number(f.groupId) === fodId);
      if (idx !== -1 && state.fods[idx]) {
        state.fods[idx].groupStatus = "NEW";
        state.fods[idx].status = "NEW";
      }
    },
    add_ToClearedFod: (state, action) => {
      const fodId = Number(action.payload);
      const mappedIdx = state.fodMap[fodId];
      const idx = mappedIdx !== undefined ? mappedIdx : state.fods.findIndex((f: any) => Number(f.groupId) === fodId);
      if (idx !== -1 && state.fods[idx]) {
        state.fods[idx].groupStatus = "CLEARED";
        state.fods[idx].status = "CLEARED";
      }
    },
    add_FodsOnRefresh: (state, action) => {
      const { payload: data } = action;
      state.fods = [
        ...(data.alertQueueFods || []),
        ...(data.clearenceQueueFods || []), 
        ...(data.rejectedFods || []),
        ...(data.clearedFods || [])
      ].slice(0, FodListsLimit).map(normalizeFodItem);
      
      // Rebuild the fodMap
      const map: Record<number, number> = {};
      for (let i = 0; i < state.fods.length; i++) {
        map[state.fods[i].groupId] = i;
      }
      state.fodMap = map;
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
    resetFods: (state) => {
      state.fods = [];
      state.fodMap = {};
      state.doubleAccepted = {};
    },
  },
});

export const { pushFod, syncFod, add_updateFod, accept_Fod, reject_Fod, set_ImageModal, add_ToClearedFod, undo_fod, add_FodsOnRefresh, set_SortBy, set_Class_Size, remove_Class, setDashboardStatus, doubleAccept, resetFods } = FodReducer.actions;
export default FodReducer.reducer;
