'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function AttendanceChart({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar dataKey="present" fill="#22c55e" name="Present" />
        <Bar dataKey="absent" fill="#ef4444" name="Absent" />
      </BarChart>
    </ResponsiveContainer>
  );
}
