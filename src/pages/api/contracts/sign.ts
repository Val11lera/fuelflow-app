import type { NextApiRequest, NextApiResponse } from 'next';
import supabaseAdmin from '@/lib/supabaseAdmin';

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || '';

type Body = {
  full_name: string;
  email: string;
  company_name?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  postcode?: string;
  tank_option: 'buy' | 'rent';
  tank_size_litres?: number;
  monthly_consumption_litres?: number;
  market_price_per_litre?: number;
  fuelflow_price_per_litre?: number;
  est_monthly_savings?: number;
  est_payback_months?: number;
  terms_version?: string;
  signature_name?: string;
  hcaptchaToken: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const b = req.body as Partial<Body>;
    if (!b?.full_name || !b?.email || !b?.tank_option || !b?.hcaptchaToken) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (!HCAPTCHA_SECRET) return res.status(500).json({ error: 'HCAPTCHA_SECRET_KEY not set.' });

    // hCaptcha verify
    const verify = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: HCAPTCHA_SECRET, response: String(b.hcaptchaToken) }).toString(),
    }).then(r => r.json());
    if (!verify?.success) return res.status(400).json({ error: 'Captcha verification failed.' });

    // Optional: attach logged-in user from Authorization: Bearer <jwt>
    let userId: string | null = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7);
      const { data } = await supabaseAdmin.auth.getUser(token);
      if (data?.user?.id) userId = data.user.id;
    }

    // Insert as 'signed' (unique partial index prevents 2nd active for same user+option)
    const { data, error } = await supabaseAdmin
      .from('contracts')
      .insert({
        status: 'signed',
        signed_at: new Date().toISOString(),
        user_id: userId,
        customer_name: b.full_name,
        email: b.email,
        address_line1: b.address1 ?? null,
        address_line2: b.address2 ?? null,
        city: b.city ?? null,
        postcode: b.postcode ?? null,
        tank_option: b.tank_option,
        tank_size_l: b.tank_size_litres ?? null,
        monthly_consumption_l: b.monthly_consumption_litres ?? null,
        market_price_gbp_l: b.market_price_per_litre ?? null,
        fuelflow_price_gbp_l: b.fuelflow_price_per_litre ?? null,
        est_monthly_savings_gbp: b.est_monthly_savings ?? null,
        est_payback_months: b.est_payback_months ?? null,
        terms_version: b.terms_version ?? 'v1',
        signature_name: b.signature_name ?? null,
      })
      .select('id,status,tank_option')
      .single();

    if (error) {
      // Unique violation → treat as already signed
      if ((error as any).code === '23505') {
        return res.status(200).json({ ok: true, alreadySigned: true });
      }
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true, id: data.id, status: data.status, option: data.tank_option });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Server error' });
  }
}
