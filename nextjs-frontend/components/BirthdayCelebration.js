'use client';
import { useEffect, useState, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import styles from './BirthdayCelebration.module.css';

export default function BirthdayCelebration({ user, onComplete }) {
  const [fadingOut, setFadingOut] = useState(false);

  // Extract first name dynamically (never hardcoded)
  const firstName = useMemo(() => {
    if (!user?.name) return 'Friend';
    return user.name.trim().split(' ')[0];
  }, [user]);

  // Handle auto-fadeout timer
  useEffect(() => {
    // Start fading out after 4.8 seconds
    const fadeTimer = setTimeout(() => {
      setFadingOut(true);
    }, 4800);

    // Call onComplete after full 5.5 seconds
    const completeTimer = setTimeout(() => {
      if (onComplete) onComplete();
    }, 5500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  // Preset Balloon Configurations (6-10 vector balloons, soft pastel shades, varied speeds & positions)
  const balloons = [
    { id: 1, left: '8vw', size: 44, color: '#a855f7', duration: '6.2s', delay: '0s', drift: '-20px' },
    { id: 2, left: '22vw', size: 36, color: '#818cf8', duration: '5.8s', delay: '0.4s', drift: '30px' },
    { id: 3, left: '38vw', size: 48, color: '#38bdf8', duration: '6.5s', delay: '0.2s', drift: '-15px' },
    { id: 4, left: '54vw', size: 40, color: '#facc15', duration: '5.6s', delay: '0.7s', drift: '25px' },
    { id: 5, left: '70vw', size: 46, color: '#f472b6', duration: '6.4s', delay: '0.1s', drift: '-35px' },
    { id: 6, left: '86vw', size: 38, color: '#c084fc', duration: '6.0s', delay: '0.5s', drift: '20px' },
    { id: 7, left: '46vw', size: 42, color: '#34d399', duration: '6.8s', delay: '1.0s', drift: '-10px' },
  ];

  // Preset Light Confetti Particles (20-30 particles, CSS transforms)
  const confettiParticles = useMemo(() => {
    const colors = ['#a855f7', '#818cf8', '#38bdf8', '#facc15', '#f472b6', '#34d399', '#fb923c'];
    const shapes = ['rect', 'circle', 'strip'];
    return Array.from({ length: 26 }, (_, i) => {
      const color = colors[i % colors.length];
      const shape = shapes[i % shapes.length];
      const left = `${(i * 3.7 + 3) % 94}vw`;
      const delay = `${(i * 0.14) % 1.5}s`;
      const duration = `${3.8 + (i % 5) * 0.3}s`;
      const rotate = `${(i * 47) % 360}deg`;
      return { id: i, color, shape, left, delay, duration, rotate };
    });
  }, []);

  // Preset Spark Bursts (3 subtle corner/edge vector bursts)
  const sparkBursts = [
    { id: 1, top: '15%', left: '12%', delay: '0.8s' },
    { id: 2, top: '22%', right: '14%', delay: '2.0s' },
    { id: 3, bottom: '25%', right: '18%', delay: '3.2s' },
  ];

  return (
    <div
      className={`${styles.celebrationLayer} ${fadingOut ? styles.layerFadeOut : ''}`}
      aria-live="polite"
      aria-label={`Happy Birthday ${firstName}`}
    >
      {/* LAYER 1: FLOATING BALLOONS */}
      <div className={styles.balloonLayer} aria-hidden="true">
        {balloons.map((b) => (
          <div
            key={b.id}
            className={styles.balloonWrapper}
            style={{
              left: b.left,
              animationDuration: b.duration,
              animationDelay: b.delay,
              '--drift-x': b.drift,
            }}
          >
            <svg
              width={b.size}
              height={b.size * 1.3}
              viewBox="0 0 40 52"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className={styles.balloonSvg}
            >
              {/* Balloon Body */}
              <ellipse cx="20" cy="22" rx="18" ry="21" fill={b.color} opacity="0.88" />
              {/* Highlight */}
              <ellipse cx="14" cy="14" rx="5" ry="7" fill="#ffffff" opacity="0.35" />
              {/* Knot */}
              <polygon points="17,43 23,43 20,46" fill={b.color} opacity="0.95" />
              {/* String */}
              <path d="M20 46 C18 49 22 51 20 54" stroke={b.color} strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
            </svg>
          </div>
        ))}
      </div>

      {/* LAYER 2: LIGHT CONFETTI */}
      <div className={styles.confettiLayer} aria-hidden="true">
        {confettiParticles.map((c) => (
          <div
            key={c.id}
            className={`${styles.confettiParticle} ${styles[c.shape]}`}
            style={{
              left: c.left,
              backgroundColor: c.color,
              animationDelay: c.delay,
              animationDuration: c.duration,
              '--start-rotate': c.rotate,
            }}
          />
        ))}
      </div>

      {/* LAYER 3: SPARK / CELEBRATION BURSTS */}
      <div className={styles.sparkLayer} aria-hidden="true">
        {sparkBursts.map((s) => (
          <div
            key={s.id}
            className={styles.sparkBurst}
            style={{
              top: s.top,
              left: s.left,
              right: s.right,
              bottom: s.bottom,
              animationDelay: s.delay,
            }}
          >
            <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
              <circle cx="30" cy="30" r="4" fill="#a855f7" />
              <line x1="30" y1="12" x2="30" y2="4" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" />
              <line x1="30" y1="48" x2="30" y2="56" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="30" x2="4" y2="30" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" />
              <line x1="48" y1="30" x2="56" y2="30" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" />
              <line x1="17" y1="17" x2="11" y2="11" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
              <line x1="43" y1="43" x2="49" y2="49" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
              <line x1="43" y1="17" x2="49" y2="11" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
              <line x1="17" y1="43" x2="11" y2="49" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        ))}
      </div>

      {/* CENTERED PERSONAL BIRTHDAY MESSAGE CARD */}
      <div className={styles.messageCardWrapper}>
        <div className={styles.messageCard}>
          <div className={styles.iconWrap}>
            <Sparkles size={24} color="#8b5cf6" />
          </div>
          <h1 className={styles.greetingTitle}>Happy Birthday, {firstName}! 🎉</h1>
          <p className={styles.greetingSubtitle}>
            Wishing you happiness, success, and a fantastic year ahead!
          </p>
        </div>
      </div>
    </div>
  );
}
