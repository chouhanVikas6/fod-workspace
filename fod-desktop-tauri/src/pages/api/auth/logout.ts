import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    // No server session to clear, just return success
    res.status(200).json({ success: true });
} 