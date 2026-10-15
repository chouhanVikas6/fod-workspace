import { NextApiRequest, NextApiResponse } from 'next';
import { apiToMain } from '@/utils/apiMain';
import getPrismaInstance from '@/helper/prismaClient';


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const prisma = getPrismaInstance();
  const { groupId, missionId } = req.query;
  if (req.method === 'GET') {
    try {

      let clearedResponse = await prisma.clearedFod.findFirst({
        where:{
          missionId:parseInt(missionId as string),
          groupId:parseInt(groupId as string)
        }
      })
      if (clearedResponse) {
        res.status(200).send(clearedResponse)
      } else {
        res.status(500).send({})
      }
    } catch (error) {
      console.log(error)
      res.status(500).json({ error: 'Failed to retrieve cleared response' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }

};
