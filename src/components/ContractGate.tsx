'use client';
import { useEffect, useState } from 'react';

type Props = {
  option: 'buy' | 'rent';
  jwt?: string;           // pass Supabase session token if you have it server-side
  onOpenModal: () => void;
};

export default function ContractGate({ option, jwt, onOpenModal }: Props) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'none' | 'draft' | 'signed' | 'approved' | 'cancelled'>('none');

  async function refresh() {
    try {
      const res = await fetch(`/api/contracts/status?option=${option}`, {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
      });
      const json = await res.json();
      setStatus(json.status ?? 'none');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [option, jwt]);

  if (loading) return <button disabled className="btn">Loading…</button>;

  if (option === 'buy') {
    if (status === 'signed' || status === 'approved') {
      return <span className="text-green-400 font-medium">Contract signed</span>;
    }
    return <button className="btn btn-primary" onClick={onOpenModal}>Start Contract</button>;
  }

  // RENT
  if (status === 'approved') return <span className="text-green-400 font-medium">Approved</span>;
  if (status === 'signed')  return <span className="text-yellow-300 font-medium">Awaiting admin approval</span>;
  return <button className="btn btn-primary" onClick={onOpenModal}>Apply for Rental</button>;
}
