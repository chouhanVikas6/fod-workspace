import { NextApiRequest, NextApiResponse } from 'next';
import { apiToMain } from '@/utils/apiMain';


export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if (req.method === 'GET') {
    try {
      let scanStatus=await apiToMain({method:"GET",endpoint:"/api/mission-control/scan-status",timeout:1000})
      res.status(200).json({scanStatus:scanStatus|| 'PAUSE'});
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve missions' });
    }
  } else {
    // res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};
