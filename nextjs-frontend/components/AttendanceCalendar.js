'use client';
import { useMemo } from 'react';
import styles from './AttendanceCalendar.module.css';

function leaveLabel(leaveInfo) {
  if (!leaveInfo?.hasLeave) return '';
  const suffix = leaveInfo.status === 'pending' ? ' Pending' : '';
  if (leaveInfo.durationType === 'full_day') return 'Full Leave';
  if (leaveInfo.durationType === 'half_day') return `Half Leave${suffix}`;
  if (leaveInfo.durationType === 'hourly') return `Short Leave${suffix}`;
  return `Leave${suffix}`;
}

export default function AttendanceCalendar({ records = [], year, month, lastAttendanceImportDate }) {
  const today = new Date();
  const y = year ?? today.getFullYear();
  const m = month ?? today.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstDay = new Date(y, m, 1).getDay();

  const recordMap = useMemo(() => {
    const map = {};
    records.forEach((r) => {
      const date = String(r.date || (r.checkIn ? new Date(r.checkIn).toISOString().slice(0, 10) : ''));
      if (date) map[date] = r;
    });
    return map;
  }, [records]);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div className={styles.weekdays}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className={styles.weekday}>{d}</div>
        ))}
      </div>
      <div className={styles.days}>
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const rec = recordMap[dateKey];
          const isUncovered = Boolean(lastAttendanceImportDate && dateKey > lastAttendanceImportDate);

          const isShortLeaveCase = rec?.primaryStatus === 'short_leave_missing_attendance' || rec?.timeStatus === 'Short Leave Exception' || rec?.leaveInfo?.durationType === 'hourly' || rec?.dayType === 'Short Leave';

          const tone = isUncovered && !rec?.leaveInfo?.hasLeave && rec?.timeStatus !== 'WFH'
            ? 'empty'
            : !rec
              ? 'empty'
              : rec.timeStatus === 'Missing Punch'
                ? 'missing'
                : isShortLeaveCase
                  ? 'leave'
                  : rec.leaveInfo?.hasLeave && rec.dayType === 'Leave'
                    ? 'leave'
                    : ({
                        'Full Day': 'fullDay',
                        Present: 'present',
                        'Half Day': 'halfDay',
                        Absent: 'absent',
                        Holiday: 'holiday',
                        Weekend: 'weekend',
                        'On Leave': 'leave',
                      }[rec.status] || 'present');

          const tooltip = isUncovered && !rec?.leaveInfo?.hasLeave && rec?.timeStatus !== 'WFH'
            ? 'Biometric attendance data not available yet'
            : rec?.leaveInfo?.tooltip || rec?.timeStatus || rec?.status || '';

          const appliedLeaveLabel = leaveLabel(rec?.leaveInfo);
          return (
            <div key={`day-${year}-${month}-${day}`} title={tooltip} className={`${styles.day} ${styles[tone]}`}>
              {day}
              {!isUncovered && rec?.timeStatus === 'Missing Punch' && <div className={styles.missingPunch}>Missing Punch</div>}
              {appliedLeaveLabel && <div className={styles.leaveLabel}>{appliedLeaveLabel}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
