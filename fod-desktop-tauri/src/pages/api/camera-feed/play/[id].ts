import { NextApiRequest, NextApiResponse } from 'next';
import { KafkaSingleton } from '@/utils/kafka/kafka';



export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const kafkaService = new KafkaSingleton(process.env.KAFKA_BROKER);
    const { id: camId } = req.query;

    if (req.method === 'GET') {
        try {
            await kafkaService.sendMessage('commandFromPPM',`playVideo_${camId}`)
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
