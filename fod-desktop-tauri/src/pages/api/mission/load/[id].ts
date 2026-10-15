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
            // await syncService.sync('mission', parseInt(missionId as string));
            let mission = await apiToMain({
                headers: req.headers,
                method: "GET",
                endpoint: `/mission/load/${missionId}`,
                data: {}
            });
            if (mission?.status==200) {
                res.status(200).json(mission.data);
            } else {
                res.status(500).json({ error: 'Something went bad on server' });
            }
           
        } catch (error) {
            console.log(error)
            res.status(500).json({ error: 'Failed to retrieve mission' });
        }
    } else {
        res.setHeader('Allow', ['GET']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }

};
