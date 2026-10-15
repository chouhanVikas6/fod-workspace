import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import getPrismaInstance from '@/helper/prismaClient';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        const { userName, password, firstName, lastName } = req.body;
        if (!userName || !password) {
            return res.status(400).json({ error: 'Missing username or password' });
        }
        const prisma = getPrismaInstance();
        try {
            // Check if user already exists
            const existingUser = await prisma.user.findUnique({ where: { username: userName } });
            if (existingUser) {
                return res.status(409).json({ error: 'Username already exists' });
            }
            // Hash the password
            const hashedPassword = await bcrypt.hash(password, 10);
            // Create the user
            const newUser = await prisma.user.create({
                data: {
                    username: userName,
                    password: hashedPassword,
                    firstName: firstName || '',
                    lastName: lastName || '',
                    createdAt: new Date(),
                    role: Role.GUEST
                    // Add other fields as needed
                },
            });
            const payload = {
                id: newUser.id,
                userName: newUser.username,
                role: newUser.role,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                isActive: newUser.isActive,
            };
            const token = jwt.sign(payload, SECRET_KEY);
            res.status(201).json({ token, user: payload });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}
