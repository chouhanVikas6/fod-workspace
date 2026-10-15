// pages/api/updates.ts
import getPrismaInstance from '@/helper/prismaClient';
import type { NextApiRequest, NextApiResponse } from 'next';

let lastUpdatedAt = 0;
const clients = new Map<number, NextApiResponse>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('SSE Connection Established',req.method);
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.write(': SSE Connection Established\n\n');

  const prisma = getPrismaInstance();
  const clientId = Date.now();
  clients.set(clientId, res);

  try {
    // Get initial data
    const initialData = await prisma.fodGroup.findMany({
      where: {
        missionId: parseInt(req.query.id as string),
        updatedAt: {
          gt: new Date(lastUpdatedAt),
        },
      }
    });

    console.log({initialData});

    // Send initial data (without ending the connection)
    res.write(`event: initial\ndata: ${JSON.stringify(initialData)}\n\n`);

    setInterval(async () => {
      res.write(`event: initial\ndata: ${JSON.stringify(initialData)}\n\n`);
    },1000)
    // Update lastUpdatedAt with the newest record's timestamp
    if (initialData.length > 0) {
      lastUpdatedAt = Math.max(...initialData.map(item => 
        new Date(item.updatedAt).getTime()
      ));
    }

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 30000);

    // Cleanup on connection close
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(clientId);
      res.end();
    });

  } catch (error) {
    console.error('SSE Error:', error);
    res.write(`event: error\ndata: ${JSON.stringify({error: 'Failed to fetch initial data'})}\n\n`);
    clients.delete(clientId);
    res.end();
  }
}

export function broadcastUpdate(updatedEntries: [string, any][]) {
  const data = JSON.stringify(updatedEntries);
  clients.forEach((client) => {
    if (!client.writableEnded) {
      client.write(`event: update\ndata: ${data}\n\n`);
    }
  });
}


//send initial response 
//prepare fodlist
