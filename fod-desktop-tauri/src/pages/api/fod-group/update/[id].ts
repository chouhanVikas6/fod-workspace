import { NextApiRequest, NextApiResponse } from 'next';
import getPrismaInstance from '@/helper/prismaClient';
import { query } from 'express';



export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const prisma = getPrismaInstance();
    const { missionId, status } = req.body;
    const { id } = req.query;
    console.log({
        id,missionId,status,body:req.body,query:req.query,
    })
    if (req.method === 'POST') {
        try {
            let update=await prisma.fodGroup.update({
                where: {
                    groupId_missionId: {
                        missionId, groupId:parseInt(id as string)
                    }
                },
                data: {
                    status,
                    dirty:true
                }
            });
            if(!!update){
                res.status(200).json(update);
            }else{
                res.status(402).json({message:"something went wrong on updating fodgroup"});
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
