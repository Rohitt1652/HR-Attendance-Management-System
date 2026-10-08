'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getSettings } from '@/api/settingsApi';
import { getAllAttendance } from '@/api/attendanceApi';
import { getMonthBirthdays } from '@/api/employeeApi';
import { getEvents, createEvent, updateEvent, deleteEvent } from '@/api/calendarEventApi';
import { useAuth } from '@/context/AuthContext';
import { Bell, Cake, CalendarDays, CalendarHeart, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Pencil, Plus, Tag, Trash2, Users, X, XCircle } from 'lucide-react';
import styles from './CalendarPage.module.css';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const ADMIN_ROLES = ['admin', 'hr', 'md'];

const EVENT_TYPES = [
  { value: 'holiday', label: 'Holiday', Icon: CalendarDays, color: '#ca8a04', bg: '#fef9c3' },
  { value: 'meeting', label: 'Meeting', Icon: Users, color: '#6366f1', bg: '#eef2ff' },
  { value: 'event', label: 'Event', Icon: CalendarHeart, color: '#f59e0b', bg: '#fffbeb' },
  { value: 'reminder', label: 'Reminder', Icon: Bell, color: '#ef4444', bg: '#fef2f2' },
  { value: 'other', label: 'Other', Icon: Tag, color: '#64748b', bg: '#f8fafc' },
];

const STATUS_COLORS = {
  'Full Day': '#22c55e', Present: '#86efac', 'Half Day': '#fde68a',
  Absent: '#fca5a5', Holiday: '#d1d5db', Weekend: '#e5e7eb',
};

const birthdayDate = (date) => date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '';
const birthdayAge = (date, year) => date ? year - new Date(date).getFullYear() : null;
const getBirthdayDob = (person) => person?.dateOfBirth || person?.dob || person?.date_of_birth || person?.birthDate || person?.birth_date || person?.personalInfo?.dob;
const formatAttendanceTime = (value) => value
  ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
  : '-';

function BirthdayAvatar({ person, size = 32 }) {
  return (
    <div className={`${styles.avatar} ${size > 30 ? styles.avatarLargeText : styles.avatarSmallText}`} style={{ width: size, height: size }}>
      {person.profilePhotoUrl ? <img src={person.profilePhotoUrl} alt={person.name} className={styles.avatarImage} /> : person.name?.[0]?.toUpperCase()}
    </div>
  );
}

