import { NextApiRequest, NextApiResponse } from 'next';
import { MissionStatus, PrismaClient } from '@prisma/client';
import { apiToMain } from '@/utils/apiMain';
import { setMission } from '@/services/fod';
import getPrismaInstance from '@/helper/prismaClient';

const prisma = getPrismaInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse){
    if (req.method === 'GET') {
        try {
            let mission = await apiToMain({
                method:"GET",
                endpoint:"/mission/active",
                data:{}
            });
            setMission(mission);
            if (mission) {
                res.status(200).json(mission);
            } else {
                res.status(404).json({ error: 'Mission not found' });
            }
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve mission' });
        }
    }  else {
        res.setHeader('Allow', ['GET']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }

};
