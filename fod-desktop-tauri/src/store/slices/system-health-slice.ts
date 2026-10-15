import { createSlice } from '@reduxjs/toolkit';

export interface SystemHealthStateType {
    carData:{
        data: {
            primary_data: Object,
            secondary_data: Object
        },
        eventStatus: boolean,
        dataStatus: boolean
    },
    RtkData: { data: Object, eventStatus: boolean, dataStatus: boolean }, 
    AiHealth: { data: Object[], eventStatus: boolean, dataStatus: boolean }, 
    latency:{
        ping:number,
        connected:boolean
    },
    availableCommunication:[],
    camera:null,
    byteData?: {
        data: any,
        eventStatus: boolean,
        dataStatus: boolean
    }
}

const initialState: SystemHealthStateType = {
    carData: {
        data: {
            primary_data: {},
            secondary_data: {}
        },
        eventStatus: false,
        dataStatus: false
    },
    RtkData: { data: {}, eventStatus: false, dataStatus: false },
    AiHealth: { data: [], eventStatus: false, dataStatus: false },
    latency: {
        ping:5000,
        connected:false
    },
    availableCommunication:[],
    camera:null,
    byteData: {
        data: null,
        eventStatus: false,
        dataStatus: false
    }
};

const SystemHealthReducer = createSlice({
    name: 'SystemHealth',
    initialState,
    reducers: {
        update_SystemHealth: (state, action) => {
            // Payloads arrive from two sources (gui socket broadcast and the
            // bite-data SSE stream) — merge only the fields that are present so
            // a partial payload never wipes the other source's data.
            const { carData, RtkData, AiHealth, latency, availableCommunication, camera, byteData } = action.payload;
            if (carData) state.carData = carData;
            if (RtkData) state.RtkData = RtkData;
            if (AiHealth) {
                // Two sources feed AiHealth (gui socket + bite SSE). Don't let a
                // source with an empty camera list wipe out a populated one.
                const incoming = Array.isArray(AiHealth.data) ? AiHealth.data : [];
                const existing = Array.isArray(state.AiHealth?.data) ? state.AiHealth.data : [];
                if (incoming.length > 0 || existing.length === 0) {
                    state.AiHealth = AiHealth;
                }
            }
            if (latency) state.latency = latency;
            if (availableCommunication) state.availableCommunication = availableCommunication;
            if (camera !== undefined) state.camera = camera;
            if (byteData) {
                state.byteData = byteData;
            }
        },
    },
});

export const { update_SystemHealth } = SystemHealthReducer.actions;
export default SystemHealthReducer.reducer;