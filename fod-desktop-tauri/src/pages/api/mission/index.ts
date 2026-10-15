import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { apiToMain } from '@/utils/apiMain';
import getPrismaInstance from '@/helper/prismaClient';

const prisma = getPrismaInstance();

export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if (req.method === 'GET') {
    try {
        let missions;
        missions=await apiToMain({method:"GET",endpoint:"/mission",data:{}})
       if(!missions) missions = await prisma.mission.findMany();
      res.status(200).json(missions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve missions' });
    }
  } else {
    // res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};
