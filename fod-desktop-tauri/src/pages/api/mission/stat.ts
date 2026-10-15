import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { apiToMain } from '@/utils/apiMain';
import { IsServerConnected } from '../socket';
import getPrismaInstance from '@/helper/prismaClient';
import { syncService } from '@/services/syncing';



export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if (req.method === 'GET') {
    try {
      let prisma: PrismaClient=getPrismaInstance();
       await syncService.sync("missionList");
       let missions = await prisma.$queryRaw`
       SELECT 
         m.*,
         COUNT(CASE WHEN fg.status = 'ACCEPTED' THEN 1 END) AS "accepted",
         COUNT(CASE WHEN fg.status = 'REJECTED' THEN 1 END) AS "rejected",
         COUNT(CASE WHEN fg.status = 'CLEARED' THEN 1 END) AS "cleared",
         COUNT(CASE WHEN fg.status = 'NEW' THEN 1 END) AS "newFodGroups",
         COUNT(fg.id) AS "total"
       FROM "Mission" m
       LEFT JOIN "FodGroup" fg ON m.id = fg."missionId"
       GROUP BY m.id
       ORDER BY m.id DESC
     `;

     missions= missions instanceof Array ? missions.map(row => ({
      ...row,
            mission_id:row.id,
      accepted: Number(row.accepted),
      rejected: Number(row.rejected),
      cleared: Number(row.cleared),
      newFodGroups: Number(row.newFodGroups),
      total: Number(row.total),
    })):[];
      
        // Aggregate counts manually since Prisma doesn’t support raw SQL aggregations in the same way
      //    missions = missions.map((mission) => {
      //     const accepted = mission.fodGroups.filter(fodGroup => fodGroup.status === "ACCEPTED").length;
      //     const rejected = mission.fodGroups.filter(fodGroup => fodGroup.status === "REJECTED").length;
      //     const cleared = mission.fodGroups.filter(fodGroup => fodGroup.status === "CLEARED").length;
      //     const newFodGroups = mission.fodGroups.filter(fodGroup => fodGroup.status === "NEW").length;
      //     const total = mission.fodGroups.length;
      
      //     return {
      //       ...mission,
      //       mission_id:mission.id,
      //       accepted,
      //       rejected,
      //       cleared,
      //       newFodGroups,
      //       total,
      //     };
      //   });
      // // }
      res.status(200).json(missions);
    } catch (error) {
      console.log(error)
      res.status(500).json({ error: 'Failed to retrieve missions' });
    }
  } else {
    // res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};
