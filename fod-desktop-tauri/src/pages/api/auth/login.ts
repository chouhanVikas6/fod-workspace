import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import getPrismaInstance from '@/helper/prismaClient';
import bcrypt from 'bcryptjs';
import { AUTH_SECRET_KEY } from '@/config/clientConfig';


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        const { userName, password } = req.query;
        if (!userName || !password) {
            return res.status(400).json({ error: 'Missing username or password' });
        }
        const prisma = getPrismaInstance();
        try {
            const user = await prisma.user.findUnique({ where: { username: userName as string } });
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            // Compare hashed password using bcryptjs
            const isMatch = await bcrypt.compare(password as string, user.password);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            const payload = {
                id: user.id,
                userName: user.username,
                role: user.role,
                firstName: user.firstName,
                lastName: user.lastName,
                isActive: user.isActive,
            };
            const token = jwt.sign(payload, AUTH_SECRET_KEY);
            res.status(200).json({ token, user: payload });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}
