// pages/client-dashboard.tsx

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Session } from '@supabase/auth-helpers-nextjs'

export default function ClientDashboard() {
  const [session, setSession] = useState<Session | null>(null)
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push('/login') // If not logged in, redirect
      } else {
        setSession(data.session)
      }
    })
  }, [])

  if (!session) return <div className="text-center p-10 text-white">Loading dashboard...</div>

  return (
    <div className="min-h-screen bg-[#0f172a] text-white px-4 md:px-10 py-10">
      <h1 className="text-2xl md:text-4xl font-bold mb-6">Welcome Back, {session.user.email}!</h1>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card title="Recent Orders">
          <p>No recent orders.</p>
        </Card>

        <Card title="Account Details">
          <p>Email: {session.user.email}</p>
          <button className="mt-2 border rounded px-3 py-1">Edit Details</button>
        </Card>

        <Card title="Billing">
          <p>You have no outstanding payments.</p>
          <div className="mt-2 space-y-2">
            <button className="border rounded px-3 py-1 w-full">Make a Payment</button>
            <button className="border rounded px-3 py-1 w-full">View Invoices</button>
          </div>
        </Card>

        <Card title="Your Contract Prices">
          <ul className="space-y-1">
            <li>Unleaded Petrol (95): <strong>£1.45</strong></li>
            <li>Diesel: <strong>£1.52</strong></li>
            <li>Red Diesel: <strong>£1.02</strong></li>
          </ul>
        </Card>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1e293b] rounded-2xl p-5 shadow-lg">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </div>
  )
}
