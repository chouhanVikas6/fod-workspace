import { createSlice } from "@reduxjs/toolkit";

interface WebCamImage {
  // Define properties of a webcam image here (e.g., url, id, etc.)
}

export interface WebCamStateType {
  WebCamStream: null;
  isWebCamStart: boolean;
  isWebCamOpen: boolean;
  selectedList: boolean; // true: before clearing, false: after clearing
  isFodFinalReviewOpen: boolean;
  beforeClear: WebCamImage[];
  afterClear: WebCamImage[];
}

const initialState: WebCamStateType = {
  WebCamStream: null,
  isWebCamStart: false,
  isWebCamOpen: false,
  selectedList: true,
  isFodFinalReviewOpen: false,
  beforeClear: [],
  afterClear: [],
};

const WebCamReducer = createSlice({
  name: "WebCam",
  initialState,
  reducers: {
    addBeforeClearImg: (state, action) => {
      state.beforeClear = [action.payload, ...state.beforeClear];
    },
    addAfterClearImg: (state, action) => {
      state.afterClear = [action.payload, ...state.afterClear];
    },
    set_SelectedImgList: (state, action) => {
      const selectedList = action.payload;
      state.selectedList = selectedList;
    },
    set_FodFinalReview: (state, action) => {
      state.isFodFinalReviewOpen = action.payload;
      if (action.payload) {
        state.isWebCamOpen = false;
      }
    },
    open_webcam: (state) => {
      state.isWebCamOpen = true;
    },
    close_webcam: (state) => {
      state.isWebCamOpen = false;
    },
    clearWebCamImages: (state) => {
      state.beforeClear = [];
      state.afterClear = [];
    },
    clearWebCamData: (state) => {
      state.isWebCamOpen = false;
      state.isFodFinalReviewOpen = false;
      state.selectedList = true;
      state.beforeClear = [];
      state.afterClear = [];
    },
    deleteFromBeforeClearImg: (state, action) => {
      if (
        action.payload !== undefined &&
        action.payload !== null &&
        typeof action.payload === "number" &&
        Number.isFinite(action.payload) &&
        action.payload < state.beforeClear.length &&
        action.payload >= 0
      ) {
        state.beforeClear.splice(action.payload, 1);
      }
    },
    deleteFromAfterClearImg: (state, action) => {
      if (
        action.payload !== undefined &&
        action.payload !== null &&
        typeof action.payload === "number" &&
        Number.isFinite(action.payload) &&
        action.payload < state.afterClear.length &&
        action.payload >= 0
      ) {
        state.afterClear.splice(action.payload, 1);
      }
    },
    resetSideBarLists: (state) => {
      return initialState;
    },
  },
});

export const {
  addBeforeClearImg,
  addAfterClearImg,
  deleteFromBeforeClearImg,
  deleteFromAfterClearImg,
  resetSideBarLists,
  set_SelectedImgList,
  close_webcam,
  open_webcam,
  clearWebCamImages,
  set_FodFinalReview,
  clearWebCamData,
} = WebCamReducer.actions;

export default WebCamReducer.reducer;
