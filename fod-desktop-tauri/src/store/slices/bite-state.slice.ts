import { createSlice } from '@reduxjs/toolkit';

export interface BiteStateType {
    carData: {
        temp: number;
        volt: number;
        connection: boolean;
        memory_gb: number;
        space_gb: number;
        rtk: {
            primary: {
                location: {
                    lat: number;
                    lon: number;
                    sd: number;
                    heading: number;
                };
                status: string;
                satellite: number;
            };
            secondary: {
                location: {
                    lat: number;
                    lon: number;
                    sd: number;
                    heading: number;
                };
                status: string;
                satellite: number;
            };
            timer_script_delay: number;
            updatedAt: string;
        };
        updatedAt: string;
    };
}

const initialState: BiteStateType = {
    carData:{
        "temp": 0,
        "volt": 0,
        "connection": false,
        "memory_gb": 0,
        "space_gb": 0,
        "rtk": {
            "primary": {
                "location": {
                    "lat": 0,
                    "lon": 0,
                    "sd": 0,
                    "heading": 0
                },
                "status": "single",
                "satellite": 0
            },
            "secondary": {
                "location": {
                    "lat": 0,
                    "lon": 0,
                    "sd": 0,
                    "heading": 0
                },
                "status": "single",
                "satellite": 0
            },
            "timer_script_delay": 0,
            "updatedAt": "1970-01-01T00:00:00.000Z"
        },
        "updatedAt": "1970-01-01T00:00:00.000Z"
    }
};

const BiteStateReducer = createSlice({
    name: 'BiteState',
    initialState,
    reducers: {
        update_BiteState: (state, action) => {
            const { carData } = action.payload;
            state.carData = carData;
        },
    },
});

export const { update_BiteState } = BiteStateReducer.actions;
export default BiteStateReducer.reducer;