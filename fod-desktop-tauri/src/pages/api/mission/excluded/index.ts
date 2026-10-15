import { NextApiRequest, NextApiResponse } from 'next';


export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method === 'GET') {
    try {
      
      res.status(200).json({message:"mission list updated"});
    } catch (error) {
      res.status(500).json({ error: 'Failed to create mission' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};
