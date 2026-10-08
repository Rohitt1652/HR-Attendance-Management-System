'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { getTodayMenu } from '@/api/cafeMenuApi';
import { placeOrder, getMyOrders, cancelOrder, getAllOrders, updateOrderStatus, collectCafePayment, submitPayment, deleteCafeOrder } from '@/api/cafeOrderApi';
import { ShoppingCart, ClipboardList, Clock, CheckCircle2, XCircle, CreditCard, Eye, UtensilsCrossed, Plus, Minus, RotateCcw, Trash2 } from 'lucide-react';
import styles from './BookLunchPage.module.css';

const ADMIN_ROLES = ['admin', 'hr', 'md'];

const STATUS_COLORS = {
  Pending:   { bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
  Confirmed: { bg: '#dbeafe', color: '#2563eb', border: '#bfdbfe' },
  Preparing: { bg: '#ede9fe', color: '#7c3aed', border: '#ddd6fe' },
  Ready:     { bg: '#d1fae5', color: '#059669', border: '#a7f3d0' },
  Delivered: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  Cancelled: { bg: '#fee2e2', color: '#dc2626', border: '#fecaca' },
};

const PAY_COLORS = {
  Unpaid:    { bg: '#fee2e2', color: '#dc2626' },
  Submitted: { bg: '#fef3c7', color: '#d97706' },
  Paid:      { bg: '#d1fae5', color: '#059669' },
  Refunded:  { bg: '#f1f5f9', color: '#64748b' },
};

const CAT_COLORS = {
  Lunch:      { from: '#6366f1', to: '#8b5cf6', emoji: '🍱' },
  Breakfast:  { from: '#f59e0b', to: '#f97316', emoji: '🌅' },
  Snacks:     { from: '#ec4899', to: '#f43f5e', emoji: '🍿' },
  Beverages:  { from: '#0ea5e9', to: '#06b6d4', emoji: '☕' },
  Dinner:     { from: '#8b5cf6', to: '#a855f7', emoji: '🌙' },
};

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const cssVars = (vars) => (node) => {
  if (!node) return;
  Object.entries(vars).forEach(([key, value]) => node.style.setProperty(key, value));
};

function VegDot({ isVeg }) {
  return (
    <span className={`lunch-veg-dot${isVeg ? ' lunch-veg-dot--veg' : ' lunch-veg-dot--nonveg'}`} />
  );
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
  return (
    <span
      className="lunch-status-badge"
      ref={cssVars({
        '--badge-bg': c.bg,
        '--badge-color': c.color,
        '--badge-border': c.border || c.bg,
      })}
    >
      {status}
    </span>
  );
}

function PayBadge({ status }) {
  const c = PAY_COLORS[status] || { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span
      className="lunch-pay-badge"
      ref={cssVars({
        '--badge-bg': c.bg,
        '--badge-color': c.color,
      })}
    >
      {status}
    </span>
  );
}

export default function BookLunchPage() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const [tab, setTab] = useState(isAdmin ? 'admin' : 'order');
  const [menu, setMenu] = useState(null);
  const [cart, setCart] = useState({});
  const [menuSearch, setMenuSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [myOrders, setMyOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [today, setToday] = useState('');
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [adminOrderDate, setAdminOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({ method: 'UPI', proofType: 'txn', ref: '', note: '', screenshot: '' });
  const [payProof, setPayProof] = useState(null);
  const [submittingPay, setSubmittingPay] = useState(false);

  // Fetch menu for the selected booking date
  const fetchMenuForDate = (date) => {
    setLoading(true);
    getTodayMenu(date)
      .then(r => { setMenu(r.data.data); setToday(r.data.today); })
      .catch(() => { setMenu(null); setToday(''); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMenuForDate(bookingDate);
    fetchMyOrders();
  }, []);

  // Re-fetch menu when booking date changes
  useEffect(() => {
    fetchMenuForDate(bookingDate);
  }, [bookingDate]);

  useEffect(() => {
    if (tab === 'myorders') fetchMyOrders();
    if (tab === 'admin' && isAdmin) fetchAllOrders();
  }, [tab, adminOrderDate]);

  const fetchMyOrders = () => getMyOrders().then(r => setMyOrders(r.data.data || [])).catch(() => {});
  const fetchAllOrders = () => getAllOrders(adminOrderDate ? { date: adminOrderDate } : {}).then(r => setAllOrders(r.data.data || [])).catch(() => {});

  const addToCart = (item) => {
    if (!item.isAvailable) return toast.error('Item not available');
    setCart(c => ({ ...c, [item._id]: { ...item, qty: (c[item._id]?.qty || 0) + 1 } }));
  };
  const removeFromCart = (id) => setCart(c => {
    const n = { ...c };
    if (n[id]?.qty > 1) n[id] = { ...n[id], qty: n[id].qty - 1 };
    else delete n[id];
    return n;
  });
  const clearCart = () => setCart({});

  const cartItems = Object.values(cart);
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);

  const handlePlaceOrder = async () => {
    if (!cartItems.length) return toast.error('Cart is empty');
    setPlacing(true);
    try {
      const items = cartItems.map(i => ({ menuItemId: i._id, name: i.name, category: i.category, price: i.price, quantity: i.qty, isVeg: i.isVeg }));
      await placeOrder({ items, notes, lunchDate: bookingDate });
      const dateLabel = new Date(bookingDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
      toast.success(`Lunch booked for ${dateLabel}!`);
      clearCart();
      setNotes('');
      setShowCart(false);
      setTab('myorders');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to place order');
    } finally { setPlacing(false); }
  };

  const handleCancel = async (id) => {
    if (!confirm('Cancel this order?')) return;
    try { await cancelOrder(id, 'Cancelled by user'); toast.success('Order cancelled'); fetchMyOrders(); }
    catch (e) { toast.error(e.response?.data?.message || 'Cannot cancel'); }
  };

  const handleSubmitPayment = async () => {
    if (!payForm.ref && !payForm.screenshot) return toast.error('Please enter transaction ID or upload screenshot');
    setSubmittingPay(true);
    try {
      await submitPayment(payModal.orderId, {
        paymentMethod: payForm.method,
        paymentRef: payForm.ref,
        paymentScreenshot: payForm.screenshot,
        paymentNote: payForm.note,
      });
      toast.success('Payment details submitted!');
      setPayModal(null);
      setPayForm({ method: 'UPI', proofType: 'txn', ref: '', note: '', screenshot: '' });
      fetchMyOrders();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to submit'); }
    finally { setSubmittingPay(false); }
  };

  const handleScreenshotUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error('Screenshot must be under 2MB');
    const reader = new FileReader();
    reader.onload = (ev) => setPayForm(f => ({ ...f, screenshot: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const handleStatusUpdate = async (id, status) => {
    try { await updateOrderStatus(id, status); toast.success('Status updated'); fetchAllOrders(); }
    catch { toast.error('Failed to update'); }
  };

  const handlePayment = async (id, method) => {
    try { await collectCafePayment(id, { paymentMethod: method }); toast.success('Payment recorded'); fetchAllOrders(); }
    catch { toast.error('Failed to record payment'); }
  };

  const handleDeleteOrder = async (order) => {
    const name = order.userId?.name || 'this employee';
    if (!confirm(`Permanently delete this order for ${name}? This cannot be undone.`)) return;
    try {
      await deleteCafeOrder(order._id);
      toast.success('Order deleted');
      fetchAllOrders();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to delete order');
    }
  };

  const grouped = {};
  (menu?.items || []).filter(i => i.isAvailable).forEach(i => {
    if (!grouped[i.category]) grouped[i.category] = [];
    grouped[i.category].push(i);
  });
  const hasMenu = Object.keys(grouped).length > 0;

  const todayDayName = today ? today : DAY_NAMES[new Date().getDay()];
  const adminDateLabel = adminOrderDate
    ? new Date(`${adminOrderDate}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    : 'All dates';

  const tabs = isAdmin
    ? [{ key: 'admin', label: 'All Orders' }]
    : [
        { key: 'order', label: "Today's Menu" },
        { key: 'myorders', label: 'My Orders' },
      ];

  // First available item as "special of the day"
  const allItems = (menu?.items || []).filter(i => i.isAvailable);
  const specialItem = allItems[0] || null;
  const serviceCharge = 0;

  return (
    <div className="lunch-page">

      {/* ── Page Header ── */}
      <div className="lunch-page-header">
        <div>
          <h1 className="lunch-page-title">{isAdmin ? 'Cafe Orders' : 'Book My Lunch'}</h1>
          <p className="lunch-page-subtitle">
            {isAdmin ? 'Manage all employee orders and payments' : new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {!isAdmin && (
          <div className="lunch-booking-card">
            <label className="lunch-booking-label">Booking Date</label>
            <input
              type="date"
              className="lunch-booking-input"
              value={bookingDate}
              min={new Date().toISOString().slice(0, 10)}
              max={(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })()}
              onChange={e => setBookingDate(e.target.value)}
            />
            <span className="lunch-booking-formatted">
              {new Date(bookingDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            {bookingDate !== new Date().toISOString().slice(0, 10) && (
              <span className="lunch-prebooking-chip">Pre-booking</span>
            )}
          </div>
        )}
      </div>

      {/* Floating cart */}
      {cartCount > 0 && (
        <div className="lunch-floating-cart">
          <p className="lunch-floating-cart__label">Cart Total</p>
          <p className="lunch-floating-cart__total">₹{cartTotal}</p>
          <button className="lunch-floating-cart__btn" onClick={() => { document.getElementById('current-order-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            🛒 View Cart ({cartCount})
          </button>
        </div>
      )}

      {/* ── Hero Banner (Special of the Day) ── */}
      {tab === 'order' && specialItem && (
        <div className="lunch-hero">
          <div className="lunch-hero__blob1" />
          <div className="lunch-hero__blob2" />
          <div className="lunch-hero__content">
            <span className="lunch-hero__badge">Special of the Day</span>
            <h2 className="lunch-hero__title">{specialItem.name}</h2>
            <p className="lunch-hero__desc">
              {specialItem.description || `Fresh ${specialItem.category} — available today only`}
            </p>
          </div>
          <div className="lunch-hero__price-wrap">
            <p className="lunch-hero__price-label">Starting from</p>
            <p className="lunch-hero__price">₹{specialItem.price}</p>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      {!isAdmin && (
        <div className="lunch-tabs">
          {tabs.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)} className={`lunch-tab-btn${tab === key ? ' lunch-tab-btn--active' : ''}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TODAY'S MENU TAB
      ══════════════════════════════════════════ */}
      {tab === 'order' && (
        <>
        {loading ? (
          <div className="text-muted lunch-menu-state">
            <div className="lunch-menu-state__icon">⏳</div>
            <p className="lunch-menu-state__text">Loading today&apos;s menu…</p>
          </div>
        ) : !hasMenu ? (
          <div className="bg-white rounded-2xl border-default lunch-menu-state">
            <p className="lunch-menu-state__empty-icon">🍽️</p>
            <p className="font-semibold text-body-clr lunch-menu-state__title">
              {bookingDate === new Date().toISOString().slice(0, 10)
                ? 'No menu available for today'
                : 'Menu not published yet for this date'}
            </p>
            <p className="text-muted lunch-menu-state__date">
              {today || new Date(bookingDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
            </p>
          </div>
        ) : (
          <div className="lunch-order-stack">

            {/* ── Search Bar (Toolbar) ── */}
            <div className="lunch-toolbar">
              <input value={menuSearch} onChange={e => setMenuSearch(e.target.value)} placeholder="Search menu items..."
                className="lunch-search" />
              {menuSearch && (
                <button onClick={() => setMenuSearch('')} className="lunch-search-clear">
                  ✕ Clear
                </button>
              )}
            </div>

            {/* ── Menu categories ── */}
            <div className="lunch-category-stack">
              {Object.entries(grouped).map(([cat, items]) => {
                const filteredItems = menuSearch ? items.filter(i => i.name.toLowerCase().includes(menuSearch.toLowerCase())) : items;
                if (filteredItems.length === 0) return null;
                const cc = CAT_COLORS[cat] || { from: '#6366f1', to: '#8b5cf6', emoji: '🍴' };
                return (
                  <div key={cat}>
                    {/* Category header */}
                    <div className="lunch-category-header">
                      <div className="lunch-category-title-wrap">
                        <div className="lunch-category-icon" ref={cssVars({ '--category-soft': `${cc.from}15` })}>{cc.emoji}</div>
                        <h3 className="lunch-category-title">{cat} Items</h3>
                      </div>
                      <div className="lunch-category-actions">
                        <button className="lunch-icon-button">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="9" y2="18"/></svg>
                        </button>
                        <button className="lunch-icon-button">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                        </button>
                      </div>
                    </div>

                    {/* Responsive card grid — ALL items, no add-ons panel */}
                    <div className="lunch-menu-grid">
                      {filteredItems.map(item => {
                        const qty = cart[item._id]?.qty || 0;
                        return (
                          <div key={item._id} className={`lunch-menu-card${qty > 0 ? ' lunch-menu-card--selected' : ''}`}>
                            {/* Image area */}
                            <div
                              className={`lunch-menu-card__media${item.imageUrl ? ' lunch-menu-card__media--photo' : ''}`}
                              ref={cssVars({
                                '--category-from-soft': `${cc.from}18`,
                                '--category-to-soft': `${cc.to}12`,
                              })}
                            >
                              {item.imageUrl
                                ? <img src={item.imageUrl} alt={item.name} className="lunch-menu-card__image" />
                                : (
                                  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="lunch-menu-card__placeholder">
                                    <ellipse cx="40" cy="52" rx="28" ry="8" fill={`${cc.from}30`} />
                                    <circle cx="40" cy="44" r="24" fill={`${cc.from}20`} stroke={`${cc.from}40`} strokeWidth="1.5" />
                                    <circle cx="40" cy="44" r="18" fill={`${cc.from}15`} />
                                    <ellipse cx="40" cy="44" rx="12" ry="7" fill={`${cc.to}50`} />
                                    <ellipse cx="40" cy="41" rx="10" ry="5" fill={`${cc.from}70`} />
                                    <path d="M33 28 Q34 24 33 20" stroke={`${cc.from}60`} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                                    <path d="M40 26 Q41 22 40 18" stroke={`${cc.from}60`} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                                    <path d="M47 28 Q48 24 47 20" stroke={`${cc.from}60`} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                                    <line x1="62" y1="28" x2="62" y2="48" stroke={`${cc.from}80`} strokeWidth="1.5" strokeLinecap="round"/>
                                    <line x1="60" y1="28" x2="60" y2="34" stroke={`${cc.from}80`} strokeWidth="1" strokeLinecap="round"/>
                                    <line x1="64" y1="28" x2="64" y2="34" stroke={`${cc.from}80`} strokeWidth="1" strokeLinecap="round"/>
                                  </svg>
                                )
                              }
                              <div className={`lunch-food-type${item.isVeg ? ' lunch-food-type--veg' : ' lunch-food-type--nonveg'}`}>
                                <span className={`lunch-food-type__dot${item.isVeg ? ' lunch-food-type__dot--veg' : ' lunch-food-type__dot--nonveg'}`} />
                                {item.isVeg ? 'VEG' : 'NON-VEG'}
                              </div>
                            </div>
                            <div className="lunch-menu-card__body">
                              <div className="lunch-menu-card__title-row">
                                <p className="lunch-menu-card__name">{item.name}</p>
                                <span className="lunch-menu-card__price">₹{item.price}</span>
                              </div>
                              {item.description && (
                                <p className="lunch-menu-card__description">
                                  {item.description}
                                </p>
                              )}
                              <div className="lunch-menu-card__footer">
                                {qty === 0 ? (
                                  <button onClick={() => addToCart(item)} className="lunch-add-item-btn">
                                    <Plus size={13} /> Add to Order
                                  </button>
                                ) : (
                                  <div className="lunch-qty-control">
                                    <button onClick={() => removeFromCart(item._id)} className="lunch-qty-btn lunch-qty-btn--minus">
                                      <Minus size={12} />
                                    </button>
                                    <span className="lunch-qty-value">{qty}</span>
                                    <button onClick={() => addToCart(item)} className="lunch-qty-btn lunch-qty-btn--plus">
                                      <Plus size={12} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Bottom: Current Order + Quick Re-order side by side ── */}
            <div className={styles.bottomGrid}>

              {/* Current Order */}
              <div id="current-order-section" className={styles.orderSectionCard}>
                <div className={styles.orderSectionHeader}>
                  <div className={styles.headerTitleGroup}>
                    <h3 className={styles.headerTitle}>Current Order</h3>
                    {cartCount > 0 && (
                      <span className={styles.badgeItems}>{cartCount} ITEMS</span>
                    )}
                  </div>
                  {cartCount > 0 && (
                    <button onClick={clearCart} className={styles.btnClearCart}>Clear all</button>
                  )}
                </div>

                {cartCount === 0 ? (
                  <div className={styles.emptyState}>
                    <ShoppingCart size={32} color="#e2e8f0" className={styles.emptyStateIcon} />
                    <p className={styles.emptyStateText}>Your order is empty</p>
                    <p className={styles.emptyStateSubtext}>Add items from the menu above</p>
                  </div>
                ) : (
                  <div className={styles.cartBody}>
                    {cartItems.map((item, idx) => (
                      <div key={item._id} className={styles.cartItemRow}>
                        <span className={styles.cartItemQty}>{item.qty}x</span>
                        <div className={styles.cartItemDetails}>
                          <p className={styles.cartItemName}>{item.name}</p>
                          <p className={styles.cartItemSubtext}>Regular Portion</p>
                        </div>
                        <span className={styles.cartItemPrice}>₹{item.price * item.qty}</span>
                      </div>
                    ))}

                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Special instructions…" rows={2}
                      className={styles.notesInput} />

                    <div className={styles.summaryContainer}>
                      <div className={styles.summaryRow}>
                        <span>Subtotal</span><span>₹{cartTotal}</span>
                      </div>
                      <div className={styles.summaryTotalRow}>
                        <span>Total</span><span className={styles.summaryTotalVal}>₹{cartTotal}</span>
                      </div>
                    </div>

                    {/* Booking date label */}
                    <div className="lunch-order-date">
                      <span className={styles.bookingDateCalendarIcon}>📅</span>
                      <span>
                        Booking for: {new Date(bookingDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>

                    <button onClick={handlePlaceOrder} disabled={placing} className="lunch-place-order-btn">
                      {placing ? 'Booking…' : <><span>Confirm & Book Lunch</span><span>→</span></>}
                    </button>
                    <p className={styles.bookingCloseLabel}>Booking closes at 11:30 AM</p>
                  </div>
                )}
              </div>

              {/* Quick Re-order */}
              <div className="bg-white rounded-2xl border-default overflow-hidden">
                <div className={`row-between ${styles.quickReorderHeader}`}>
                  <h3 className={`font-bold text-heading ${styles.quickReorderTitle}`}>Quick Re-order</h3>
                  <button onClick={() => setTab('myorders')} className={`btn-ghost-base cursor-pointer font-semibold ${styles.quickReorderBtn}`}>View Order History</button>
                </div>
                <div className={`d-flex-col ${styles.quickReorderBody}`}>
                  {myOrders.length === 0 ? (
                    <div className="text-muted" style={{ padding: '1.5rem', textAlign: 'center' }}>
                      <RotateCcw size={24} color="#e2e8f0" style={{ margin: '0 auto 8px', display: 'block' }} />
                      <p style={{ fontSize: '0.78rem', margin: 0 }}>No previous orders yet</p>
                    </div>
                  ) : myOrders.slice(0, 3).map((order, i) => (
                    <div key={order._id} className="row-center" style={{ gap: 10, padding: '0.625rem 0.875rem', background: '#f8fafc', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                      <div className="d-flex align-center justify-center flex-shrink-0" style={{ width: 32, height: 32, borderRadius: 8, background: '#eef2ff' }}>
                        <RotateCcw size={14} color="#6366f1" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-heading text-truncate" style={{ fontSize: '0.8rem', margin: 0 }}>
                          {order.items[0]?.name}{order.items.length > 1 ? ` +${order.items.length - 1} more` : ''}
                        </p>
                        <p className="text-muted" style={{ fontSize: '0.65rem', margin: 0 }}>
                          Last ordered {i === 0 ? '2 days ago' : i === 1 ? 'last Friday' : 'last week'}
                        </p>
                      </div>
                      <button onClick={() => {
                        order.items.forEach(oi => {
                          const menuItem = allItems.find(m => m._id === oi.menuItemId || m.name === oi.name);
                          if (menuItem) addToCart(menuItem);
                        });
                        toast.success('Items added to cart!');
                      }} className="d-flex align-center justify-center flex-shrink-0 cursor-pointer" style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid #6366f1', background: '#fff', color: '#6366f1' }}>
                        <Plus size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
        }
        </>
      )}

      {/* ══════════════════════════════════════════
          MY ORDERS TAB
      ══════════════════════════════════════════ */}
      {tab === 'myorders' && (
        <div className="lunch-orders-stack">
          {myOrders.length === 0 ? (
            <div className="lunch-empty-orders">
              <p className="lunch-empty-orders__icon">📋</p>
              <p className="lunch-empty-orders__title">No orders yet</p>
              <p className="lunch-empty-orders__text">Book your lunch from Today&apos;s Menu!</p>
            </div>
          ) : myOrders.map(order => {
            const sc = STATUS_COLORS[order.status] || {};
            return (
              <div key={order._id} className={styles.myOrderCard} style={{
                borderLeft: `4px solid ${sc.border || sc.color || '#e2e8f0'}`
              }}>
                <div className={styles.myOrderCardContent}>
                  {/* Top row */}
                  <div className={styles.myOrderTopRow}>
                    <div>
                      <p className={styles.myOrderDayTitle}>
                        {order.day || DAY_NAMES[new Date(order.createdAt).getDay()]}
                        <span className={styles.myOrderDateSpan}>
                          {new Date(order.lunchDate || order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </p>
                      <p className={styles.myOrderSubtext}>
                        {order.items.length} item{order.items.length !== 1 ? 's' : ''} · ₹{order.totalAmount}
                        {order.lunchDate && new Date(order.lunchDate).toDateString() !== new Date(order.createdAt).toDateString() && (
                          <span className={styles.prebookedSpan}>· Pre-booked</span>
                        )}
                      </p>
                    </div>
                    <div className={styles.myOrderBadgesGroup}>
                      <StatusBadge status={order.status} />
                      <PayBadge status={order.paymentStatus} />
                    </div>
                  </div>

                  {/* Items */}
                  <div className={styles.myOrderItemsBox}>
                    {order.items.map((item, i) => (
                      <div key={i} className={styles.myOrderItemRow}>
                        <span className={styles.myOrderItemName}>
                          <VegDot isVeg={item.isVeg} />
                          {item.name} <span className={styles.myOrderItemQty}>× {item.quantity}</span>
                        </span>
                        <span className={styles.myOrderItemPrice}>₹{item.price * item.quantity}</span>
                      </div>
                    ))}
                    {order.notes && (
                      <p className={styles.myOrderNotes}>
                        📝 {order.notes}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className={styles.myOrderActions}>
                    {['Pending', 'Confirmed'].includes(order.status) && (
                      <button onClick={() => handleCancel(order._id)} className={styles.btnCancelOrder}>
                        <XCircle size={13} /> Cancel
                      </button>
                    )}
                    {order.paymentStatus === 'Unpaid' && order.status !== 'Cancelled' && (
                      <button onClick={() => { setPayModal({ orderId: order._id, totalAmount: order.totalAmount }); setPayForm({ method: 'UPI', proofType: 'txn', ref: '', note: '', screenshot: '' }); }} className={styles.btnPayNow}>
                        <CreditCard size={13} /> Pay Now
                      </button>
                    )}
                    {order.paymentStatus === 'Submitted' && (
                      <span className={styles.statusVerificationText}>
                        <Clock size={13} /> Awaiting verification
                      </span>
                    )}
                    {order.paymentStatus === 'Paid' && (
                      <span className={styles.statusConfirmedText}>
                        <CheckCircle2 size={13} /> Payment confirmed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════
          ADMIN TAB
      ══════════════════════════════════════════ */}
      {tab === 'admin' && isAdmin && (
        <div className={styles.adminStack}>

          <div className={styles.adminFilterBar}>
            <div>
              <p className={styles.adminFilterLabel}>Showing orders for</p>
              <p className={styles.adminFilterValue}>{adminDateLabel}</p>
            </div>
            <div className={styles.adminFilterControls}>
              <input
                type="date"
                value={adminOrderDate}
                onChange={e => setAdminOrderDate(e.target.value)}
                className={styles.adminDateInput}
              />
              <button onClick={() => setAdminOrderDate(new Date().toISOString().slice(0, 10))}
                className={styles.btnToday}>
                Today
              </button>
              <button onClick={() => setAdminOrderDate('')}
                className={styles.btnAllDates}>
                All Dates
              </button>
            </div>
          </div>

          {/* Stat cards */}
          <div className={styles.adminStatsGrid}>
            {[
              { label: 'All Orders', val: allOrders.length, icon: <ClipboardList size={20} />, color: '#6366f1', bg: '#eef2ff' },
              { label: 'Pending', val: allOrders.filter(o => o.status === 'Pending').length, icon: <Clock size={20} />, color: '#d97706', bg: '#fef3c7' },
              { label: 'Paid', val: allOrders.filter(o => o.paymentStatus === 'Paid').length, icon: <CheckCircle2 size={20} />, color: '#059669', bg: '#d1fae5' },
              { label: 'Unpaid', val: allOrders.filter(o => o.paymentStatus === 'Unpaid' && o.status !== 'Cancelled').length, icon: <CreditCard size={20} />, color: '#dc2626', bg: '#fee2e2' },
            ].map(stat => (
              <div key={stat.label} className={styles.statCard}>
                <div className={styles.statIconBox} style={{ background: stat.bg, color: stat.color }}>
                  {stat.icon}
                </div>
                <div>
                  <p className={styles.statVal}>{stat.val}</p>
                  <p className={styles.statLabel}>{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Order list */}
          {allOrders.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '3rem', textAlign: 'center' }}>
              <p style={{ color: '#94a3b8' }}>No orders for {adminDateLabel}</p>
            </div>
          ) : allOrders.map(order => {
            const sc = STATUS_COLORS[order.status] || {};
            const name = order.userId?.name || 'Unknown';
            const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const bookedFor = new Date(order.lunchDate || order.createdAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
            const orderedAt = new Date(order.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            return (
              <div key={order._id} style={{
                background: '#fff', borderRadius: 14,
                border: '1px solid #e2e8f0',
                borderLeft: `4px solid ${sc.border || sc.color || '#e2e8f0'}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}>
                <div style={{ padding: '1rem 1.25rem' }}>
                  {/* Employee row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        color: '#fff', fontWeight: 800, fontSize: '0.875rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>{initials}</div>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', margin: 0 }}>
                          {name}
                          {order.userId?.employeeId && (
                            <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.78rem', marginLeft: 6 }}>({order.userId.employeeId})</span>
                          )}
                        </p>
                        <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {order.userId?.department && <span>{order.userId.department}</span>}
                          {order.userId?.department && <span>·</span>}
                          <Clock size={11} />
                          Ordered {orderedAt}
                        </p>
                        <p style={{ fontSize: '0.72rem', color: '#475569', margin: '3px 0 0', fontWeight: 700 }}>
                          For: {bookedFor}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <StatusBadge status={order.status} />
                      <PayBadge status={order.paymentStatus} />
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#6366f1' }}>₹{order.totalAmount}</span>
                    </div>
                  </div>

                  {/* Items */}
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.625rem 0.875rem', marginBottom: '0.75rem' }}>
                    {order.items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#374151', padding: '3px 0' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <VegDot isVeg={item.isVeg} />
                          {item.name} <span style={{ color: '#94a3b8' }}>× {item.quantity}</span>
                        </span>
                        <span style={{ fontWeight: 700 }}>₹{item.price * item.quantity}</span>
                      </div>
                    ))}
                  </div>

                  {/* Status pipeline buttons */}
                  {order.status !== 'Cancelled' && order.status !== 'Delivered' && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {order.status === 'Pending' && (
                        <button onClick={() => handleStatusUpdate(order._id, 'Confirmed')} style={{
                          padding: '0.375rem 0.875rem', borderRadius: 8, border: '1px solid #bfdbfe',
                          background: '#dbeafe', color: '#2563eb', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                        }}>Confirm</button>
                      )}
                      {order.status === 'Confirmed' && (
                        <button onClick={() => handleStatusUpdate(order._id, 'Preparing')} style={{
                          padding: '0.375rem 0.875rem', borderRadius: 8, border: '1px solid #ddd6fe',
                          background: '#ede9fe', color: '#7c3aed', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                        }}>Preparing</button>
                      )}
                      {order.status === 'Preparing' && (
                        <button onClick={() => handleStatusUpdate(order._id, 'Ready')} style={{
                          padding: '0.375rem 0.875rem', borderRadius: 8, border: '1px solid #a7f3d0',
                          background: '#d1fae5', color: '#059669', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                        }}>Mark Ready</button>
                      )}
                      {order.status === 'Ready' && (
                        <button onClick={() => handleStatusUpdate(order._id, 'Delivered')} style={{
                          padding: '0.375rem 0.875rem', borderRadius: 8, border: '1px solid #bbf7d0',
                          background: '#f0fdf4', color: '#16a34a', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                        }}>Delivered</button>
                      )}
                      {order.paymentStatus === 'Submitted' && (
                        <button onClick={() => setPayProof(order)} style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '0.375rem 0.875rem', borderRadius: 8, border: '1px solid #fde68a',
                          background: '#fef3c7', color: '#d97706', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                        }}>
                          <Eye size={13} /> View Proof
                        </button>
                      )}
                      {(order.paymentStatus === 'Unpaid' || order.paymentStatus === 'Submitted') && (
                        <>
                          <button onClick={() => handlePayment(order._id, 'Cash')} style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '0.375rem 0.875rem', borderRadius: 8, border: '1px solid #a7f3d0',
                            background: '#d1fae5', color: '#059669', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                          }}>
                            <CheckCircle2 size={13} /> Paid (Cash)
                          </button>
                          <button onClick={() => handlePayment(order._id, 'UPI')} style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '0.375rem 0.875rem', borderRadius: 8, border: '1px solid #ddd6fe',
                            background: '#ede9fe', color: '#7c3aed', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                          }}>
                            <CheckCircle2 size={13} /> Paid (UPI)
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                    <button onClick={() => handleDeleteOrder(order)} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '0.375rem 0.875rem', borderRadius: 8, border: '1px solid #fecaca',
                      background: '#fee2e2', color: '#dc2626', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                    }}>
                      <Trash2 size={13} /> Delete Order
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════
          PAYMENT SUBMISSION MODAL (Employee)
      ══════════════════════════════════════════ */}
      {payModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderTitleGroup}>
                <CreditCard size={18} color="#6366f1" />
                <h3 className={styles.modalTitle}>Submit Payment</h3>
              </div>
              <button onClick={() => setPayModal(null)} className={styles.modalCloseBtn}>✕</button>
            </div>

            {/* Amount box */}
            <div className={styles.amountBox}>
              <div>
                <p className={styles.amountLabel}>Amount to pay</p>
                <p className={styles.amountVal}>₹{payModal.totalAmount}</p>
              </div>
              <div style={{ fontSize: '2rem' }}>💰</div>
            </div>

            <div className={styles.formGroup}>
              {/* Payment method */}
              <div>
                <label className={styles.formLabel}>Payment Method</label>
                <select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}
                  className={styles.formSelect}>
                  <option value="UPI">📱 UPI</option>
                  <option value="Cash">💵 Cash</option>
                  <option value="Wallet">👛 Wallet</option>
                </select>
              </div>

              {payForm.method === 'UPI' && (
                <>
                  {/* Proof type toggle */}
                  <div>
                    <label className={styles.formLabel}>Payment Proof</label>
                    <div className={styles.proofToggleGroup}>
                      {[['txn', '🔢 Transaction ID'], ['screenshot', '📷 Screenshot']].map(([val, label]) => (
                        <button key={val} type="button"
                          onClick={() => setPayForm(f => ({ ...f, proofType: val, ref: '', screenshot: '' }))}
                          className={styles.proofToggleBtn}
                          style={{
                            fontWeight: (payForm.proofType || 'txn') === val ? 700 : 500,
                            background: (payForm.proofType || 'txn') === val ? '#6366f1' : 'transparent',
                            color: (payForm.proofType || 'txn') === val ? '#fff' : '#64748b',
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(payForm.proofType || 'txn') === 'txn' ? (
                    <div>
                      <label className={styles.formLabel}>UPI Transaction ID *</label>
                      <input value={payForm.ref ?? ''} onChange={e => setPayForm(f => ({ ...f, ref: e.target.value }))}
                        placeholder="e.g. 4234567890123456"
                        className={styles.formInput} />
                    </div>
                  ) : (
                    <div>
                      <label className={styles.formLabel}>Payment Screenshot *</label>
                      <input type="file" accept="image/*" onChange={handleScreenshotUpload}
                        className={styles.fileInput} />
                      {payForm.screenshot && (
                        <img src={payForm.screenshot} alt="preview" className={styles.screenshotPreview} />
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Note */}
              <div>
                <label className={styles.formLabel}>Note (optional)</label>
                <input value={payForm.note ?? ''} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Any additional info…"
                  className={styles.formInput} />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button onClick={() => setPayModal(null)} className={styles.btnModalCancel}>Cancel</button>
              <button onClick={handleSubmitPayment} disabled={submittingPay} className={styles.btnModalSubmit} style={{
                background: submittingPay ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                cursor: submittingPay ? 'not-allowed' : 'pointer',
                boxShadow: submittingPay ? 'none' : '0 4px 12px rgba(99,102,241,0.35)',
              }}>
                {submittingPay ? 'Submitting…' : 'Submit Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          PAYMENT PROOF VIEWER (Admin)
      ══════════════════════════════════════════ */}
      {payProof && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 300, padding: '1rem',
        }}>
          <div style={{
            background: '#fff', borderRadius: 20,
            padding: '1.75rem', maxWidth: 500, width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Eye size={18} color="#6366f1" />
                <h3 style={{ fontWeight: 800, fontSize: '1.05rem', color: '#1e293b', margin: 0 }}>Payment Proof</h3>
              </div>
              <button onClick={() => setPayProof(null)} style={{
                background: '#f1f5f9', border: 'none', borderRadius: '50%',
                width: 32, height: 32, cursor: 'pointer', color: '#64748b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', fontWeight: 700,
              }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {/* Info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Employee', value: payProof.userId?.name },
                  { label: 'Amount', value: `₹${payProof.totalAmount}`, valueColor: '#059669' },
                  { label: 'Method', value: payProof.paymentMethod || '—' },
                  { label: 'Transaction ID', value: payProof.paymentRef || '—', mono: true },
                ].map(({ label, value, valueColor, mono }) => (
                  <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '0.75rem' }}>
                    <p style={{ fontSize: '0.68rem', color: '#94a3b8', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
                    <p style={{
                      fontWeight: 700, fontSize: '0.85rem',
                      color: valueColor || '#1e293b',
                      margin: '4px 0 0',
                      wordBreak: 'break-all',
                      fontFamily: mono ? 'monospace' : 'inherit',
                    }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Note */}
              {payProof.paymentNote && (
                <div style={{ background: '#fffbeb', borderRadius: 10, padding: '0.75rem', border: '1px solid #fde68a' }}>
                  <p style={{ fontSize: '0.68rem', color: '#92400e', fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Note from employee</p>
                  <p style={{ fontSize: '0.85rem', color: '#1e293b', margin: '4px 0 0' }}>{payProof.paymentNote}</p>
                </div>
              )}

              {/* Screenshot */}
              {payProof.paymentScreenshot ? (
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Screenshot</p>
                  <img src={payProof.paymentScreenshot} alt="Payment screenshot" style={{
                    width: '100%', borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  }} />
                </div>
              ) : (
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '1.25rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', border: '1.5px dashed #e2e8f0' }}>
                  No screenshot uploaded
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button onClick={() => setPayProof(null)} style={{
                padding: '0.6rem 1.25rem', borderRadius: 10, border: '1.5px solid #e2e8f0',
                background: '#f8fafc', color: '#374151', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
              }}>Close</button>
              <button onClick={() => { handlePayment(payProof._id, payProof.paymentMethod || 'UPI'); setPayProof(null); }} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0.6rem 1.5rem', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(5,150,105,0.3)',
              }}>
                <CheckCircle2 size={15} /> Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
