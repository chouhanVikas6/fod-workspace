import { Reducer, combineReducers, configureStore } from '@reduxjs/toolkit';
import themeReducer, { ThemeStateType } from "./slices/theme-slice";
import languageReducer, { LanguageStateType } from "./slices/language-slice";
import FodReducer, { FodStateType } from "./slices/fodReducer-slice";
import FodDetailedViewReducer, { FodDetailedViewType } from "./slices/fodDetailesView-slice";
import MissionStateReducer, { MissionStateType } from "./slices/missionState-slice";
import MapReducer, { MissionControlStateType } from "./slices/mapReducer-slice";
import SystemHealth, { SystemHealthStateType } from "./slices/system-health-slice";
import BiteStateReducer, {
  
} from "./slices/bite-state.slice"
import WebCam, { WebCamStateType } from "./slices/webCam-slice";
import MissionSelector, { MissionSelectorStateType } from "./slices/missionSelector-slice";
import SelectedFodReducer, { SelectedFodStateType } from "./slices/selectedFod-slice";
import ClearedFodDetailView, { ClearedFodDetailedViewType } from "./slices/clearedFodDetailView-slice";
import { persistStore, persistReducer } from 'redux-persist'
import storage from 'redux-persist/lib/storage' // defaults to localStorage for web
 

// export interface RootState {
//   theme: Reducer<ThemeStateType>;
//   language: Reducer<LanguageStateType>;
//   FodReducer: Reducer<FodStateType>;
//   MapReducer:Reducer<MissionControlStateType>;
//     SystemHealth:Reducer<SystemHealthStateType>;
//     WebCam:Reducer<WebCamStateType>;
//     MissionSelector:Reducer<MissionSelectorStateType>;
//     ClearedFodDetailView:Reducer<ClearedFodDetailedViewType>;
//     MissionState:Reducer<MissionStateType>;
//     FodDetailedView:Reducer<FodDetailedViewType>;
//     SelectedFod:Reducer<SelectedFodStateType>;
// }

// Define the persist configuration
const persistConfig = {
  key: 'root',  // Key to persist the entire store or part of it
  storage,      // Storage mechanism (localStorage)
  whitelist: ['theme', 'language'], // Only persist certain reducers
  // blacklist: ['someNonPersistentReducer'], // Optionally, you can blacklist reducers you don't want to persist
};

const rootReducer = combineReducers({
  theme: themeReducer,
  language: languageReducer,
  FodReducer,
  MapReducer,
  SystemHealth,
  WebCam,
  MissionSelector,
  ClearedFodDetailView,
  MissionState: MissionStateReducer,
  FodDetailedView: FodDetailedViewReducer,
  SelectedFod: SelectedFodReducer,
  BiteState:BiteStateReducer
});

const persistedReducer = persistReducer(persistConfig, rootReducer)

const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {},
    }),
});
const persistor = persistStore(store);
export default store;
export {store,persistor};
export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof rootReducer>;