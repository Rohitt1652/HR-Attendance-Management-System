'use client';
import { useEffect, useState } from 'react';
import { X, Sparkles, Gift, PartyPopper } from 'lucide-react';
import styles from './BirthdayModal.module.css';

export default function BirthdayModal({ people, onClose, onWishAll }) {
  const [visible, setVisible] = useState(false);
  const [isWishing, setIsWishing] = useState(false);
  const [wishError, setWishError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    if (isWishing) return;
    setVisible(false);
    setTimeout(onClose, 300);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isWishing) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isWishing]);

  const handleWish = async () => {
    if (isWishing) return;
    setIsWishing(true);
    setWishError('');
    try {
      if (onWishAll) {
        await onWishAll();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      setVisible(false);
      setTimeout(onClose, 300);
    } catch (err) {
      console.error('[BirthdayModal] Wish failed:', err);
      setWishError(err?.message || 'Failed to send wishes. Please try again.');
      setIsWishing(false);
    }
  };

  if (!people?.length) return null;

  const singleFirstName = people.length === 1 && people[0]?.name ? people[0].name.trim().split(' ')[0] : '';
  const buttonLabel = isWishing
    ? 'Sending Wishes...'
    : people.length === 1
    ? `Wish ${singleFirstName}`
    : 'Wish Them All';

  return (
    <div className={`${styles.backdrop} ${visible ? styles.visible : ''}`} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        {/* Top Hero Banner with Direct Image Asset */}
        <div className={styles.heroBanner}>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleClose}
            aria-label="Close modal"
            disabled={isWishing}
          >
            <X size={16} />
          </button>
          <img
            src="/birthday-celebration-banner.png"
            alt="Birthday Celebration Artwork"
            className={styles.bannerImage}
          />
        </div>

        {/* Modal Content Body */}
        <div className={styles.modalBody}>
          <h2 className={styles.title}>
            <span>{people.length > 1 ? "Today's Birthdays!" : "Today's Birthday!"}</span>
            <Sparkles size={20} className={styles.titleIcon} />
          </h2>
          <p className={styles.subtitle}>Let&apos;s celebrate with our team!</p>

          {wishError && <div className={styles.errorMessage}>{wishError}</div>}

          <div className={styles.peopleList}>
            {people.map((p, index) => {
              const initials = p.name
                ? p.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
                : 'E';

              const avatarGradients = [
                'linear-gradient(135deg, #8b5cf6, #6366f1)',
                'linear-gradient(135deg, #06b6d4, #0891b2)',
                'linear-gradient(135deg, #a855f7, #7c3aed)',
                'linear-gradient(135deg, #ec4899, #d946ef)',
              ];
              const gradient = avatarGradients[index % avatarGradients.length];

              return (
                <div key={p._id || p.name || index} className={styles.personRow}>
                  <div className={styles.avatar}>
                    {p.profilePhotoUrl ? (
                      <img
                        src={p.profilePhotoUrl}
                        alt={p.name}
                        className={styles.avatarImage}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      className={styles.avatarInitials}
                      style={{
                        display: p.profilePhotoUrl ? 'none' : 'flex',
                        background: gradient,
                      }}
                    >
                      {initials}
                    </div>
                  </div>

                  <div className={styles.personInfo}>
                    <p className={styles.name}>{p.name}</p>
                    <p className={styles.designation}>
                      {p.designation || p.department || 'Team Member'}
                    </p>
                  </div>

                  <div className={styles.rowIconBadge} aria-hidden="true">
                    <Gift size={18} className={styles.rowIcon} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.actionsGroup}>
            <button
              type="button"
              onClick={handleWish}
              className={styles.primaryButton}
              disabled={isWishing}
            >
              <PartyPopper size={18} className={styles.buttonIcon} />
              <span>{buttonLabel}</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              className={styles.secondaryButton}
              disabled={isWishing}
            >
              Not Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
