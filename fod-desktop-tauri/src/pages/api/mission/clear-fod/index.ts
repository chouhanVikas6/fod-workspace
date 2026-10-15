import { NextApiRequest, NextApiResponse } from 'next';
import { apiToMain } from '@/utils/apiMain';
import getPrismaInstance from '@/helper/prismaClient';
import { upsertGroupData } from '@/services/fod-group';
import { createClearedFodBatch } from '@/services/cleared-fod';



export default async function handler(req: NextApiRequest, res: NextApiResponse){
    const prisma =  getPrismaInstance();
    if (req.method === 'POST') {
        try {
            const {missionId,groupId}=req.body;
            const selfUpdate = await createClearedFodBatch([req.body],missionId);
          
            if (selfUpdate) {
                res.status(200).json(selfUpdate[0]);
            } else {
                res.status(404).json({ error: 'Group data not found' });
            }
        } catch (error) {
            console.log(error)
            res.status(500).json({ error: 'Failed to retrieve mission data' });
        }
    }  else {
        res.setHeader('Allow', ['POST', 'PUT']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }

};
