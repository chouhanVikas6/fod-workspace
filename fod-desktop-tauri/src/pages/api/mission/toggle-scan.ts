import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { apiToMain } from '@/utils/apiMain';
import { IsServerConnected } from '../socket';
import getPrismaInstance from '@/helper/prismaClient';
import { config } from '@/config/clientConfig';

export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if (req.method === 'GET') {
    const { type } = req.query;
    try {
       let toggleScan=await apiToMain({
        method:"post",
        endpoint:"/api/mission-control/toggle-scan",
        data:{
          type,
          camList:Object.keys(config.cameraMap)
        }
       });
      // apiToMain returns null when the vehicle backend is unreachable —
      // report that instead of a silent 200 null.
      if (!toggleScan) {
        return res.status(502).json({ error: 'Vehicle backend unreachable — scan not toggled' });
      }
      res.status(200).json(toggleScan);
    } catch (error) {
      console.log(error)
      res.status(500).json({ error: 'Failed to retrieve missions' });
    }
  } else {
    // res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};
