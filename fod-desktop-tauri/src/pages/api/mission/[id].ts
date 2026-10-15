import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import getPrismaInstance from '@/helper/prismaClient';

const prisma = getPrismaInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse){
    const { id } = req.query;
    if (req.method === 'GET') {
        try {
            const mission = await prisma.mission.findUnique({
                where: { id: Number(id) },
            });
            if (mission) {
                res.status(200).json(mission);
            } else {
                res.status(404).json({ error: 'Mission not found' });
            }
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve mission' });
        }
    } else if (req.method === 'PUT') {
        const { status, timer, scanStatus, updatedBy, previousTime } = req.body;
        try {
            const mission = await prisma.mission.update({
                where: { id: Number(id) },
                data: { status, timer, scanStatus, updatedBy, previousTime },
            });
            res.status(200).json(mission);
        } catch (error) {
            res.status(500).json({ error: 'Failed to update mission' });
        }
    } else {
        res.setHeader('Allow', ['GET', 'PUT']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }

};
