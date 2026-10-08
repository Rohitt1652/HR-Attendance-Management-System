'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { applyLeave, getMyBalance, getMyLeaves } from '@/api/leaveApi';
import { parseLeaveRequest } from '@/api/aiApi';
import { getAvailableBalance, getBalanceViewValues, getDayBalanceTotals, sortLeavesByBalance } from '@/utils/leaveBalance';
import { getRestrictedLeaveSequenceConflict } from '@/utils/leaveValidation';
import { getLeaveProofRequirement, isHalfDayOnlyLeaveType, isMedicalLeaveType } from '@/utils/leaveProof';
import { Sparkles, Loader2, CalendarDays, Clock, Sun, Send, X, Info, TrendingDown, CheckCircle, AlertCircle, ChevronDown, Paperclip } from 'lucide-react';
import TimePicker from '@/components/TimePicker';
import styles from './LeaveApplication.module.css';

/*
 * LeaveApplication — Style migration
 * Before: 104 inline styles
 * After:  ~61 inline styles
 * Removed: ~43 static styles → CSS classes
 * Remaining inline (all dynamic):
 *   - summary.color (computed from leave type data)
 *   - selectedType.color (data-driven)
 *   - lt.color per balance row (data-driven)
 *   - isActive ternary in dropdown items
 *   - exhausted opacity/cursor in dropdown
 *   - leaveMode active border/bg (o.c data-driven)
 *   - loading ternary on submit button bg/cursor
 *   - pct width in balance bar (computed)
 *   - remaining <= 0 color in balance bar
 *   - usagePercent SVG strokeDasharray (computed)
 */

function computeSummary(form, balance) {
  const lt = balance.find(t => t.name === form.leaveType);
  if (!lt) return null;
  if (form.durationType === 'full_day' && form.startDate && form.endDate) {
    const days = Math.round((new Date(form.endDate) - new Date(form.startDate)) / 86400000) + 1;
    if (days <= 0) return { text: 'Invalid date range', color: '#ef4444' };
    return { text: `${days} day${days !== 1 ? 's' : ''}`, color: lt.color };
  }
  if (form.durationType === 'half_day') return { text: '0.5 day', color: lt.color };
  if (form.durationType === 'hourly' && form.startTime && form.endTime) {
    const durationMinutes = computeTimeDurationMinutes(form.startTime, form.endTime);
    const hrs = durationMinutes / 60;
    if (durationMinutes <= 0) return { text: 'Invalid time range', color: '#ef4444' };
    return { text: `${hrs.toFixed(1)} hour${hrs !== 1 ? 's' : ''}`, color: lt.color };
  }
  return null;
}

function computeTimeDurationMinutes(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

const TIME_STEP_MINUTES = 5;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index);
const MINUTE_OPTIONS = Array.from({ length: 60 / TIME_STEP_MINUTES }, (_, index) => index * TIME_STEP_MINUTES);

