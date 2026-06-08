import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== 'google') return false;
      try {
        const [rows] = await pool.query<RowDataPacket[]>(
          'SELECT id FROM users WHERE provider = ? AND provider_id = ?',
          [account.provider, account.providerAccountId]
        );
        if (rows.length === 0) {
          await pool.query(
            'INSERT INTO users (email, name, provider, provider_id) VALUES (?, ?, ?, ?)',
            [user.email, user.name, account.provider, account.providerAccountId]
          );
        }
        return true;
      } catch (err) {
        console.error('[NextAuth signIn]', err);
        return false;
      }
    },
    async session({ session }) {
      if (!session.user?.email) return session;
      try {
        const [rows] = await pool.query<RowDataPacket[]>(
          'SELECT id, plan FROM users WHERE email = ?',
          [session.user.email]
        );
        if (rows.length > 0) {
          (session.user as { id?: number; plan?: string }).id = rows[0].id;
          (session.user as { id?: number; plan?: string }).plan = rows[0].plan;
        }
      } catch (err) {
        console.error('[NextAuth session]', err);
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
};
