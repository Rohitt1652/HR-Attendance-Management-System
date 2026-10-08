'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { acceptPolicy } from '@/api/policyApi';
import { policyHasFile, isPdfPolicy, policyFileUrl } from '@/utils/policyFile';
import { ClipboardList, CheckCircle2, ExternalLink, X } from 'lucide-react';
import styles from './PolicyAcceptanceModal.module.css';

export default function PolicyAcceptanceModal({ policies, onComplete, onClose }) {
  const [visible, setVisible] = useState(false);
  const [activeId, setActiveId] = useState(policies[0]?._id || null);
  const [agreed, setAgreed] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [remaining, setRemaining] = useState(policies);

  useEffect(() => {
    setRemaining(policies);
    if (policies.length > 0 && !activeId) {
      setActiveId(policies[0]._id);
    }
  }, [policies]);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const activePolicy = remaining.find((p) => p._id === activeId) || remaining[0];
  const activeFileUrl = activePolicy ? policyFileUrl(activePolicy) : null;
  const activeHasFile = activePolicy ? policyHasFile(activePolicy) : false;

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => onClose?.(), 300);
  };

  const handleAccept = async () => {
    if (!activePolicy) return;
    if (!agreed) return toast.error('Please confirm you have read and accept this policy');
    setAccepting(true);
    try {
      await acceptPolicy(activePolicy._id);
      toast.success('Policy accepted');
      const next = remaining.filter((p) => p._id !== activePolicy._id);
      setRemaining(next);
      setAgreed(false);
      if (next.length === 0) {
        setVisible(false);
        setTimeout(onComplete, 300);
      } else {
        setActiveId(next[0]._id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to accept policy');
    } finally {
      setAccepting(false);
    }
  };

  if (!remaining.length) return null;

  return (
    <div className={`${styles.backdrop} ${visible ? styles.visible : ''}`}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.headerIcon}>
              <ClipboardList size={22} color="#4f46e5" />
            </div>
            <div>
              <h2 className={styles.title}>Policy acknowledgment required</h2>
              <p className={styles.subtitle}>
                Please review and accept {remaining.length} company {remaining.length === 1 ? 'policy' : 'policies'} to continue.
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleDismiss}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.layout}>
          <div className={styles.sidebar}>
            {remaining.map((policy) => (
              <button
                key={policy._id}
                type="button"
                className={`${styles.policyTab} ${policy._id === activeId ? styles.policyTabActive : ''}`}
                onClick={() => { setActiveId(policy._id); setAgreed(false); }}
              >
                <span className={styles.policyTabTitle}>{policy.title}</span>
                <span className={styles.policyTabMeta}>{policy.category}</span>
              </button>
            ))}
          </div>

          {activePolicy && (
            <div className={styles.content}>
              <div className={styles.contentHeader}>
                <h3 className={styles.policyTitle}>{activePolicy.title}</h3>
                {activeHasFile && activeFileUrl && (
                  <a
                    href={activeFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.openLink}
                  >
                    <ExternalLink size={14} /> Open attachment
                  </a>
                )}
              </div>

              {activePolicy.content && (
                <div className={styles.policyText}>{activePolicy.content}</div>
              )}

              {activeHasFile && isPdfPolicy(activePolicy) && activeFileUrl && (
                <iframe
                  title={`${activePolicy.title} attachment`}
                  src={activeFileUrl}
                  className={styles.pdfFrame}
                />
              )}

              {activePolicy.fileUrl && !activeHasFile && (
                <p className={styles.missingFileHint}>
                  The policy file is missing on the server. Use Open attachment or contact HR to re-upload the document.
                </p>
              )}

              {!activePolicy.content && !activeHasFile && !activePolicy.fileUrl && (
                <p className={styles.emptyHint}>No policy content available. Contact HR for details.</p>
              )}

              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>I have read and accept this policy</span>
              </label>

              <button
                type="button"
                className={styles.acceptButton}
                onClick={handleAccept}
                disabled={accepting || !agreed}
              >
                <CheckCircle2 size={16} />
                {accepting ? 'Saving...' : remaining.length > 1 ? 'Accept & continue' : 'Accept policy'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
