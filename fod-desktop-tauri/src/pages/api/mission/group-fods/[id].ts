import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { apiToMain } from '@/utils/apiMain';
import { IsServerConnected } from '../../socket';
import getPrismaInstance from '@/helper/prismaClient';

const prisma = getPrismaInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        try {
            const { id, missionId } = req.query;
            if (!id || !missionId) res.status(402).json({ message: "missing args." })

            let existingFods = await prisma.fod.findMany({
                where: {
                    missionId: parseInt(missionId as string),
                    groupId: parseInt(id as string)
                }
            });
            let origin = 'self';
            if(existingFods){
                // existingFods=existingFods.map((fod:any)=>{
                // //     let base64 = Buffer.from(fod.frame).toString();

                // // if (!base64.startsWith('/9j/4AA')) {
                // //     base64 = Buffer.from(fod.frame).toString('base64')
                // // }
                // fod.location=JSON.parse(fod.location);
                // // fod.frame = `data:image/jpeg;base64,${base64}`;
                // return fod;
                // });
                existingFods = existingFods.sort((a, b) => b.size - a.size)
                res.status(200).json({ data: existingFods, origin });
            }else {
                res.status(404).json({ error: 'fods not found' });
            }
                } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve fods' });
        }
    } else {
        res.setHeader('Allow', ['GET', 'PUT']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }

};
