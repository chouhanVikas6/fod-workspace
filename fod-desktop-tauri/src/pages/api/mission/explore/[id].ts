import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { apiToMain } from '@/utils/apiMain';
import { syncService } from '@/services/syncing';
import getPrismaInstance from '@/helper/prismaClient';
import { IsServerConnected } from '../../socket';



export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const prisma = getPrismaInstance();
    const { id: missionId } = req.query;

    if (req.method === 'GET') {
        try {
            let x=await prisma.mission.findFirst({
                where:{
                    id:parseInt(missionId as string)
                }
            })

            res.status(200).json(x);
        } catch (error) {
            console.log(error)
            res.status(500).json({ error: 'Failed to retrieve mission' });
        }
    } else {
        res.setHeader('Allow', ['GET']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }

};
