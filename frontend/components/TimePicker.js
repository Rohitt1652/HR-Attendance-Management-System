'use client';
import { useState, useRef, useEffect } from 'react';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';
import styles from './TimePicker.module.css';

const HOURS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
const AMPM_LIST = ['AM', 'PM'];

function parseTime24(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    return { hour12: '09', minute: '00', ampm: 'AM' };
  }
  const parts = timeStr.split(':');
  let h24 = parseInt(parts[0], 10);
  let min = parseInt(parts[1], 10);

  if (isNaN(h24)) h24 = 9;
  if (isNaN(min)) min = 0;

  let roundedMin = Math.round(min / 5) * 5;
  if (roundedMin >= 60) roundedMin = 55;

  const ampm = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;

  const hour12Str = String(h12).padStart(2, '0');
  const minuteStr = String(roundedMin).padStart(2, '0');

  return { hour12: hour12Str, minute: minuteStr, ampm };
}

function formatTime24(hour12Str, minuteStr, ampm) {
  let h12 = parseInt(hour12Str, 10);
  if (isNaN(h12)) h12 = 12;
  let h24 = h12 % 12;
  if (ampm === 'PM') h24 += 12;

  const h24Str = String(h24).padStart(2, '0');
  const minStr = String(minuteStr).padStart(2, '0');
  return `${h24Str}:${minStr}`;
}

export default function TimePicker({ value, onChange, className, disabled = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const hoursColRef = useRef(null);
  const minutesColRef = useRef(null);

  const { hour12, minute, ampm } = parseTime24(value);

  // Auto-scroll selected elements into view when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        if (hoursColRef.current) {
          const selectedHourEl = hoursColRef.current.querySelector(`.${styles.selectedOption}`);
          if (selectedHourEl) selectedHourEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        if (minutesColRef.current) {
          const selectedMinEl = minutesColRef.current.querySelector(`.${styles.selectedOption}`);
          if (selectedMinEl) selectedMinEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 50);
    }
  }, [open, hour12, minute]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handleHourSelect = (newHour) => {
    const new24 = formatTime24(newHour, minute, ampm);
    onChange(new24);
  };

  const handleMinuteSelect = (newMin) => {
    const new24 = formatTime24(hour12, newMin, ampm);
    onChange(new24);
  };

  const handleAmPmSelect = (newAmPm) => {
    const new24 = formatTime24(hour12, minute, newAmPm);
    onChange(new24);
  };

  const scrollColumn = (colRef, direction) => {
    if (colRef.current) {
      const scrollAmount = direction === 'up' ? -40 : 40;
      colRef.current.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    }
  };

  const displayString = `${hour12}:${minute} ${ampm}`;

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''} ${className || ''}`}
      >
        <span className={styles.triggerText}>{displayString}</span>
        <Clock size={16} className={styles.clockIcon} />
      </button>

      {open && (
        <div className={styles.dropdown}>
          {/* Top Blue Header Row showing active selection */}
          <div className={styles.headerRow}>
            <div className={styles.headerTile}>{hour12}</div>
            <div className={styles.headerTile}>{minute}</div>
            <div className={styles.headerTile}>{ampm}</div>
          </div>

          <div className={styles.divider} />

          {/* 3 Columns Section */}
          <div className={styles.columnsGrid}>
            {/* Hour Column */}
            <div className={styles.columnWrapper}>
              <button type="button" className={styles.arrowBtn} onClick={() => scrollColumn(hoursColRef, 'up')}>
                <ChevronUp size={10} />
              </button>
              <div className={styles.column} ref={hoursColRef}>
                {HOURS.map((h) => {
                  const isSelected = h === hour12;
                  return (
                    <div
                      key={h}
                      onClick={() => handleHourSelect(h)}
                      className={`${styles.option} ${isSelected ? styles.selectedOption : ''}`}
                    >
                      {h}
                    </div>
                  );
                })}
              </div>
              <button type="button" className={styles.arrowBtn} onClick={() => scrollColumn(hoursColRef, 'down')}>
                <ChevronDown size={10} />
              </button>
            </div>

            {/* Minute Column */}
            <div className={styles.columnWrapper}>
              <button type="button" className={styles.arrowBtn} onClick={() => scrollColumn(minutesColRef, 'up')}>
                <ChevronUp size={10} />
              </button>
              <div className={styles.column} ref={minutesColRef}>
                {MINUTES.map((m) => {
                  const isSelected = m === minute;
                  return (
                    <div
                      key={m}
                      onClick={() => handleMinuteSelect(m)}
                      className={`${styles.option} ${isSelected ? styles.selectedOption : ''}`}
                    >
                      {m}
                    </div>
                  );
                })}
              </div>
              <button type="button" className={styles.arrowBtn} onClick={() => scrollColumn(minutesColRef, 'down')}>
                <ChevronDown size={10} />
              </button>
            </div>

            {/* AM/PM Column */}
            <div className={styles.columnWrapper}>
              <div className={styles.arrowSpacer} />
              <div className={styles.column}>
                {AMPM_LIST.map((a) => {
                  const isSelected = a === ampm;
                  return (
                    <div
                      key={a}
                      onClick={() => handleAmPmSelect(a)}
                      className={`${styles.option} ${isSelected ? styles.selectedOption : ''}`}
                    >
                      {a}
                    </div>
                  );
                })}
              </div>
              <div className={styles.arrowSpacer} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
