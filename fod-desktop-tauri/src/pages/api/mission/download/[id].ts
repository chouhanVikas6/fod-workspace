import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { apiToMain } from '@/utils/apiMain';
import getPrismaInstance from '@/helper/prismaClient';
import { Writable } from 'stream';
import axios from 'axios';
import { missionService } from '@/services/mission';
import { upsertGroupBatch } from '@/services/fod-group';
import { createFodBatch } from '@/services/fod';
import { createClearedFodBatch } from '@/services/cleared-fod';

const prisma = getPrismaInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      let missionId:number = parseInt(req.query.id as string);
      if(!missionId){
        res.status(400).json({ error: 'Mission ID is missing' });
        return;
      }
      let count=0;
      let startDateTime = new Date();
      await fetch(`http://localhost:6969/mission/download/${missionId}`)
      .then(response => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = ""; // Store partial data

        reader.read().then(function process({ done, value }) {
            if (done) {
                console.log("Stream finished.");
                return;
            }

            buffer += decoder.decode(value, { stream: true });

            let lines = buffer.split("\n"); // Split by newlines
            buffer = lines.pop() || ""; // Keep the last incomplete line for next chunk
            for (let line of lines) {
                if (line.trim()) {
                    try {
                        const data = JSON.parse(line);
                        count++;
                        if(data.type=='mission'){
                          console.log("Processed chunk:", data);
                          missionService.upsertMissionData(data.data);
                        }else if(data.type=='fodGroup'){
                          upsertGroupBatch([data.data],missionId);
                        }else if(data.type=='clearedFod'){
                          createClearedFodBatch([data.data],missionId);
                        }else if(data.type=='fod'){
                          let base64 = Buffer.from(data.data.frame).toString();
                          if (!base64.startsWith('/9j/4AA')) {
                            base64 = Buffer.from(data.data.frame).toString('base64')
                          }
                          data.data.frame = base64;
                          createFodBatch([data.data],missionId);
                        }
                    } catch (err) {
                        console.error("Error parsing chunk:", line);
                    }
                }
            }

            return reader.read().then(process);
        });
    })
    .catch(error => console.error("Streaming error:", error));


      let endDateTime = new Date();
      
      console.log(`Time taken to download mission ${missionId} is ${endDateTime.getTime() - startDateTime.getTime()} ms`);
      res.status(200).json({});
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve missions' });
    }
  } else {
    // res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};
