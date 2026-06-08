import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { NextResponse } from 'next/server';

type SessionUser = { id?: number; plan?: string };

export async function requirePremium(): Promise<{ userId: number } | NextResponse> {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.plan !== 'premium') {
    return NextResponse.json({ error: 'PREMIUM_REQUIRED' }, { status: 403 });
  }
  return { userId: user.id };
}
