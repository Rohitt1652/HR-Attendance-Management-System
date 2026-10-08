import { redirect } from 'next/navigation';

export default function EmployeeHolidaysRedirect() {
  redirect('/employee/calendar');
}
