'use client';
import { useAuth } from '@/context/AuthContext';

export function usePermission(...perms) {
  const { user } = useAuth();
  const userPerms = user?.permissions || [];
  return perms.every((p) => userPerms.includes(p));
}

export function useAnyPermission(...perms) {
  const { user } = useAuth();
  const userPerms = user?.permissions || [];
  return perms.some((p) => userPerms.includes(p));
}
