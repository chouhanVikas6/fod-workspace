import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    let token = null;
    // Try to get token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token as string;
    }

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const user = jwt.verify(token, SECRET_KEY);
        return res.status(200).json({ user });
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
} 