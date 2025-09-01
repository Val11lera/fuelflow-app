import type { NextApiRequest, NextApiResponse } from 'next';
import supabaseAdmin from '@/lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const option = (req.query.option as 'buy' | 'rent') || 'buy';

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });

  const token = auth.slice(7);
  const { data: me } = await supabaseAdmin.auth.getUser(token);
  const userId = me?.user?.id;
  if (!userId) return res.status(401).json({ error: 'Auth failed' });

  const { data, error } = await supabaseAdmin
    .from('contracts')
    .select('id,status,approved_at,created_at')
    .eq('user_id', userId)
    .eq('tank_option', option)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  if (!data) return res.status(200).json({ exists: false, status: 'none' });
  return res.status(200).json({
    exists: true,
    status: data.status,      // 'draft' | 'signed' | 'approved' | 'cancelled'
    approved: !!data.approved_at,
    id: data.id,
  });
}
