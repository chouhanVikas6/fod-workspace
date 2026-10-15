import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { apiToMain } from '@/utils/apiMain';
import { syncService } from '@/services/syncing';
import getPrismaInstance from '@/helper/prismaClient';

const prisma = getPrismaInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (req.method === 'GET') {
    try {
      // Sync mission before fetching the data
      // await syncService.sync("mission", parseInt(id as string));
      // Raw SQL query to fetch relevant FOD data
      // let result = await prisma.$queryRaw`
      //   SELECT f."id", f."size", f."frame", f."groupId", f."timestamp", f."velocity", f."sysid", f."location", f."class", 
      //          fg."status" AS "groupStatus", fg."missionId" 
      //   FROM (
      //     SELECT "groupId", MAX(size) AS size 
      //     FROM Public."Fod" f 
      //     WHERE f."missionId" = ${parseInt(id as string)}
      //     GROUP BY f."groupId"
      //   ) mfd 
      //   INNER JOIN Public."Fod" f ON mfd."groupId" = f."groupId" AND mfd."size" = f."size"
      //   INNER JOIN Public."FodGroup" fg ON f."groupId" = fg."groupId" AND f."missionId" = fg."missionId"
      //   WHERE f."missionId" = ${parseInt(id as string)};
      // `;

      let result = await prisma.$queryRaw`
      SELECT DISTINCT ON ("f"."groupId")
            "f"."id",
            "f"."size",
            "f"."groupId",
            "f"."timestamp",
            "f"."location",
            "f"."class",
            "f"."velocity",
            "f"."sysid",
            "maxFod"."maxSize" AS "biggestSize",
            fg."status" AS "groupStatus"
        FROM
            Public."Fod" f 
        INNER JOIN (
            SELECT
                "groupId",
                MAX("size") AS "maxSize"
            FROM
                Public."Fod"
            WHERE
                "missionId" = ${parseInt(id as string)}
            GROUP BY
                "groupId"
        ) AS "maxFod" ON f."groupId" = "maxFod"."groupId" AND f."size" = "maxFod"."maxSize"
        LEFT JOIN
            Public."FodGroup" fg ON f."groupId" = fg."groupId" AND f."missionId" = fg."missionId"
        WHERE
            f."missionId" = ${parseInt(id as string)}
        ORDER BY
            f."groupId" DESC
      `


      // Check if any result is retrieved
      if (result instanceof Array && result.length > 0) {
         
        // Map over the result and convert the 'frame' field to a base64-encoded string
        result = result.map((fod) => {
          // Convert frame buffer to base64 encoded string and format it as an image data URL
          // fod.frame = `data:image/jpeg;base64,${fod.frame.toString()}`;
          fod.location=typeof fod.location=="string"?JSON.parse(fod.location):fod.location;
          return fod;
        });
        

        // Return the data as JSON response
        res.status(200).json(result);
      } else {
        // No data found, return an empty array
        res.status(200).json([]);
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to retrieve mission data' });
    }
  } else {
    // Handle unsupported HTTP methods
    res.setHeader('Allow', ['GET', 'PUT']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
