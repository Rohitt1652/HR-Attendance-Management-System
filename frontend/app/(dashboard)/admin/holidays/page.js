import { redirect } from 'next/navigation';

export default function AdminHolidaysRedirect() {
  redirect('/admin/calendar');
}
