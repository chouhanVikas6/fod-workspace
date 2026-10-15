import axios from "axios";
import getPrismaInstance from "../../src/helper/prismaClient";
import { Request, Response, NextFunction } from "express";



export default async function healthData(req: Request, res: Response, next: NextFunction) {
    console.log('SSE Connection Established', { query: req.query, param: req.params });

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    res.write(': SSE Connection Established\n\n');

    // Polling mechanism to fetch updates
    const interval = setInterval(() => {
        axios.get('http://localhost:6969/api/bite-data/state').then((r)=>{
            // latency (vehicle-link liveness) is owned by the desktop's own
            // heartbeat tracking in socket.ts — the backend's copy would
            // overwrite it with a stale `connected:false` every second.
            const { latency, ...biteState } = r.data.data || {};
            res.write(`data: ${JSON.stringify(biteState)}\n\n`);
        }).catch(() => { /* backend temporarily unreachable — skip this tick */ })
    }, 1000);
    
    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
    }, 30000);
    
    req.on('close', () => {
        clearInterval(interval);
        clearInterval(heartbeat);
        res.end();
    });
}
