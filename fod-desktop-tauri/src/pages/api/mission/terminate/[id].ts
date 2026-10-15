import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { apiToMain } from '@/utils/apiMain';
import getPrismaInstance from '@/helper/prismaClient';



export default async function handler(req:NextApiRequest, res:NextApiResponse){
  const prisma = getPrismaInstance();
  if (req.method === 'POST') {
    try {
        let missions;
        let {id}=req.query;
        missions=await apiToMain({method:"GET",endpoint:"/api/mission-control/terminate/"+id,data:{}})
        await prisma.mission.update({where:{
          id:parseInt(id as string)
        },
        data:{
          status:'INACTIVE'
        }
      });
      console.log({missions})
      res.status(200).json(missions);
    } catch (error) {
      console.log(error)
      res.status(500).json({ error: 'Failed to terminate missions' });
    }
  } else {
    // res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};
