import { NextApiRequest, NextApiResponse } from 'next';
import { KafkaSingleton } from '@/utils/kafka/kafka';



export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const kafkaService = new KafkaSingleton(process.env.KAFKA_BROKER);
    const body= req.body;

    if (req.method === 'POST') {
        try {
            let command=body.type;
            let missionId=body.missionId;
            let camList=body.camList;
            camList.forEach((element:string) => {
                console.log(`${command}_${missionId}_${element}`)
                let processcommand;
                if(command=='start'){
                    processcommand=`${command}_${missionId}_${element}`
                }else if(command=='terminate'){
                    processcommand=`${command}_${element}`
                }else{
                    res.status(402).json({message:"unidentified type"})
                }
                 if(!!processcommand)kafkaService.sendMessage('commandFromPPM',processcommand)
            });
            res.status(200).send({message:"command sent"})
        } catch (error) {
            console.log(error)
            res.status(500).json({ error: 'Failed to send command' });
        }
    } else {
        res.setHeader('Allow', ['GET']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }

};