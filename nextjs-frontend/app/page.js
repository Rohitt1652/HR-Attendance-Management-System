'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const MANAGER_ROLES = ['admin', 'hr', 'md', 'team_lead'];

export default function RootPage() {
  const { user, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!token || !user) { router.replace('/login'); return; }
    router.replace(MANAGER_ROLES.includes(user.role) ? '/admin/dashboard' : '/employee/dashboard');
  }, [user, token, router]);

  return null;
}
