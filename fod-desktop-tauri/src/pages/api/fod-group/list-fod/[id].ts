import { NextApiRequest, NextApiResponse } from 'next';
import { apiToMain } from '@/utils/apiMain';
import getPrismaInstance from '@/helper/prismaClient';
import { createFodBatch } from '@/services/fod';


export default async function handler(req: NextApiRequest, res: NextApiResponse) {

    const prisma = getPrismaInstance();
    const { id, missionId } = req.query;
    if (req.method === 'GET') {
        try {
            let existingFods = await prisma.fod.findMany({
                where: {
                    missionId: parseInt(missionId as string),
                    groupId: parseInt(id as string)
                },
            });

            let excludedIds = !!existingFods ? existingFods.map(fod => fod.id) : [];

            let incomingFods = await apiToMain({
                method: "GET",
                endpoint: "/api/fod/mission-group",
                data: {
                    groupId: id,
                    missionId,
                    excludedIds
                }
            })
            let result: any = [];
            if (!!existingFods) {
                result = [...result, ...existingFods];
            }
            if (!!incomingFods) {
                // incomingFods = incomingFods.map((fod: any) => {
                //     fod.frame=fod.frame.toString('base64');
                //     return fod;
                // })
                result = [...result, ...incomingFods];
                console.log(incomingFods[0])
                createFodBatch(incomingFods,parseInt(missionId as string));
            }

            result = result.sort((a, b) => b.size - a.size)
            if (incomingFods) {
                res.status(200).json({ data: result, origin: 'backend' });
            } else if (existingFods) {
                res.status(200).json({ data: result, origin: 'self' });
            } else {
                res.status(404).json({ error: 'fod group not found' });
            }
        } catch (error) {
            console.log(error)
            res.status(500).json({ error: 'Failed to retrieve fod group' });
        }
    } else {
        res.setHeader('Allow', ['GET']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }

};
