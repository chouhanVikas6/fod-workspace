// Base URL for the internal GUI server (the Node sidecar, see
// docs/electron-to-tauri-migration-plan.md). The renderer has no env vars and
// no IPC — every HTTP call (REST via axiosClient, SSE via EventSource,
// socket.io) targets this origin directly. Keep call sites deriving from
// here instead of hardcoding 'http://localhost:7985' so there is one place
// to change if the sidecar port ever moves.
const GUI_SERVER_IP = '127.0.0.1';
const GUI_SERVER_PORT = 7985;
export const ServerBase = `http://${GUI_SERVER_IP}:${GUI_SERVER_PORT}`;

export const config ={
    PORT:3000,
    ServerIP:GUI_SERVER_IP,
    ServerPort:GUI_SERVER_PORT,
    // FOD frame images are served by the internal HTTP server (the Node
    // sidecar, src/pages/api/socket.ts) — absolute URL so it works from the
    // vite dev server, a packaged build, and the Tauri webview alike.
    ImagesBase:`${ServerBase}/images`,
    SocketServerEndPoint:'/Gui',
    
     systemHealthInitialState:{
         carData:{
                  vel:null,
                  heading:null,
                  coord:[null,null],
                  deviation:null
                 },
         clienData:{
                   heading:null,
                   loaction:[null,null]
                   },
         Aihealth:[],
     },
     carThresholds:{
         maxSpeed:35,
         minSpeed:20,
         maxDeviation:10
     },

     FodListsLimit:1000,
     MissionListBatchSize:10000,

     map:{
        mapboxToken: ((import.meta as any).env?.VITE_MAPBOX_TOKEN || (import.meta as any).env?.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '') as string,
        initialCenter:[76.27231992733236,9.946394872156189],
        initialZoom:14,
        pathThreshold:100,
        pathGap:1,
        boundaryPoints: [
            { lat: 9.9447681, lon: 76.2721646 },
            { lat: 9.9457570, lon: 76.2719205 },
            { lat: 9.9460083, lon: 76.27212 },
            { lat: 9.9449009, lon: 76.2725 },
            ],
            lateraldistance: 10 ,//in meters
    lateralShiftThreshold: 5 ,
    OFFSET:3,
    boundingBoxPadding:5,
    pathDirection: 'LENGTHWISE' as 'LENGTHWISE' | 'CROSSWISE' | 'OPTIMAL',
    reversePath: false,
     },
     filters:{
       size:{ min:3,
        max:600
        }
    },

    FodCard:{
        distanceUpdatedTimeInterval:2000,
        FodSize:{
            medium:30,
            large:90   
        }
    },
    InitialLoaderTimeout:3000,
    cameraMap:{
        "flir00":1,
        "flir01":2,
        "flir02":3,
        "flir03":4,
        "flir04":5,
        "flir05":6,
        "flir06":7,
        "flir07":8,
        "lucid08":9,
        "lucid09":10,
        "lucid10":11,
        "lucid11":12,
        "lucid12":13,
        "lucid13":14,
        "lucid14":15,
        "lucid15":16,
        "lucid16":17,
        "lucid17":18,
        "lucid18":19,
        "lucid19":20,
        "lucid20":21,
        "lucid21":22,
        "lucid22":23,
        "lucid23":24,
        "lucid24":25,
        "lucid25":26
    },
    missedFod:[
        {
            name:"mark",
            lat:9.958347194282139,
            lon:76.27248292647627,
            sd:9,
            groupId:772
        }
    ]

}

//expiry time for the data in seconds
export const expiryTime = {
    rtkData: 1,
};

//fixed config data
export const AUTH_SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';