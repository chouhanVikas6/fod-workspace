import { io, Socket as SocketIOClient } from 'socket.io-client';
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { NextApiRequest, NextApiResponse } from 'next';
import SocketDataStore from '@/lib/socketState';
import { handleFodFromSocket } from '@/services/fod';
import { missionService } from '@/services/mission';
import { syncService } from '@/services/syncing';
import { KafkaSingleton } from '@/utils/kafka/kafka';
import {  upsertGroupData } from '@/services/fod-group';

import { createReadStream, existsSync } from 'fs';
import { parse as parseUrl } from 'url';
import * as path from 'path';
import retrieveData from '../../../custom-api/retrive-data';
import healthData from '../../../custom-api/health-data';

let httpServer: HTTPServer | null = null;
let server: SocketIOServer | null = null;
let socketListener: SocketIOClient | null = null;
let isConnected = false;
let socketData = SocketDataStore.getInstance();
function logevent(event: any) {
  console.log(event);
}
export function IsServerConnected() {
  return isConnected;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
 
  try {
    const kafkaService = new KafkaSingleton(process.env.KAFKA_BROKER)
    if (isConnected) {
      res.send({});
      return;
    } else {
      let sytemHealthStat = {
        carData: {
          data: {
            primary_data: {},
            secondary_data: {}
          },
          eventStatus: false,
          dataStatus: false
        },
        RtkData: { data: {}, eventStatus: false, dataStatus: false },
        // data must stay an array — the renderer (CamerasInfo) iterates it, and
        // the bite-data SSE stream delivers the same field as an array.
        AiHealth: { health: {}, data: [], eventStatus: false, dataStatus: false },
        latency: {
          ping: 5000,
          connected: false
        },
        availableCommunication: [],
        camera:{}
      };
      httpServer?.close()
      // isConnected = true;


      if (!httpServer) {
        httpServer = new HTTPServer((req: any, res: any) => {
          const parsed = parseUrl(req.url || '', true);
          const pathname = parsed.pathname || '';
          
          if (pathname.startsWith('/api/sse/retrive-data')) {
            console.log(`[HTTP SSE Router] Routing to retrieveData: ${pathname}`);
            req.query = parsed.query;
            retrieveData(req, res, () => {});
            return;
          }
          
          if (pathname.startsWith('/api/sse/health-data')) {
            console.log(`[HTTP SSE Router] Routing to healthData: ${pathname}`);
            req.query = parsed.query;
            healthData(req, res, () => {});
            return;
          }
          
          if (pathname.startsWith('/images/')) {
            const relPath = pathname.replace('/images/', '');
            const filePath = path.join(__dirname, '../../fod-images/mission', relPath);
            if (existsSync(filePath)) {
              res.writeHead(200, { 'Content-Type': 'image/jpeg' });
              createReadStream(filePath).pipe(res);
              return;
            }
          }
          
          res.writeHead(404);
          res.end();
        });
        server = new SocketIOServer(httpServer, {
          cors: {
            origin: '*',
          },
        });
        const namespaceRtk = server.of('/rtk');
        const namespaceGui = server.of('/gui');
     


        let filterRecentCommunications = () => {
          const currentTime = new Date().getTime();
          const fiveSecondsAgo = new Date(currentTime - 5000); // 5 seconds ago

          sytemHealthStat.availableCommunication = sytemHealthStat.availableCommunication.filter(comm => {
            const commTime = new Date(comm.timestamp);
            return commTime >= fiveSecondsAgo;
          });

          // The vehicle link is alive when the car backend's heartbeat
          // (Kafka `availableDevice`) has been seen within the last 5s.
          // The legacy socket.io '/client' link no longer exists.
          sytemHealthStat.latency.connected = sytemHealthStat.availableCommunication.some(
            (comm: any) => comm?.type === 'car'
          );
        }

        let filterOtherHealth = () => {
          const currentTime = new Date();
          const fiveSecondsAgo = new Date(currentTime.getTime() - 5000); // 5 seconds ago
      
          sytemHealthStat.AiHealth.health = Object.keys(sytemHealthStat.AiHealth.health || {}).reduce((prvs, current) => {
              const commTime = new Date(sytemHealthStat.AiHealth.health[current].updatedAt);

              if (commTime >= fiveSecondsAgo) {
                  prvs[current] = sytemHealthStat.AiHealth.health[current];
              }

              return prvs;
          }, {});

          // Mirror the per-camera map into a `data` array — the renderer
          // (CamerasInfo, BITE tab) consumes AiHealth.data. Only overwrite when
          // we actually have live camera data, so an empty gui broadcast never
          // clobbers the array the SSE bite stream provides.
          const liveCams = Object.values(sytemHealthStat.AiHealth.health || {});
          if (liveCams.length > 0) {
            sytemHealthStat.AiHealth.data = liveCams;
          }
      };
      

        ["healthDataAi", "carDataAi", "availableDevice", "update", "camera"].forEach((e) => {
          kafkaService.receiveMessages(e, (event: any) => giveHandler(event));
          console.log(`Subscribed to topic: ${e}`);
        });

        const giveHandler = ({ topic, message }: any) => {
          switch (topic) {
            case 'healthDataAi':
              return handleAiHealth(message);
            case 'carDataAi':
              return handleCarData(message);
            case 'availableDevice':
              return availableDeviceHandle(message);
            case 'update':
              return dataUpdateHandler(message);
              case 'camera':
              return handleCamera(message);
              // case 'carFodData':
              // return handleFodFromSocket(JSON.parse(message));
            default:
              return logevent;
          }
        }

        const handleCamera=(message)=>{
          sytemHealthStat.camera=message;
        }

        const dataUpdateHandler = (message) => {
          message = JSON.parse(message);
          if (message.type == 'mission') {
            missionService.upsertMissionData(message.data)
          } else if (message.type == 'fodGroup') {
            upsertGroupData(message.data);
            namespaceGui.emit("update", { type: "fodGroup", message:message.data })
          }else if(message.type=='terminate'){
            namespaceGui.emit('update',message);
          }
        }

        const availableDeviceHandle = (message) => {
          message = JSON.parse(message);
          let old = sytemHealthStat.availableCommunication;
          let ifFind = true;
          let data = old.map((device) => {
            if (device.type == message.type && device.sysId == message.sysId) {
              ifFind = false;
              return message;
            } else {
              return device;
            }
          })
          if (ifFind) {
            data.push(message);
          }
          sytemHealthStat.availableCommunication = data;
        }

        // Raw carDataAi packets (e.g. from the simulator) omit `fix` — normalize
        // to the same shape the car-backend bite organizer produces, otherwise
        // the GNSS header treats the car GPS as not connected.
        const normalizeGpsNode = (node) => node && {
          ...node,
          fix: node.fix || 'RTK',
          sd: node.sd ?? 0.1,
          lat: node.lat ?? 0,
          lon: node.lon ?? 0,
          heading: node.heading ?? 0,
          vel: node.vel ?? node.velocity,
        };

        const handleCarData = (message) => {
          message = JSON.parse(message)
          sytemHealthStat.carData.data = {
            ...message,
            primary_data: normalizeGpsNode(message.primary_data),
            secondary_data: normalizeGpsNode(message.secondary_data),
          };
          sytemHealthStat.carData.eventStatus = true;
          sytemHealthStat.carData.dataStatus = true;
          sytemHealthStat.RtkData.eventStatus = true;;
          sytemHealthStat.RtkData.dataStatus = true;
          return true;
        }

        const handleAiHealth = (message) => {
          // console.log("recieved health",message)
          message = JSON.parse(message)
          // console.log(message)
          sytemHealthStat.AiHealth.health[message.CAM_ID] = {...message,updatedAt:new Date().getTime()};
          return true;
        }




        // rtk_data { lat: 9.95394743, lon: 76.27006623, sd: 0, heading: 5, fix: 'RTK' }
        namespaceRtk.on('connection', (socket: Socket) => {
          console.log('A client connected rtk server');

          socket.on('disconnect', () => {
            console.log('A client disconnected Rtk server');
          });

          socket.on('rtk_data', (payload) => {
            console.log("rtk_data",payload)
            sytemHealthStat.RtkData.data = payload;
            sytemHealthStat.RtkData.eventStatus = true;;
            sytemHealthStat.RtkData.dataStatus = true;
          });

          socket.on('ping', () => {
            console.log('pong');
          });
        });

        namespaceGui.on('connection', (socket: Socket) => {
          console.log('A client connected to gui server');
          setInterval(async () => {
            // console.log("emitting health",sytemHealthStat)
            namespaceGui.emit('health', sytemHealthStat);
            filterRecentCommunications()
            filterOtherHealth()
          }, 100)


          socket.on('disconnect', () => {
            console.log('A client disconnected Gui');
          });

          socket.on('ping', () => {
            console.log('pong');
          });

        });

        const getPort = () => {
          // NEXT_PUBLIC_SECONDARY_SERVER_URL is the ATC backend (7979) — binding that
          // port here collides with the ATC process (EADDRINUSE) and kills the GUI
          // socket + SSE server. The internal server has its own port, defaulting to
          // 7985 to match clientConfig.ServerPort and the vite dev-server proxy.
          if (process.env.GUI_SERVER_PORT) {
            const parsed = parseInt(process.env.GUI_SERVER_PORT, 10);
            if (!isNaN(parsed)) return parsed;
            console.error("Failed to parse GUI_SERVER_PORT, using default 7985");
          }
          return 7985;
        };
        const PORT = getPort();
        httpServer.listen(PORT, () => {
          console.log(`socket listening on  client backend: ${PORT}`);
        });
        httpServer.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use.`);
            httpServer?.close();
            // Handle error: retry with a different port, log, or exit gracefully
          } else {
            console.error('An error occurred:', error.message);
            // Handle other types of errors as needed
          }
        });

      }



      // Listning from server node

      // if (!isConnected) {
      socketListener = io(process.env.SOCKETSERVER + '/client');
      socketListener.on('connect', async () => {
        //call sync service here to start syncing missions between two
        syncService.sync("missionList");
        syncService.sync("dirty");
        console.log('Connected to Backend Socket');
        isConnected = true;
        sytemHealthStat.latency.connected=true;
      });
      socketListener.on('message', (data) => {
        // console.log('Received data from Socket.IO server:', data);
      });
      socketListener.on('disconnect', () => {
        console.log('Disconnected from Backend Socket');
        isConnected = false;
        sytemHealthStat.latency.connected=false;
      });
      socketListener.on('fod', (payload) => {
        // console.log('Received FOD event from Socket.IO server:', payload);
        // DB logic
        handleFodFromSocket(payload);
        // GUI logic
        // console.log("Emitted from Next.js server to GUI:",payload);
        // namespaceGui.emit("fod", payload);
        server?.of('/gui').emit('fod', payload);
      });

      socketListener.on('updates', (payload) => {
        console.log(payload)
        // console.log('Received FOD event from Socket.IO server:', payload);
        // DB logic
        // handleFodFromSocket(payload);
        // GUI logic
        // console.log("Emitted from Next.js server to GUI:",payload);
        // namespaceGui.emit("fod", payload);
        // server?.of('/gui').emit('fod', payload);
      });

      socketListener.on('car', (payload) => {
        // sytemHealthStat.carData.data = payload;
        // console.log(payload);
      });

      socketListener.on('aiHealth', (payload: any) => {
        const list = Array.isArray(sytemHealthStat.AiHealth.data) ? sytemHealthStat.AiHealth.data : [];
        const idx = list.findIndex((e: any) => e?.sysid === payload.sysid);
        if (idx >= 0) list[idx] = payload; else list.push(payload);
        sytemHealthStat.AiHealth.data = list;
      });

      socketListener.on('ping', (payload) => {
        sytemHealthStat.latency.connected=true;
        // console.log(`current ping in ms : ${new Date().getTime() - payload} `)
      });

      socketListener.emit('heartBeat', 'heartBeat');
      // }

      process.on('exit', () => {
        if (httpServer) {
          httpServer.close(() => {
            httpServer = null; // Ensure server is set to null after closing
          });
        }
        if (server) {
          server.close(() => {
            server = null; // Ensure server is set to null after closing
          });
        }
      });
['SIGABRT','SIGINT','SIGQUIT','uncaughtException'].forEach((signal:string)=>{
  process.on(signal, (err) => {
    console.error('Uncaught exception:', err);
    httpServer?.close();
    server?.close();
    isConnected = false;
    process.exit(1);
  });
})
    }
  } catch (e) {
    console.log(e)
  }
  res.status(200).end();
}