function roundTimeToStep(time, stepMinutes = TIME_STEP_MINUTES) {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return time;
  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = (hours * 60) + minutes;
  const rounded = Math.round(totalMinutes / stepMinutes) * stepMinutes;
  const clamped = Math.max(0, Math.min(rounded, (24 * 60) - stepMinutes));
  const roundedHours = Math.floor(clamped / 60);
  const roundedMinutes = clamped % 60;
  return `${String(roundedHours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
}

function formatTimeValue(hours, minutes) {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function TimeSelect({ value, onChange, inputClassName }) {
  return <TimePicker value={value} onChange={onChange} className={inputClassName} />;
}

function addMinutesToTime(startTime, minutesToAdd) {
  if (!startTime || !minutesToAdd) return null;
  const [hours, minutes] = startTime.split(':').map(Number);
  const total = (hours * 60) + minutes + minutesToAdd;
  if (total <= 0 || total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function getMaxHoursPerApplication(leaveType) {
  if (!leaveType) return null;
  if (leaveType.durationHours) return leaveType.durationHours;
  if (leaveType.maxHours) return leaveType.maxHours;
  if (leaveType.allowedHours) return leaveType.allowedHours;
  if (leaveType.shortLeaveHours) return leaveType.shortLeaveHours;
  if (leaveType.maxHoursPerApplication) return leaveType.maxHoursPerApplication;
  return null;
}

function shouldAutoFillHourlyEndTime(leaveType, durationType) {
  return durationType === 'hourly' && (leaveType?.allowHourly || leaveType?.unit === 'count' || leaveType?.unit === 'hours');
}

function getAutoEndTime(startTime, leaveType) {
  const hours = getMaxHoursPerApplication(leaveType);
  if (!hours) return null;
  return roundTimeToStep(addMinutesToTime(startTime, Math.round(Number(hours) * 60)));
}

function getHourlyTimeError(form, leaveType) {
  if (form.durationType !== 'hourly' || !form.startTime || !form.endTime) return '';
  const durationMinutes = computeTimeDurationMinutes(form.startTime, form.endTime);
  if (durationMinutes <= 0) return 'Invalid time range';
  const maxHoursPerApplication = getMaxHoursPerApplication(leaveType);
  if (maxHoursPerApplication && durationMinutes > maxHoursPerApplication * 60) {
    return `${leaveType.name} cannot exceed ${maxHoursPerApplication} hours.`;
  }
  return '';
}

function formatDays(days) {
  return Number.isInteger(days) ? String(days) : String(parseFloat(Number(days).toFixed(1)));
}

function formatBalanceValue(value, leaveType, long = false) {
  if (leaveType?.unit === 'hours') return `${formatDays(value ?? 0)}${long ? ' hours' : 'h'}`;
  if (leaveType?.unit === 'count') return `${formatDays(value ?? 0)}${long ? ' left' : ''}`;
  return `${formatDays(value ?? 0)}d`;
}

function computeRequestedDays(form) {
  if (form.durationType === 'full_day' && form.startDate && form.endDate) {
    const days = Math.round((new Date(form.endDate) - new Date(form.startDate)) / 86400000) + 1;
    return days > 0 ? days : null;
  }
  if (form.durationType === 'half_day' && form.startDate) return 0.5;
  return null;
}

function buildInsufficientBalanceMessage(leaveType, requestedDays) {
  const availableBalance = getAvailableBalance(leaveType) ?? 0;
  const usedPending = leaveType.usedPendingDays ?? ((leaveType.usedDays || 0) + (leaveType.pendingDays || 0));
  const allocated = leaveType.allocatedDays ?? leaveType.daysAllowed ?? 0;
  return `Insufficient ${leaveType.name} balance. Requested: ${formatDays(requestedDays)}d, Available: ${formatDays(availableBalance)}d, Used/Pending: ${formatDays(usedPending)}d out of ${formatDays(allocated)}d allocated.`;
}

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isPastDate(dateString, todayString) {
  return !!dateString && dateString < todayString;
}

function isTodayOrPastDate(dateString, todayString) {
  return !!dateString && dateString <= todayString;
}

function getTomorrowDateString(todayString) {
  const [year, month, day] = todayString.split('-').map(Number);
  const tomorrow = new Date(year, month - 1, day + 1);
  return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
}

function addMonthsToDateString(dateString, months) {
  const [inputYear, inputMonth, inputDay] = dateString.split('-').map(Number);
  const targetMonthIndex = inputMonth - 1 + months;
  const lastTargetDay = new Date(inputYear, targetMonthIndex + 1, 0).getDate();
  const date = new Date(inputYear, targetMonthIndex, Math.min(inputDay, lastTargetDay));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRestrictionError(form, todayDate) {
  if (!form.startDate) return '';
  if (form.leaveMode === 'Planned' && isTodayOrPastDate(form.startDate, todayDate)) {
    return 'Planned leave can be applied only for future dates.';
  }
  if (form.leaveMode === 'Unplanned') {
    const minDate = addMonthsToDateString(todayDate, -1);
    if (form.startDate < minDate || (form.endDate && form.endDate < minDate)) {
      return 'Unplanned leave can be applied only up to 1 month in the past.';
    }
    if (form.startDate > todayDate || (form.endDate && form.endDate > todayDate)) {
      return 'Unplanned leave cannot be applied for future dates.';
    }
  }
  return '';
}

function isSaturdayDate(dateString) {
  if (!dateString) return false;
  return new Date(`${dateString}T00:00:00`).getDay() === 6;
}

function getDurationOptions(leaveType, isSaturday) {
  if (!leaveType) return [];
  if (isHalfDayOnlyLeaveType(leaveType)) {
    if (isSaturday) return [];
    return [{ value: 'half_day', label: 'Half Day', icon: Sun }];
  }
  const options = [];
  if (leaveType.allowFullDay !== false) options.push({ value: 'full_day', label: 'Full Day', icon: CalendarDays });
  if (!isSaturday && leaveType.allowHalfDay) options.push({ value: 'half_day', label: 'Half Day', icon: Sun });
  if (!isSaturday && leaveType.allowHourly) options.push({ value: 'hourly', label: 'Hourly', icon: Clock });
  return options;
}

/* Shared input/label style objects — used across many inputs */
const S = {
  input: { width: '100%', padding: '0.55rem 0.8rem', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box', background: '#fff', color: '#111827', transition: 'border-color 0.15s, box-shadow 0.15s' },
  label: { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.03em' },
};

function LeaveTypeSelect({ value, options, selectedType, onChange, disabled = false, placeholder = 'Select leave type...' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.name === value);
  return (
    <div className="relative">
      {/* Trigger */}
      <button type="button" disabled={disabled} onClick={() => { if (!disabled) setOpen(o => !o); }}
        style={{ ...S.input, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.65 : 1, fontWeight: 600, textAlign: 'left', maxWidth: '360px' }}>
        <div className="d-flex align-center" style={{ gap: '8px' }}>
          {selected && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: selected.color, flexShrink: 0 }} />}
          <span style={{ color: selected ? '#111827' : '#9ca3af' }}>{selected ? selected.name : placeholder}</span>
        </div>
        <div className="d-flex align-center" style={{ gap: '6px' }}>
          {selected && selected.isFreeHand && (
            <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#0d9488', background: '#f0fdfa', padding: '1px 5px', borderRadius: '4px' }}>No limit</span>
          )}
          {selected && !selected.isFreeHand && getAvailableBalance(selected) !== null && (
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: getAvailableBalance(selected) <= 0 ? '#dc2626' : '#16a34a', background: getAvailableBalance(selected) <= 0 ? '#fef2f2' : '#f0fdf4', padding: '1px 6px', borderRadius: '4px' }}>{formatBalanceValue(getAvailableBalance(selected), selected, true)}</span>
          )}
          <ChevronDown size={14} color="#9ca3af" style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
        </div>
      </button>
      {/* Dropdown */}
      {open && !disabled && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setOpen(false)} />
          <div className="bg-white overflow-hidden" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', width: '100%', maxWidth: '360px', borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)', zIndex: 100, animation: 'fadeIn 0.12s ease' }}>
            <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '4px' }}>
              {options.map(lt => {
                const isActive = lt.name === value;
                const periodRemaining = getAvailableBalance(lt);
                const exhausted = periodRemaining !== null && periodRemaining <= 0 && !lt.isFreeHand;
                return (
                  <button key={lt.name} type="button"
                    onClick={() => { if (!exhausted) { onChange(lt.name); setOpen(false); } }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 0.625rem', borderRadius: '6px', border: 'none', background: isActive ? '#f5f3ff' : 'transparent', cursor: exhausted ? 'not-allowed' : 'pointer', opacity: exhausted ? 0.5 : 1, textAlign: 'left', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (!isActive && !exhausted) e.currentTarget.style.background = '#f9fafb'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? '#f5f3ff' : 'transparent'; }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: lt.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: isActive ? 700 : 500, color: isActive ? '#4f46e5' : '#374151' }}>{lt.name}</span>
                    {lt.isFreeHand && (
                      <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#0d9488', background: '#f0fdfa', padding: '1px 5px', borderRadius: '4px' }}>No limit</span>
                    )}
                    {!lt.isFreeHand && periodRemaining !== null && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: exhausted ? '#dc2626' : '#6b7280' }}>{formatBalanceValue(periodRemaining, lt, true)}</span>
                    )}
                    {!lt.isFreeHand && periodRemaining === null && <span className="text-muted" style={{ fontSize: '0.65rem' }}>∞</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function LeaveApplication() {
  const router = useRouter();
  const [balance, setBalance]             = useState([]);
  const [mounted, setMounted]             = useState(false);
  const [form, setForm]                   = useState({
    leaveType: '', durationType: 'full_day', startDate: '', endDate: '',
    halfDayPeriod: 'morning', startTime: '09:00', endTime: '11:00',
    reason: '', leaveMode: 'Planned', currentProject: '',
  });
  const [loading, setLoading]             = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceView, setBalanceView]     = useState('half');
  const [aiText, setAiText]               = useState('');
  const [aiLoading, setAiLoading]         = useState(false);
  const [showAi, setShowAi]               = useState(false);
  const [proofFile, setProofFile]         = useState(null);
  const [medicalLeaves, setMedicalLeaves] = useState([]);

  const loadBalance = async (asOfDate, keepSelection = true) => {
    setBalanceLoading(true);
    try {
      const res = await getMyBalance(asOfDate ? { asOfDate } : undefined);
      const data = res.data.data || [];
      setBalance(data);
      setForm(f => {
        if (!keepSelection) return { ...f, leaveType: '' };
        const selected = data.find(t => t.name === f.leaveType);
        if (!selected) return { ...f, leaveType: '' };
        const remaining = getAvailableBalance(selected);
        if (!selected.isFreeHand && remaining !== null && remaining <= 0) return { ...f, leaveType: '' };
        return { ...f, endTime: getAutoEndTime(f.startTime, selected) || f.endTime };
      });
    } catch {
      toast.error('Failed to load leave balance');
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleAiFill = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const res = await parseLeaveRequest(aiText);
      const d = res.data.data;
      setForm(f => ({ ...f, leaveType: d.leaveType || f.leaveType, startDate: d.startDate || f.startDate, endDate: d.endDate || d.startDate || f.endDate, durationType: d.durationType || f.durationType, halfDayPeriod: d.halfDayPeriod || f.halfDayPeriod, reason: d.reason || f.reason, leaveMode: d.leaveMode || f.leaveMode }));
      setShowAi(false); setAiText('');
      toast.success('Form filled by AI — review before submitting');
    } catch { toast.error('AI could not parse your request.'); }
    finally { setAiLoading(false); }
  };

  useEffect(() => {
    setMounted(true);
    loadBalance(null, false);
  }, []);

  useEffect(() => {
    if (!mounted || !form.startDate) return;
    loadBalance(form.startDate, true);
  }, [form.startDate, mounted]);

  useEffect(() => {
    if (!mounted || !isMedicalLeaveType(form.leaveType)) {
      setMedicalLeaves([]);
      return;
    }
    const year = new Date().getFullYear();
    getMyLeaves({ startDate: `${year}-01-01`, endDate: `${year}-12-31` })
      .then((res) => {
        const leaves = (res.data.data || []).filter(
          (l) => ['Pending', 'Approved'].includes(l.status)
            && isMedicalLeaveType({ name: l.leaveType, code: l.leaveTypeCode })
        );
        setMedicalLeaves(leaves);
      })
      .catch(() => setMedicalLeaves([]));
  }, [mounted, form.leaveType]);

  const selectedType    = balance.find(t => t.name === form.leaveType);
  const availableLeaves = sortLeavesByBalance(balance);
  const selectedDateIsSaturday = isSaturdayDate(form.startDate);
  const durationOptions = getDurationOptions(selectedType, selectedDateIsSaturday);
  const fixedHalfDayLeave = isHalfDayOnlyLeaveType(selectedType) || isHalfDayOnlyLeaveType(form.leaveType);
  const displayDuration = fixedHalfDayLeave ? 'half_day' : form.durationType;
  const handleLeaveTypeChange = (name) => {
    const lt = balance.find(t => t.name === name);
    if (!lt) return;
    const dur = (isHalfDayOnlyLeaveType(lt) || isHalfDayOnlyLeaveType(name)) ? 'half_day' : (getDurationOptions(lt, selectedDateIsSaturday)[0]?.value || 'full_day');
    setForm(f => ({ ...f, leaveType: name, durationType: dur, endTime: getAutoEndTime(f.startTime, lt) || f.endTime }));
    if (!getLeaveProofRequirement(lt, computeRequestedDays({ ...form, leaveType: name }), { existingLeaves: medicalLeaves, form: { ...form, leaveType: name } })) setProofFile(null);
  };

  async function validateRestrictedLeaveSequence({ leaveType, startDate, endDate }) {
    if (!leaveType) return null;
    const payload = { startDate, endDate, leaveType };
    try {
      const res = await getMyLeaves(payload);
      const leaves = res.data.data || [];
      return getRestrictedLeaveSequenceConflict({ leaveType, startDate, endDate, existingLeaves: leaves });
    } catch (err) {
      return null;
    }
  }
  const handleDurationChange = (durationType) => {
    setForm(f => ({ ...f, durationType, endTime: shouldAutoFillHourlyEndTime(selectedType, durationType) ? (getAutoEndTime(f.startTime, selectedType) || f.endTime) : f.endTime }));
  };
  const handleStartTimeChange = (startTime) => {
    const normalizedStart = roundTimeToStep(startTime);
    setForm(f => ({ ...f, startTime: normalizedStart, endTime: shouldAutoFillHourlyEndTime(selectedType, f.durationType) ? (getAutoEndTime(normalizedStart, selectedType) || f.endTime) : f.endTime }));
  };
  const handleEndTimeChange = (endTime) => {
    setForm(f => ({ ...f, endTime: roundTimeToStep(endTime) }));
  };
  const handleStartDateChange = (startDate) => {
    if (form.leaveMode === 'Planned' && isTodayOrPastDate(startDate, todayDate)) {
      toast.error('Planned leave can be applied only for future dates.');
      setForm(f => ({ ...f, startDate: '', endDate: '', leaveType: '' }));
      return;
    }
    if (form.leaveMode === 'Unplanned') {
      const minDate = addMonthsToDateString(todayDate, -1);
      if (startDate < minDate) {
        toast.error('Unplanned leave can be applied only up to 1 month in the past.');
        setForm(f => ({ ...f, startDate: '', endDate: '', leaveType: '' }));
        return;
      }
      if (startDate > todayDate) {
        toast.error('Unplanned leave cannot be applied for future dates.');
        setForm(f => ({ ...f, startDate: '', endDate: '', leaveType: '' }));
        return;
      }
    }
    setForm(f => ({ ...f, startDate, endDate: f.endDate && f.endDate < startDate ? startDate : f.endDate }));
  };
  const handleLeaveModeChange = (leaveMode) => {
    setForm(f => {
      const next = { ...f, leaveMode };
      if (leaveMode === 'Planned' && isTodayOrPastDate(f.startDate, todayDate)) {
        return { ...next, startDate: '', endDate: '', leaveType: '' };
      }
      if (leaveMode === 'Unplanned') {
        const minDate = addMonthsToDateString(todayDate, -1);
        if (f.startDate && f.startDate < minDate) return { ...next, startDate: '', endDate: '', leaveType: '' };
      }
      return next;
    });
  };
  const summary = computeSummary(form, balance);
  const requestedDays = computeRequestedDays(form);
  const proofForm = { ...form, durationType: fixedHalfDayLeave ? 'half_day' : form.durationType };
  const proofRequirement = getLeaveProofRequirement(
    selectedType || { name: form.leaveType },
    requestedDays,
    { existingLeaves: medicalLeaves, form: proofForm }
  );
  const availableBalance = getAvailableBalance(selectedType);
  const balanceError = selectedType && requestedDays !== null && availableBalance !== null && requestedDays > availableBalance
    ? buildInsufficientBalanceMessage(selectedType, requestedDays)
    : '';
  const todayDate = getTodayDateString();
  const unplannedMinDate = addMonthsToDateString(todayDate, -1);
  const plannedMinDate = getTomorrowDateString(todayDate);
  const startDateMin = form.leaveMode === 'Planned' ? plannedMinDate : unplannedMinDate;
  const startDateMax = form.leaveMode === 'Unplanned' ? todayDate : undefined;
  const dateError = getDateRestrictionError(form, todayDate);
  const timeError = getHourlyTimeError(form, selectedType);
  useEffect(() => {
    if (!proofRequirement) setProofFile(null);
  }, [proofRequirement?.kind, proofRequirement?.required]);

  useEffect(() => {
    if (fixedHalfDayLeave && form.durationType !== 'half_day') {
      setForm((f) => ({ ...f, durationType: 'half_day' }));
    }
  }, [fixedHalfDayLeave, form.durationType]);

  useEffect(() => {
    if (selectedDateIsSaturday && ['half_day', 'hourly'].includes(form.durationType) && !fixedHalfDayLeave) {
      const nextDuration = selectedType?.allowFullDay === false ? '' : 'full_day';
      setForm(f => ({ ...f, durationType: nextDuration }));
    }
  }, [selectedDateIsSaturday, form.durationType, selectedType]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.leaveType) return toast.error('Select a leave type');
    if (!form.durationType) return toast.error('No duration option is available for this leave type on the selected date');
    if (!form.startDate) return toast.error('Select a start date');
    if (dateError) return toast.error(dateError);
    if (timeError) return toast.error(timeError);
    if (!form.reason.trim()) return toast.error('Please provide a reason');
    const effectiveDuration = fixedHalfDayLeave ? 'half_day' : form.durationType;
    const requestedEndDate = effectiveDuration === 'hourly' ? form.startDate : (form.endDate || form.startDate);
    if (proofRequirement && !proofFile) {
      return toast.error(proofRequirement.errorMessage);
    }
    if (balanceError) return toast.error(balanceError);
    setLoading(true);
    const restrictedWarning = await validateRestrictedLeaveSequence({ leaveType: form.leaveType, startDate: form.startDate, endDate: requestedEndDate });
    if (restrictedWarning) {
      setLoading(false);
      return toast.error(restrictedWarning);
    }
    try {
      const payload = {
        leaveType: form.leaveType,
        durationType: effectiveDuration,
        startDate: form.startDate,
        endDate: effectiveDuration === 'hourly' ? form.startDate : (form.endDate || form.startDate),
        reason: form.reason,
        currentProject: form.currentProject || null,
        leaveMode: form.leaveMode,
        ...(effectiveDuration === 'half_day' && { halfDayPeriod: form.halfDayPeriod }),
        ...(effectiveDuration === 'hourly' && { startTime: form.startTime, endTime: form.endTime }),
      };

      if (proofFile) {
        const fd = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value != null && value !== '') fd.append(key, value);
        });
        fd.append('proof', proofFile);
        await applyLeave(fd);
      } else {
        await applyLeave(payload);
      }
      toast.success('Leave application submitted');
      router.push('/employee/leaves');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to apply'); }
    finally { setLoading(false); }
  };

  if (!mounted) return (
    <div className={`d-flex align-center justify-center text-muted ${styles.loading}`}>
      <Loader2 size={18} className={`${styles.spin} ${styles.spinnerGap}`} /> Loading...
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const dayTotals      = getDayBalanceTotals(availableLeaves);
  const totalAlloc     = dayTotals.allocated;
  const totalUsed      = dayTotals.used;
  const totalRemaining = dayTotals.remaining;
  const usagePercent   = totalAlloc > 0 ? Math.round((totalUsed / totalAlloc) * 100) : 0;

  return (
    <div className={styles.layout}>
      {/* ─── Left: Form ─── */}
      <div className={styles.main}>

        {/* Header */}
        <div className="row-between">
          <div>
            <h2 className={`font-extrabold tracking-tight ${styles.title}`}>New Leave Request</h2>
            <p className={`text-muted ${styles.subtitle}`}>Fill in the details below</p>
          </div>
          <button type="button" onClick={() => setShowAi(v => !v)}
            className={`row-center cursor-pointer font-bold text-white ${styles.aiButton}`}
            style={{ background: showAi ? '#4f46e5' : 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            <Sparkles size={13} /> AI Fill
          </button>
        </div>

        {/* AI Panel */}
        {showAi && (
          <div className={styles.aiPanel}>
            <div className={`d-flex ${styles.aiRow}`}>
              <input value={aiText} onChange={e => setAiText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAiFill(); }}
                placeholder='"2 days casual leave from Monday"' className={`${styles.input} ${styles.aiInput}`} />
              <button onClick={handleAiFill} disabled={aiLoading || !aiText.trim()}
                className={styles.aiSubmit} style={{ background: aiLoading ? '#e5e7eb' : '#7c3aed', cursor: aiLoading ? 'not-allowed' : 'pointer' }}>
                {aiLoading ? '...' : 'Go'}
              </button>
              <button onClick={() => setShowAi(false)} className="btn-ghost-base cursor-pointer"><X size={15} color="#9ca3af" /></button>
            </div>
          </div>
        )}

        {/* Form Card */}
        <form onSubmit={handleSubmit} noValidate className={`bg-white d-flex-col ${styles.formCard}`}>

            {/* Leave Type */}
            <div className="relative">
              <label className={styles.label}>Leave Type</label>
              <LeaveTypeSelect value={form.leaveType} options={availableLeaves} selectedType={selectedType} onChange={handleLeaveTypeChange} disabled={balanceLoading} placeholder={balanceLoading ? 'Loading...' : 'Select leave type...'} />
            </div>

          {/* Leave Mode */}
            <div>
              <label className={styles.label}>Mode</label>
              <div className={styles.modeGrid}>
              {[{ val: 'Planned', icon: CalendarDays, sub: 'Applied in advance', c: '#4f46e5' }, { val: 'Unplanned', icon: AlertCircle, sub: 'Emergency / sudden', c: '#d97706' }].map(o => {
                const active = form.leaveMode === o.val;
                const Icon = o.icon;
                return (
                  <button key={o.val} type="button" onClick={() => handleLeaveModeChange(o.val)}
                    className={`row-center cursor-pointer ${styles.modeButton}`}
                    style={{ border: active ? `1.5px solid ${o.c}` : '1.5px solid #e5e7eb', background: active ? `${o.c}06` : '#fff' }}>
                    <Icon size={15} color={active ? o.c : '#9ca3af'} strokeWidth={active ? 2.2 : 1.8} />
                    <div>
                      <p className={styles.modeTitle} style={{ color: active ? o.c : '#374151' }}>{o.val}</p>
                      <p className={`text-muted ${styles.modeSub}`}>{o.sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date Fields */}
          {displayDuration === 'full_day' && (
            <div className={styles.twoCol}>
              <div><label className={styles.label}>From</label><input className={styles.input} type="date" value={form.startDate} min={startDateMin} max={startDateMax} onChange={e => handleStartDateChange(e.target.value)} /></div>
              <div><label className={styles.label}>To</label><input className={styles.input} type="date" value={form.endDate} min={form.startDate || startDateMin} max={startDateMax} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
          )}
          {displayDuration === 'half_day' && (
            <div className={styles.twoCol}>
              <div><label className={styles.label}>Date</label><input className={styles.input} type="date" value={form.startDate} min={startDateMin} max={startDateMax} onChange={e => handleStartDateChange(e.target.value)} /></div>
              <div><label className={styles.label}>Period</label><select className={styles.input} value={form.halfDayPeriod} onChange={e => setForm(f => ({ ...f, halfDayPeriod: e.target.value }))}><option value="morning">Morning</option><option value="afternoon">Afternoon</option></select></div>
            </div>
          )}
          {displayDuration === 'hourly' && (
            <div className={styles.threeCol}>
              <div><label className={styles.label}>Date</label><input className={styles.input} type="date" value={form.startDate} min={startDateMin} max={startDateMax} onChange={e => handleStartDateChange(e.target.value)} /></div>
              <div><label className={styles.label}>From</label><TimeSelect value={form.startTime} onChange={handleStartTimeChange} inputClassName={styles.input} /></div>
              <div><label className={styles.label}>To</label><TimeSelect value={form.endTime} onChange={handleEndTimeChange} inputClassName={styles.input} /></div>
            </div>
          )}

          {/* (Leave Type moved above Mode & Date fields) */}

          {/* Duration */}
          {fixedHalfDayLeave && durationOptions.length > 0 && (
            <div>
              <label className={styles.label}>Duration</label>
              <p className={styles.fixedDuration}>Half day (0.5 day)</p>
            </div>
          )}
          {durationOptions.length > 1 && !fixedHalfDayLeave && (
            <div>
              <label className={styles.label}>Duration</label>
              <div className={styles.durationWrap}>
                {durationOptions.map(d => {
                  const Icon = d.icon;
                  const active = form.durationType === d.value;
                  return (
                    <button key={d.value} type="button" onClick={() => handleDurationChange(d.value)}
                      className={`row-center cursor-pointer ${styles.durationButton}`}
                      style={{ background: active ? '#fff' : 'transparent', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: active ? 700 : 500, color: active ? '#111827' : '#6b7280' }}>
                      <Icon size={13} strokeWidth={active ? 2.5 : 2} /> {d.label}
                    </button>
                  );
                })}
              </div>
              {selectedDateIsSaturday && (
                <p className={styles.warning}>
                  Saturday has 4 required working hours, so only full-day leave can be applied.
                </p>
              )}
            </div>
          )}

          {dateError && (
            <p className={styles.error}>{dateError}</p>
          )}
          {timeError && (
            <p className={styles.error}>{timeError}</p>
          )}
          {balanceError && (
            <p className={styles.error}>{balanceError}</p>
          )}

          {proofRequirement && (
            <div>
              <label className={styles.label}>
                <Paperclip size={13} style={{ marginRight: 4 }} />
                {proofRequirement.label} *
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,image/*"
                onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                className={styles.fileInput}
              />
              <p className={styles.fileHint}>{proofRequirement.hint}</p>
              {proofFile && <p className={styles.fileName}>{proofFile.name}</p>}
            </div>
          )}

          {/* Summary pill — color is data-driven */}
          {summary && (
            <div className={`row-center ${styles.summary}`} style={{ background: `${summary.color}0a`, border: `1px solid ${summary.color}20` }}>
              <div className={styles.summaryDot} style={{ background: summary.color }} />
              <span className={styles.summaryText} style={{ color: summary.color }}>{summary.text}</span>
            </div>
          )}

          

          {/* Reason */}
          <div>
            <label className={styles.label}>Reason *</label>
            <textarea rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Briefly describe the reason..." maxLength={500}
              className={`${styles.input} ${styles.textarea}`} />
            <p className={styles.charCount} style={{ color: form.reason.length > 400 ? '#d97706' : '#d1d5db' }}>{form.reason.length}/500</p>
          </div>

          {/* Project */}
          <div>
            <label className={styles.label}>Project <span className={styles.optional}>optional</span></label>
            <input value={form.currentProject || ''} onChange={e => setForm(f => ({ ...f, currentProject: e.target.value }))}
              placeholder="e.g. Client Portal, Internal Tool..." className={styles.input} />
          </div>

          {/* Actions */}
          <div className={`d-flex gap-2 ${styles.actions}`}>
            <button type="submit" disabled={loading || !!balanceError || !!dateError || !!timeError}
              className={`row-center font-bold text-white cursor-pointer ${styles.submitButton}`}
              style={{ background: loading || balanceError || dateError || timeError ? '#a5b4fc' : '#4f46e5', cursor: loading || balanceError || dateError || timeError ? 'not-allowed' : 'pointer' }}>
              {loading ? <Loader2 size={14} className={styles.spin} /> : <Send size={14} />}
              {loading ? 'Submitting...' : 'Submit'}
            </button>
            <button type="button" onClick={() => router.back()}
              className={styles.cancelButton}>
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* ─── Right: Balance Panel ─── */}
      <div className={styles.sidebar}>

        {/* Usage Overview */}
        <div className={`bg-white ${styles.panel}`}>
          <p className={`font-bold uppercase ${styles.panelTitle}`}>Leave Overview</p>
          {/* Progress ring — strokeDasharray computed, stays inline */}
          <div className={`row-center ${styles.overview}`}>
            <div className={`relative ${styles.ring}`}>
              <svg width="56" height="56" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="#f3f4f6" strokeWidth="5" />
                <circle cx="28" cy="28" r="24" fill="none" stroke="#4f46e5" strokeWidth="5"
                  strokeDasharray={`${usagePercent * 1.508} 150.8`} strokeLinecap="round"
                  transform="rotate(-90 28 28)" className={styles.ringCircle} />
              </svg>
              <span className={`d-flex align-center justify-center font-extrabold ${styles.ringText}`}>{usagePercent}%</span>
            </div>
            <div>
              <p className={`font-bold ${styles.overviewText}`}>{totalUsed}d used</p>
              <p className={`text-muted ${styles.overviewSub}`}>of {totalAlloc}d allocated</p>
            </div>
          </div>
          {/* Stats row */}
          <div className={styles.statsGrid}>
            <div className={`${styles.statBox} ${styles.statGreen}`}>
              <p className={`font-extrabold ${styles.statValue}`} style={{ color: '#16a34a' }}>{totalRemaining}d</p>
              <p className={`text-secondary ${styles.statLabel}`}>Remaining</p>
            </div>
            <div className={`${styles.statBox} ${styles.statAmber}`}>
              <p className={`font-extrabold ${styles.statValue}`} style={{ color: '#d97706' }}>{totalUsed}d</p>
              <p className={`text-secondary ${styles.statLabel}`}>Used</p>
            </div>
          </div>
        </div>

        {/* Balance breakdown */}
        <div className={`bg-white ${styles.panel}`}>
          <div className={`row-between ${styles.balanceHeader}`}>
            <p className={`font-bold uppercase ${styles.panelTitleFlat}`}>Balance</p>
            <div className={`d-flex align-center ${styles.miniToggle}`}>
              <button type="button" onClick={() => setBalanceView('half')} className={styles.miniToggleButton} style={{ background: balanceView === 'half' ? '#fff' : 'transparent', color: balanceView === 'half' ? '#4f46e5' : '#9ca3af', boxShadow: balanceView === 'half' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>6 Mo</button>
              <button type="button" onClick={() => setBalanceView('year')} className={styles.miniToggleButton} style={{ background: balanceView === 'year' ? '#fff' : 'transparent', color: balanceView === 'year' ? '#4f46e5' : '#9ca3af', boxShadow: balanceView === 'year' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>Year</button>
            </div>
          </div>
          <div className={styles.balanceList}>
            {availableLeaves.map(lt => {
              const { used, quota, remaining } = getBalanceViewValues(lt, balanceView);
              const pct        = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
              return (
                <div key={lt.code} className={`row-center ${styles.balanceRow}`}>
                  <div className={styles.balanceDot} style={{ background: lt.color }} />
                  <span className={`text-body-clr font-medium flex-1 ${styles.balanceCode}`} title={lt.name}>{lt.code}</span>
                  <div className={`overflow-hidden ${styles.balanceTrack}`}>
                    <div className={styles.balanceFill} style={{ width: `${pct}%`, background: remaining <= 0 ? '#ef4444' : lt.color }} />
                  </div>
                  <span className={`font-bold ${styles.balanceValue}`} style={{ color: remaining <= 0 ? '#dc2626' : '#374151' }}>{formatBalanceValue(remaining, lt, true)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected type detail — color data-driven */}
        {selectedType && (
          <div style={{ background: `${selectedType.color}08`, borderRadius: '10px', border: `1px solid ${selectedType.color}20`, padding: '0.75rem' }}>
            <div className="row-center" style={{ gap: '0.375rem', marginBottom: '0.375rem' }}>
              <CheckCircle size={13} color={selectedType.color} />
              <span className="font-bold" style={{ fontSize: '0.75rem', color: selectedType.color }}>{selectedType.name}</span>
            </div>
            <div className="row-between text-secondary" style={{ fontSize: '0.7rem' }}>
              <span>Used/Pending: {formatBalanceValue(selectedType.usedPendingDays ?? selectedType.totalUsed ?? 0, selectedType)}</span>
              <span className="font-bold" style={{ color: getAvailableBalance(selectedType) <= 0 ? '#dc2626' : '#111827' }}>{formatBalanceValue(getAvailableBalance(selectedType) ?? 0, selectedType, true)}</span>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
