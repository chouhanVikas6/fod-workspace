import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { apiToMain } from '@/utils/apiMain';
import RestPath from '@/constants/apiPaths';
import getPrismaInstance from '@/helper/prismaClient';

const prisma = getPrismaInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { id} = req.query;
    if (!id) {
      res.status(400).json({ error: 'Mission ID is required' });
      return;
    }
    console.log("patching mission",req.body)
    try {
        let mission = await apiToMain({
            method:"POST",
            endpoint:"/mission/"+id,
            data:req.body
        });
    //    mission = await prisma.mission.update({
    //     where: { id: +id },
    //     data: {...req.body},
    //   });
      res.status(200).json(mission);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update mission', details: error.message });
    }
  } else {
    res.setHeader('Allow', ['PATCH']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
