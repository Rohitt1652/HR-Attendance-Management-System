'use client';
import { Suspense } from 'react';
import MyLeaves from '@/components/pages/employee/MyLeaves';

export default function EmployeeLeavesPage() {
  return (
    <Suspense fallback={null}>
      <MyLeaves />
    </Suspense>
  );
}

