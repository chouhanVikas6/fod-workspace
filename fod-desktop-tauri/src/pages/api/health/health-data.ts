import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

// Store connected clients
const connectedClients = new Set<NextApiResponse>();

// Function to fetch current health data
async function fetchHealthData() {
  try {
    // Fetch system health summary
    const healthResponse = await axios.get(`${BACKEND_URL}/byte-data/health`);
    const healthData = healthResponse.data.data;

    // Fetch current state
    const stateResponse = await axios.get(`${BACKEND_URL}/byte-data/state`);
    const stateData = stateResponse.data.data;
console.log('Fetched health data:', healthData);
    // Combine the data
    return {
      success: true,
      data: {
        ...stateData,
        system_health: {
          total_pcs: healthData.totalPcs,
          connected_pcs: healthData.connectedPcs,
          system_temp: healthData.systemTemp,
          kafka_status: healthData.kafkaStatus
        }
      }
    };
  } catch (error) {
    console.error('Error fetching health data:', error);
    return {
      success: false,
      error: 'Failed to fetch health data'
    };
  }
}

// Function to broadcast updates to all connected clients
function broadcastUpdate(data: any) {
  connectedClients.forEach(client => {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// Set up polling interval for updates
let pollingInterval: NodeJS.Timeout;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Add this client to connected clients
    connectedClients.add(res);

    // Send initial data
    const initialData = await fetchHealthData();
    if (initialData.success) {
      res.write(`data: ${JSON.stringify(initialData)}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ error: initialData.error })}\n\n`);
    }

    // Start polling if not already started
    if (!pollingInterval) {
      pollingInterval = setInterval(async () => {
        const data = await fetchHealthData();
        if (data.success) {
          broadcastUpdate(data);
        } else {
          broadcastUpdate({ error: data.error });
        }
      }, 5000); // Poll every 5 seconds
    }

    // Remove client when connection closes
    req.on('close', () => {
      connectedClients.delete(res);
      if (connectedClients.size === 0) {
        clearInterval(pollingInterval);
        pollingInterval = undefined;
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

// Clean up on server shutdown
export const config = {
  api: {
    bodyParser: false,
  },
}; 