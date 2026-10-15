import { NextApiRequest, NextApiResponse } from 'next';
import { apiToMain } from '@/utils/apiMain';


export default async function handler(req: NextApiRequest, res: NextApiResponse){

    const { id } = req.query;
    if (req.method === 'GET') {
        try {
            let groupCount = await apiToMain({
                method:"GET",
                endpoint:"/api/fod-group/group-count/"+id,
                data:{missionId:id}
            })
          if(groupCount.statusCode==200){
            res.status(200).send(groupCount.data)
          }else{
            res.status(500).send(0)
          }
        } catch (error) {
            console.log(error)
            res.status(500).json({ error: 'Failed to retrieve fod group' });
        }
    }  else {
        res.setHeader('Allow', ['GET']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }

};
