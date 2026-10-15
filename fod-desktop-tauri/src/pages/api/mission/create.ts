import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import getPrismaInstance from '@/helper/prismaClient';

const prisma = getPrismaInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method === 'POST') {
    const { status, timer, scanStatus, createdBy, previousTime , createdAt} = req.body;
    try {
      const mission = await prisma.mission.create({
        data: { status, timer, scanStatus, createdBy, previousTime, createdAt },
      });
      res.status(201).json(mission);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create mission' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};