function BirthdayList({ birthdays, year, month, onSelectDay }) {
  const sorted = [...birthdays].sort((a, b) => new Date(getBirthdayDob(a)).getDate() - new Date(getBirthdayDob(b)).getDate());
  return (
    <div className={`${styles.card} ${styles.sidebarCard} ${styles.shadowCard}`}>
      <div className={styles.listHeader}>
        <div className={`${styles.iconBox} ${styles.birthIcon}`}><Cake size={15} strokeWidth={2.2} /></div>
        <div>
          <p className={styles.listTitle}>Upcoming Birthdays This Month</p>
          <p className={styles.listSubtitle}>{MONTHS[month]} {year}</p>
        </div>
      </div>
      {sorted.length > 0 ? (
        <div className={`${styles.scrollList} ${styles.birthdayList}`}>
          {sorted.map(person => {
            const dob = getBirthdayDob(person);
            const day = new Date(dob).getDate();
            const age = birthdayAge(dob, year);
            return (
              <button key={person._id} type="button" onClick={() => onSelectDay(day)}
                className={`${styles.listButton} ${styles.birthdayButton}`}>
                <BirthdayAvatar person={person} />
                <div className={styles.truncateBox}>
                  <p className={styles.monthEventTitle}>{person.name}</p>
                  <p className={styles.personMeta}>{birthdayDate(dob)}{age ? ` - ${age} yrs` : ''}</p>
                </div>
                <Cake size={15} color="#db2777" strokeWidth={2.2} />
              </button>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyList}>No birthdays this month</div>
      )}
    </div>
  );
}

function EventForm({ date, event, allowedTypes, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: event?.title || '',
    description: event?.description || '',
    date: event?.date || date || '',
    endDate: event?.endDate || '',
    startTime: event?.startTime || '',
    endTime: event?.endTime || '',
    color: event?.color || '#6366f1',
    type: event?.type || allowedTypes?.[0] || 'event',
    isAllDay: event?.isAllDay ?? true,
    companyHoliday: event?.companyHoliday ?? false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.title || !form.date) return toast.error('Title and date required');
    setSaving(true);
    try {
      const payload = form.type === 'holiday'
        ? { ...form, isAllDay: true, color: form.color || '#ca8a04' }
        : form;
      if (event) await updateEvent(event._id, payload);
      else await createEvent(payload);
      toast.success(event ? 'Event updated' : 'Event created');
      onSave();
    } catch { toast.error('Failed to save event'); }
    finally { setSaving(false); }
  };

  const selectedType = EVENT_TYPES.find(t => t.value === form.type);
  const SelectedIcon = selectedType?.Icon || CalendarDays;
  const isHolidayType = form.type === 'holiday';

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalPanel}>
        <div className={styles.modalHeader}>
          <div className={styles.modalIcon} style={{ background: `${form.color}20` }}>
            <SelectedIcon size={18} strokeWidth={2.1} color={selectedType?.color || '#6366f1'} />
          </div>
          <h3 className={styles.modalTitle}>{event ? 'Edit Event' : 'New Event'}</h3>
        </div>

        <div className={styles.formStack}>
          {/* Event type */}
          <div className={styles.typeGrid}>
            {EVENT_TYPES.filter(t => allowedTypes.includes(t.value)).map(t => {
              const TypeIcon = t.Icon;
              return (
              <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, type: t.value, color: t.color }))}
                className={styles.typeButton}
                style={{ border: `2px solid ${form.type === t.value ? t.color : '#e2e8f0'}`, background: form.type === t.value ? `${t.color}15` : '#fff', fontWeight: form.type === t.value ? 700 : 400, color: form.type === t.value ? t.color : '#64748b' }}>
                <TypeIcon size={15} strokeWidth={2.1} />{t.label}
              </button>
              );
            })}
          </div>

          {isHolidayType && (
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={form.companyHoliday} onChange={e => setForm(f => ({ ...f, companyHoliday: e.target.checked }))} style={{ accentColor: '#ca8a04' }} />
              Company Holiday
            </label>
          )}

          <div>
            <label className={styles.fieldLabel}>Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Event title..." className={styles.input} autoFocus />
          </div>

          <div className={styles.formGrid}>
            <div>
              <label className={styles.fieldLabel}>Date *</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={styles.input} />
            </div>
            <div>
              <label className={styles.fieldLabel}>End Date</label>
              <input type="date" value={form.endDate} min={form.date} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className={styles.input} />
            </div>
          </div>

          {!isHolidayType && (
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={form.isAllDay} onChange={e => setForm(f => ({ ...f, isAllDay: e.target.checked }))} style={{ accentColor: form.color }} />
              All day event
            </label>
          )}

          {!isHolidayType && !form.isAllDay && (
            <div className={styles.formGrid}>
              <div>
                <label className={styles.fieldLabel}>Start Time</label>
                <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className={styles.input} />
              </div>
              <div>
                <label className={styles.fieldLabel}>End Time</label>
                <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className={styles.input} />
              </div>
            </div>
          )}

          <div>
            <label className={styles.fieldLabel}>Description</label>
            <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional details..." className={`${styles.input} ${styles.textarea}`} />
          </div>

          <div>
            <label className={styles.fieldLabel}>Color</label>
            <div className={styles.colorRow}>
              {['#6366f1','#ef4444','#f59e0b','#22c55e','#0ea5e9','#a855f7','#ec4899','#64748b'].map(c => (
                <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={styles.colorButton}
                  style={{ background: c, border: form.color === c ? '3px solid #1e293b' : '2px solid transparent' }} />
              ))}
            </div>
          </div>
        </div>

        <div className={styles.modalActions}>
          <button onClick={onCancel} className={styles.secondaryButton}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className={styles.saveButton}
            style={{ background: form.color, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : event ? 'Update' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const perms = user?.permissions || [];
  const canCreateEvent = isAdmin || perms.includes('calendar:event:create') || perms.includes('calendar:manage');
  const canEditEvent = isAdmin || perms.includes('calendar:event:edit') || perms.includes('calendar:manage');
  const canDeleteEvent = isAdmin || perms.includes('calendar:event:delete') || perms.includes('calendar:manage');
  const canCreateHoliday = isAdmin || perms.includes('holidays:create') || perms.includes('holidays:manage');
  const canEditHoliday = isAdmin || perms.includes('holidays:edit') || perms.includes('holidays:manage');
  const canDeleteHoliday = isAdmin || perms.includes('holidays:delete') || perms.includes('holidays:manage');
  const canCreateAny = canCreateEvent || canCreateHoliday;
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [holidays, setHolidays] = useState([]);
  const [weekendDays, setWeekendDays] = useState([0, 6]);
  const [attendance, setAttendance] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [newEventDate, setNewEventDate] = useState('');

  useEffect(() => {
    getSettings().then(res => {
      setHolidays(res.data.data.holidays || []);
      setWeekendDays(res.data.data.weekendDays || [0, 6]);
    }).catch(() => {});
  }, []);

  const fetchMonthData = () => {
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-31`;
    getAllAttendance({ startDate, endDate }).then(res => setAttendance(res.data.data || [])).catch(() => {});
    getMonthBirthdays(month + 1)
      .then(res => {
        const monthBirthdays = res.data.data || [];
        if (!monthBirthdays.length) {
          console.warn('[CalendarPage] Birthday API returned no records', {
            month: month + 1,
            year,
            meta: res.data.meta,
          });
        } else {
          console.info('[CalendarPage] Birthday API loaded records', {
            month: month + 1,
            year,
            count: monthBirthdays.length,
            dobFields: [...new Set(monthBirthdays.map(p => p.dobField).filter(Boolean))],
          });
        }
        setBirthdays(monthBirthdays);
      })
      .catch(err => {
        console.error('[CalendarPage] Failed to load birthday data', {
          month: month + 1,
          year,
          status: err?.response?.status,
          message: err?.response?.data?.message || err?.message,
        });
        setBirthdays([]);
      });
    getEvents(month + 1, year).then(res => setEvents(res.data.data || [])).catch(() => {});
  };

  useEffect(() => { fetchMonthData(); }, [year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const holidayMap = {};
  holidays.forEach(h => {
    const d = new Date(h.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      if (!holidayMap[d.getDate()]) holidayMap[d.getDate()] = [];
      holidayMap[d.getDate()].push({ title: h.name, date: h.date, source: 'settings' });
    }
  });

  const attMap = {};
  attendance.forEach(r => { attMap[new Date(r.date || r.checkIn).getDate()] = r; });

  const bdMap = {};
  birthdays.forEach(p => {
    const dob = getBirthdayDob(p);
    if (!dob) {
      console.warn('[CalendarPage] Birthday record is missing DOB field', p);
      return;
    }
    const parsedDob = new Date(dob);
    if (Number.isNaN(parsedDob.getTime())) {
      console.warn('[CalendarPage] Birthday record has invalid DOB', { employee: p.name, dob });
      return;
    }
    const d = parsedDob.getDate();
    if (!bdMap[d]) bdMap[d] = [];
    bdMap[d].push(p);
  });

  const eventMap = {};
  events.forEach(e => {
    const d = parseInt(e.date.split('-')[2]);
    if (!eventMap[d]) eventMap[d] = [];
    eventMap[d].push(e);
    if (e.type === 'holiday') {
      if (!holidayMap[d]) holidayMap[d] = [];
      holidayMap[d].push({ ...e, source: 'event' });
    }
  });

  const monthHolidays = Object.values(holidayMap).flat().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const canEditCalendarItem = (ev) => ev.type === 'holiday' ? canEditHoliday : canEditEvent;
  const canDeleteCalendarItem = (ev) => ev.type === 'holiday' ? canDeleteHoliday : canDeleteEvent;

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const handleDayClick = (day) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const att = attMap[day];
    const holiday = holidayMap[day] || [];
    const isWeekend = weekendDays.includes(new Date(year, month, day).getDay());
    const bds = bdMap[day] || [];
    const dayEvents = eventMap[day] || [];
    setSelected({ day, att, holiday, isWeekend, bds, dayEvents, dateStr });
  };

  const handleDeleteEvent = async (id) => {
    if (!confirm('Delete this event?')) return;
    try { await deleteEvent(id); toast.success('Event deleted'); fetchMonthData(); setSelected(null); }
    catch { toast.error('Failed to delete'); }
  };

  const allowedCreateTypes = EVENT_TYPES
    .filter(t => t.value === 'holiday' ? canCreateHoliday : canCreateEvent)
    .map(t => t.value);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Calendar</h2>
          <p className={styles.subtitle}>Attendance, events & birthdays</p>
        </div>
        <div className={styles.toolbar}>
          <button onClick={prevMonth} className={styles.navButton}><ChevronLeft size={16} /></button>
          <span className={styles.monthLabel}>{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} className={styles.navButton}><ChevronRight size={16} /></button>
          <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
            className={styles.ghostButton}>Today</button>
          {canCreateAny && (
            <button onClick={() => { setNewEventDate(''); setEditEvent(null); setShowForm(true); }}
              className={styles.primaryButton}><Plus size={14} /> Add Event</button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        {[
          ['Present', CheckCircle2, '#16a34a', '#f0fdf4'],
          ['WFH', CheckCircle2, '#0284c7', '#e0f2fe'],
          ['Absent', XCircle, '#dc2626', '#fef2f2'],
          ['Holiday', CalendarDays, '#ca8a04', '#fef9c3'],
          ['Weekend', CalendarRange, '#64748b', '#f8fafc'],
        ].map(([label, Icon, color, bg]) => (
          <div key={label} className={styles.chip} style={{ color, background: bg }}><Icon size={15} strokeWidth={2.1} />{label}</div>
        ))}
        {EVENT_TYPES.map(t => {
          const Icon = t.Icon;
          return <div key={t.value} className={styles.chip} style={{ color: t.color, background: t.bg }}><Icon size={15} strokeWidth={2.1} />{t.label}</div>;
        })}
        <div className={styles.chip} style={{ color: '#db2777', background: '#fdf2f8' }}><Cake size={15} strokeWidth={2.1} />Birthday</div>
      </div>

      <div className={styles.contentGrid}>
        {/* Calendar grid */}
        <div className={`${styles.card} ${styles.calendarCard}`}>
          <div className={styles.weekdayGrid}>
            {DAYS.map(d => <div key={d} className={styles.weekday}>{d}</div>)}
          </div>
          <div className={styles.daysGrid}>
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />;
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const isWeekend = weekendDays.includes(new Date(year, month, day).getDay());
              const holiday = holidayMap[day] || [];
              const holidayTitle = holiday.map(h => h.title).join(', ');
              const att = attMap[day];
              const bds = bdMap[day] || [];
              const dayEvents = eventMap[day] || [];
              let bg = '#fff';
              if (isToday) bg = '#6366f1';
              else if (holiday.length) bg = '#fef9c3';
              else if (isWeekend) bg = '#f8fafc';
              else if (att?.timeStatus === 'WFH') bg = '#e0f2fe';
              else if (att) bg = STATUS_COLORS[att.status] || '#bbf7d0';

              return (
                <div key={`day-${year}-${month}-${day}`} onClick={() => handleDayClick(day)}
                  className={styles.dayCell}
                  style={{ background: bg, border: isToday ? 'none' : '1px solid #f1f5f9' }}>
                  <span className={`${styles.dayNumber} ${isToday ? styles.todayNumber : styles.normalDayNumber}`}>{day}</span>
                  {holiday.length > 0 && <p className={styles.holidayTitle} style={{ color: isToday ? '#fff' : '#854d0e' }}>{holidayTitle}</p>}
                  {/* Event dots */}
                  {dayEvents.length > 0 && (
                    <div className={styles.eventDots}>
                      {dayEvents.slice(0, 3).map(ev => (
                        <div key={ev._id} className={styles.eventDot} style={{ background: ev.color || '#6366f1' }} title={ev.title} />
                      ))}
                      {dayEvents.length > 3 && <span className={styles.moreCount}>+{dayEvents.length - 3}</span>}
                    </div>
                  )}
                  {/* Birthday & late indicators */}
                  <div className={styles.dayIndicators}>
                    {bds.length > 0 && (
                      <span title={bds.map(b => b.name).join(', ')} className={`${styles.birthdayPill} ${isToday ? styles.birthdayPillToday : styles.birthdayPillNormal}`}>
                        <Cake size={11} strokeWidth={2.3} />
                        {bds.length > 1 && <span>+{bds.length - 1}</span>}
                      </span>
                    )}
                    {att?.isLate && <span className={styles.latePill}>Late</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel */}
        <div className={styles.sideColumn}>
          {/* Day detail */}
          {selected ? (
            <div className={`${styles.card} ${styles.detailCard}`}>
              <div className={styles.detailHeader}>
                <h3 className={styles.detailTitle}>
                  {MONTHS[month]} {selected.day}, {year}
                </h3>
                <div className={styles.detailActions}>
                  {canCreateAny && (
                    <button onClick={() => { setNewEventDate(selected.dateStr); setEditEvent(null); setShowForm(true); }}
                      className={styles.compactPrimaryButton}>+ Event</button>
                  )}
                  <button title="Close details" onClick={() => setSelected(null)} className={styles.iconButton}><X size={13} /></button>
                </div>
              </div>

              {selected.holiday?.length > 0 && selected.holiday.map(h => <div key={`${h.source}-${h._id || h.date}-${h.title}`} className={`${styles.infoBanner} ${styles.holidayBanner}`}><CalendarDays size={14} />{h.title}</div>)}
              {selected.isWeekend && !selected.holiday?.length && <div className={`${styles.infoBanner} ${styles.weekendBanner}`}><CalendarRange size={14} />Weekend</div>}

              {/* Attendance */}
              {selected.att && (
                <div className={styles.attendanceGrid}>
                  {[
                    ['Status', selected.att.status || '-'],
                    ['Work Mode', selected.att.timeStatus === 'WFH' ? 'WFH' : 'Office'],
                    ['Check In', formatAttendanceTime(selected.att.checkIn)],
                    ['Check Out', formatAttendanceTime(selected.att.checkOut)],
                    ['Hours', selected.att.workingHours ? `${selected.att.workingHours.toFixed(1)}h` : '-'],
                  ].map(([label, val]) => (
                    <div key={label} className={styles.attendanceCell}>
                      <p className={styles.microLabel}>{label}</p>
                      <p className={styles.microValue}>{val}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Events on this day */}
              {selected.dayEvents?.length > 0 && (
                <div className={styles.sectionBlock}>
                  <p className={styles.sectionLabel}>Events</p>
                  {selected.dayEvents.map(ev => {
                    const t = EVENT_TYPES.find(x => x.value === ev.type);
                    const EventIcon = t?.Icon || CalendarDays;
                    return (
                      <div key={ev._id} className={styles.eventRow} style={{ background: `${ev.color}10`, border: `1px solid ${ev.color}30` }}>
                        <span className={`${styles.iconBox} ${styles.eventIcon}`} style={{ color: t?.color || ev.color || '#6366f1', background: t?.bg || `${ev.color}15` }}><EventIcon size={14} strokeWidth={2.1} /></span>
                        <div className={styles.eventInfo}>
                          <p className={styles.eventTitle}>{ev.title}</p>
                          {!ev.isAllDay && ev.startTime && <p className={styles.eventMeta}>{ev.startTime}{ev.endTime ? ` - ${ev.endTime}` : ''}</p>}
                          {ev.description && <p className={`${styles.eventMeta} ${styles.eventDescription}`}>{ev.description}</p>}
                          <p className={styles.eventAuthor}>by {ev.createdBy?.name || 'Unknown'}</p>
                        </div>
                        <div className={styles.rowActions}>
                          {(canEditCalendarItem(ev) || canDeleteCalendarItem(ev)) && <>
                            {canEditCalendarItem(ev) && <button title="Edit event" onClick={() => { setEditEvent(ev); setShowForm(true); }}
                              className={`${styles.iconButton} ${styles.editButton}`}><Pencil size={13} /></button>
                            }
                            {canDeleteCalendarItem(ev) && <button title="Delete event" onClick={() => handleDeleteEvent(ev._id)}
                              className={`${styles.iconButton} ${styles.deleteButton}`}><Trash2 size={13} /></button>}
                          </>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Birthdays on this day */}
              {selected.bds?.length > 0 && (
                <div className={styles.sectionBlock}>
                  <p className={styles.birthdaySectionLabel}><Cake size={14} /> Birthdays</p>
                  {selected.bds.map(p => (
                    <div key={p._id} className={styles.birthdayRow}>
                      <BirthdayAvatar person={p} size={28} />
                      <div className={styles.truncateBox}>
                        <p className={styles.personName}>{p.name}</p>
                        <p className={styles.personMeta}>{birthdayDate(getBirthdayDob(p))}{birthdayAge(getBirthdayDob(p), year) ? ` - ${birthdayAge(getBirthdayDob(p), year)} yrs` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!selected.att && !selected.holiday?.length && !selected.isWeekend && !selected.bds?.length && !selected.dayEvents?.length && (
                <div className={styles.emptyDetail}>
                  <CalendarDays size={26} color="#94a3b8" strokeWidth={1.7} className={styles.emptyIcon} />
                  <p className={styles.emptyText}>No records for this day</p>
                  {canCreateAny && (
                    <button onClick={() => { setNewEventDate(selected.dateStr); setEditEvent(null); setShowForm(true); }}
                      className={styles.primaryButton}>
                      + Create Event
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className={`${styles.card} ${styles.selectDayCard}`}>
              <CalendarDays size={26} color="#94a3b8" strokeWidth={1.7} className={styles.selectDayIcon} />
              <p className={styles.selectDayText}>Select a day to view details{canCreateAny ? ' or create an event' : ''}</p>
              {canCreateAny && (
                <button onClick={() => { setNewEventDate(''); setEditEvent(null); setShowForm(true); }}
                  className={styles.primaryButton}>
                  <Plus size={14} /> Add Event
                </button>
              )}
            </div>
          )}

          <BirthdayList birthdays={birthdays} year={year} month={month} onSelectDay={handleDayClick} />

          <div className={`${styles.card} ${styles.sidebarCard} ${styles.shadowCard}`}>
            <div className={styles.listHeader}>
              <div className={`${styles.iconBox} ${styles.holidayIcon}`}><CalendarDays size={15} strokeWidth={2.2} /></div>
              <div>
                <p className={styles.listTitle}>Upcoming Holidays</p>
                <p className={styles.listSubtitle}>{MONTHS[month]} {year}</p>
              </div>
            </div>
            {monthHolidays.length > 0 ? (
              <div className={`${styles.scrollList} ${styles.holidayList}`}>
                {monthHolidays.map(h => {
                  const date = new Date(h.date);
                  const day = Number.isNaN(date.getTime()) ? parseInt(String(h.date).split('-')[2]) : date.getDate();
                  return (
                    <button key={`${h.source}-${h._id || h.date}-${h.title}`} type="button" onClick={() => handleDayClick(day)}
                      className={`${styles.listButton} ${styles.holidayButton}`}>
                      <div className={styles.holidayDay}>{day}</div>
                      <div className={styles.truncateBox}>
                        <p className={styles.monthEventTitle}>{h.title}</p>
                        <p className={styles.holidayMeta}>{h.companyHoliday ? 'Company Holiday' : h.source === 'settings' ? 'Holiday' : 'Calendar Holiday'}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyList}>No holidays this month</div>
            )}
          </div>

          {/* This month's events */}
          {events.length > 0 && (
            <div className={`${styles.card} ${styles.monthEventsCard}`}>
              <p className={styles.monthEventsTitle}>Events this month</p>
              <div className={`${styles.scrollList} ${styles.eventsList}`}>
                {events.map(ev => {
                  return (
                    <div key={ev._id} className={styles.monthEventRow}
                      onClick={() => handleDayClick(parseInt(ev.date.split('-')[2]))}>
                      <div className={styles.monthEventDot} style={{ background: ev.color }} />
                      <div className={styles.truncateBox}>
                        <p className={styles.monthEventTitle}>{ev.title}</p>
                        <p className={styles.monthEventDate}>{ev.date.slice(8)} {MONTHS[month].slice(0, 3)} </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Event form modal */}
      {showForm && (
        <EventForm
          date={newEventDate || selected?.dateStr || ''}
          event={editEvent}
          allowedTypes={editEvent ? [editEvent.type] : allowedCreateTypes}
          onSave={() => { setShowForm(false); setEditEvent(null); fetchMonthData(); }}
          onCancel={() => { setShowForm(false); setEditEvent(null); }}
        />
      )}
    </div>
  );
}
