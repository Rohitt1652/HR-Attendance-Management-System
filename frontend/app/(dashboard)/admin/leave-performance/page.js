'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getLeaveAnalytics, getAllLeaves } from '@/api/leaveApi';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell
} from 'recharts';
import {
  TrendingUp, Users, Calendar, AlertTriangle, CheckCircle, BarChart3, X,
  RotateCcw, Search, ChevronRight, HelpCircle, Coffee
} from 'lucide-react';
import {
  formatDays,
  formatHours,
  formatPercent,
  normalizeLeaveTypeName,
  getStatusTextLabel,
  getStatusSubLabel,
} from '@/utils/leaveAnalyticsHelpers';
import styles from "./page.module.css";

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

function StatCard({ icon: Icon, label, value, sub, color, bg, isWarning }) {
  return (
    <div className={`${styles.statCard} ${isWarning ? styles.warningCard : ''}`}>
      <div
        className={`${styles.statAccent} ${isWarning ? styles.warningAccent : ''}`}
        ref={(node) => {
          if (!node) return;
          if (!isWarning) node.style.setProperty("--statAccent-background", `linear-gradient(90deg, ${color}, ${color}80)`);
        }}
      />
      <div className={styles.statHeader}>
        <p className={styles.statLabel}>{label}</p>
        <div
          className={styles.statIcon}
          ref={(node) => {
            if (!node) return;
            node.style.setProperty("--statIcon-background", isWarning ? '#fef3c7' : (bg || `${color}15`));
          }}
        >
          <Icon size={17} color={isWarning ? '#d97706' : color} strokeWidth={2.5} />
        </div>
      </div>
      <p className={`${styles.statValue} ${isWarning ? styles.warningValue : ''}`}>{value}</p>
      {sub && <p className={styles.statSubtext}>{sub}</p>}
    </div>
  );
}

export default function LeavePerformancePage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Global Dashboard Filters
  const [year, setYear] = useState(new Date().getFullYear());
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('All');
  const [leaveModeFilter, setLeaveModeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('Approved'); // Default: Approved

  // Chart Metric Toggle: 'days' vs 'apps'
  const [chartMetric, setChartMetric] = useState('days');

  // Leaderboard Local Controls
  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [leaderboardSort, setLeaderboardSort] = useState('days'); // 'days' | 'unplanned' | 'apps'

  // Detail Modal
  const [detailModal, setDetailModal] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = async (overrideParams = {}) => {
    setLoading(true);
    try {
      const params = {
        year: overrideParams.year ?? year,
        department: overrideParams.department ?? departmentFilter,
        leaveType: overrideParams.leaveType ?? leaveTypeFilter,
        leaveMode: overrideParams.leaveMode ?? leaveModeFilter,
        status: overrideParams.status ?? statusFilter,
      };
      const res = await getLeaveAnalytics(params);
      setData(res.data.data);
    } catch {
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [year, departmentFilter, leaveTypeFilter, leaveModeFilter, statusFilter]);

  const handleResetFilters = () => {
    setYear(new Date().getFullYear());
    setDepartmentFilter('All');
    setLeaveTypeFilter('All');
    setLeaveModeFilter('All');
    setStatusFilter('Approved');
    setLeaderboardSearch('');
    setLeaderboardSort('days');
  };

  const openEmpLeaves = async (emp) => {
    setDetailLoading(true);
    setDetailModal({ emp, leaves: [] });
    try {
      const res = await getAllLeaves({
        employeeId: emp._id || emp.employeeId,
        limit: 200,
        sortBy: 'startDate',
        sortDir: 'desc'
      });
      const filtered = (res.data.data || []).filter((l) => {
        const d = new Date(l.startDate);
        const code = String(l.leaveTypeCode || '').toUpperCase();
        const matchesYear = d.getFullYear() === year;
        const matchesStatus = statusFilter === 'All' ? true : l.status === statusFilter;
        const matchesMode = leaveModeFilter === 'All' ? true : l.leaveMode === leaveModeFilter;
        const notWFH = !['WFH', 'WORKF', 'WORKFR'].includes(code);
        return matchesYear && matchesStatus && matchesMode && notWFH;
      });
      setDetailModal({ emp, leaves: filtered });
    } catch {
      toast.error('Failed to load employee leave log');
    } finally {
      setDetailLoading(false);
    }
  };

  // Monthly Chart Data (Days vs Apps)
  const monthlyChartData = useMemo(() => {
    if (!data?.monthly) return [];
    return data.monthly.map((m) => ({
      month: m.month,
      isFuture: m.isFuture,
      Planned: chartMetric === 'days' ? m.plannedDays : m.plannedApplications,
      Unplanned: chartMetric === 'days' ? m.unplannedDays : m.unplannedApplications,
      Total: chartMetric === 'days' ? m.totalDays : m.totalApplications,
    }));
  }, [data, chartMetric]);

  // Leaderboard Filtering & Sorting (Local to Utilization Card)
  const processedLeaderboard = useMemo(() => {
    if (!data?.leaderboard) return [];
    let list = [...data.leaderboard];

    if (leaderboardSearch.trim()) {
      const s = leaderboardSearch.trim().toLowerCase();
      list = list.filter((e) =>
        (e.name || '').toLowerCase().includes(s) ||
        (e.employeeId || '').toLowerCase().includes(s) ||
        (e.department || '').toLowerCase().includes(s)
      );
    }

    list.sort((a, b) => {
      if (leaderboardSort === 'unplanned') return b.unplannedDays - a.unplannedDays;
      if (leaderboardSort === 'apps') return b.totalApplications - a.totalApplications;
      return b.totalApprovedDays - a.totalApprovedDays;
    });

    return list;
  }, [data, leaderboardSearch, leaderboardSort]);

  // Options for Department Dropdown
  const departmentOptions = useMemo(() => {
    if (!data?.byDept) return [];
    const depts = data.byDept.map((d) => d.dept);
    return ['All', ...depts];
  }, [data]);

  // Options for Leave Type Dropdown
  const leaveTypeOptions = useMemo(() => {
    const set = new Set();
    data?.dayBasedTypes?.forEach((t) => set.add(t.type));
    data?.hourlyTypes?.forEach((t) => set.add(t.type));
    return ['All', ...Array.from(set)];
  }, [data]);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Leave Analytics</h1>
          <p className={styles.pageSubtitle}>Organization-wide leave utilization, trends, and planning insights</p>
        </div>
      </div>

      {/* Global Multi-Filter Bar */}
      <div className={styles.filterBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Year:</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={styles.filterSelect}>
            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Dept:</span>
          <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className={styles.filterSelect}>
            {departmentOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Type:</span>
          <select value={leaveTypeFilter} onChange={(e) => setLeaveTypeFilter(e.target.value)} className={styles.filterSelect}>
            {leaveTypeOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Mode:</span>
          <select value={leaveModeFilter} onChange={(e) => setLeaveModeFilter(e.target.value)} className={styles.filterSelect}>
            <option value="All">All Modes</option>
            <option value="Planned">Planned</option>
            <option value="Unplanned">Unplanned</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Status:</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={styles.filterSelect}>
            <option value="Approved">Approved</option>
            <option value="Pending">Pending</option>
            <option value="Rejected">Rejected</option>
            <option value="All">All Statuses</option>
          </select>
        </div>

        <button onClick={handleResetFilters} className={styles.resetBtn} title="Reset all filters to defaults">
          <RotateCcw size={13} /> Reset Filters
        </button>
      </div>

      {loading ? (
        <div className={styles.loadingState}>Loading analytics metrics...</div>
      ) : data && (
        <>
          {/* Reconciled KPI Cards */}
          <div className={styles.statsGrid}>
            <StatCard
              icon={Calendar}
              label={getStatusTextLabel(statusFilter)}
              value={formatDays(data.totalApprovedDays)}
              sub={getStatusSubLabel(statusFilter, data.totalDayApplications)}
              color="#6366f1"
            />
            <StatCard
              icon={AlertTriangle}
              label="Unplanned Leave Rate"
              value={formatPercent(data.unplannedApplicationRate)}
              sub={`${data.unplannedApplications} of ${data.totalApplications} applications`}
              color="#f59e0b"
              isWarning={data.unplannedApplicationRate > 25}
            />
            <StatCard
              icon={Users}
              label="Average Days / Employee"
              value={formatDays(data.avgDaysPerEmployee)}
              sub={`Based on ${data.totalActiveEmployees} active employees`}
              color="#0ea5e9"
            />
            <StatCard
              icon={TrendingUp}
              label="Highest Leave Category"
              value={data.highestCategory?.highestDays?.type || '—'}
              sub={
                data.highestCategory?.highestDays
                  ? `${data.highestCategory.highestDays.days} days (${data.highestCategory.highestDays.sharePercent}% share)`
                  : 'No day-based data'
              }
              color="#8b5cf6"
            />
          </div>

          {/* Monthly Trend Chart + Pie/Type summary */}
          <div className={styles.chartsGrid}>
            <div className={styles.chartPanel}>
              <div className={styles.chartHeader}>
                <div>
                  <h3 className={styles.panelTitle}>Monthly Leave Trend</h3>
                  <p className={styles.panelSubtitle}>
                    {chartMetric === 'days' ? 'Leave days' : 'Applications'} by month ({year})
                  </p>
                </div>
                <div className={styles.chartControls}>
                  <div className={styles.toggleGroup}>
                    <button
                      onClick={() => setChartMetric('days')}
                      className={`${styles.toggleBtn} ${chartMetric === 'days' ? styles.activeToggle : ''}`}
                    >
                      Days
                    </button>
                    <button
                      onClick={() => setChartMetric('apps')}
                      className={`${styles.toggleBtn} ${chartMetric === 'apps' ? styles.activeToggle : ''}`}
                    >
                      Applications
                    </button>
                  </div>
                  <div className={styles.legend}>
                    <div className={styles.legendItem}>
                      <div className={styles.plannedLegend} />
                      <span className={styles.legendLabel}>Planned</span>
                    </div>
                    <div className={styles.legendItemAlt}>
                      <div className={styles.unplannedLegend} />
                      <span className={styles.legendLabelAlt}>Unplanned</span>
                    </div>
                  </div>
                </div>
              </div>

              {monthlyChartData.length === 0 ? (
                <div className={styles.emptyCard}>No trend data for selected filters</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={monthlyChartData} barSize={10}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis
                      label={{
                        value: chartMetric === 'days' ? 'Leave Days' : 'Applications',
                        angle: -90,
                        position: 'insideLeft',
                        fontSize: 10,
                        fill: '#94a3b8'
                      }}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value, name, item) => [
                        `${value} ${chartMetric === 'days' ? 'days' : 'apps'}`,
                        name === 'Planned' ? 'Planned' : 'Unplanned'
                      ]}
                      labelFormatter={(label, items) => {
                        const isF = items?.[0]?.payload?.isFuture;
                        return `${label} ${year} ${isF ? '(Future Month)' : ''}`;
                      }}
                      contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}
                    />
                    <Bar dataKey="Planned" fill="#6366f1" radius={[4, 4, 0, 0]}>
                      {monthlyChartData.map((entry, index) => (
                        <Cell key={`cell-p-${index}`} fill={entry.isFuture ? '#c7d2fe' : '#6366f1'} />
                      ))}
                    </Bar>
                    <Bar dataKey="Unplanned" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                      {monthlyChartData.map((entry, index) => (
                        <Cell key={`cell-u-${index}`} fill={entry.isFuture ? '#fde68a' : '#f59e0b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Quick Type Share List */}
            <div className={styles.typePanel}>
              <h3 className={styles.typePanelTitle}>Day-based Type Share</h3>
              <div className={styles.typeList}>
                {data.dayBasedTypes?.slice(0, 7).map((d, i) => (
                  <div key={d.type} className={styles.typeRow}>
                    <div
                      className={styles.typeDot}
                      ref={(node) => {
                        if (!node) return;
                        node.style.setProperty("--typeDot-background", TYPE_COLORS[i % TYPE_COLORS.length]);
                      }}
                    />
                    <span className={styles.typeName}>{normalizeLeaveTypeName(d.type)}</span>
                    <div className={styles.typeTrack}>
                      <div
                        className={styles.typeProgress}
                        ref={(node) => {
                          if (!node) return;
                          node.style.setProperty("--typeProgress-width", `${d.sharePercent}%`);
                          node.style.setProperty("--typeProgress-background", TYPE_COLORS[i % TYPE_COLORS.length]);
                        }}
                      />
                    </div>
                    <span className={styles.typeDays}>{d.totalDays}d</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Department Breakdown + Employee Utilization Leaderboard */}
          <div className={styles.breakdownGrid}>
            {/* Department Breakdown Panel */}
            <div className={styles.departmentPanel}>
              <h3 className={styles.departmentTitle}>Department Breakdown</h3>
              <p className={styles.departmentSubtitle}>Primary comparison by average days per active employee</p>
              <div className={styles.departmentList}>
                {data.byDept?.length === 0 ? (
                  <div className={styles.emptyCard}>No department metrics match selected filters</div>
                ) : (
                  data.byDept?.map((d) => {
                    const maxAvg = data.byDept[0]?.avgDaysPerEmployee || 1;
                    const pct = maxAvg > 0 ? Math.round((d.avgDaysPerEmployee / maxAvg) * 100) : 0;
                    return (
                      <div key={d.dept} style={{ marginBottom: '0.625rem' }}>
                        <div className={styles.departmentRowHeader}>
                          <div>
                            <span className={styles.departmentName}>{d.dept}</span>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '6px' }}>
                              ({d.activeEmployees} active)
                            </span>
                          </div>
                          <div className={styles.departmentMetrics}>
                            <span className={styles.departmentDays}>{d.avgDaysPerEmployee}d / emp</span>
                            <span className={styles.departmentCount}>({d.approvedDays}d total)</span>
                            {d.unplannedApplicationRate > 25 && (
                              <span className={styles.unplannedBadge}>
                                {d.unplannedApplicationRate}% of apps unplanned
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={styles.departmentTrack}>
                          <div
                            className={styles.departmentProgress}
                            ref={(node) => {
                              if (!node) return;
                              node.style.setProperty("--departmentProgress-width", `${pct}%`);
                              node.style.setProperty("--departmentProgress-background", `linear-gradient(90deg, #6366f1, #8b5cf6)`);
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Employee Leave Utilization Leaderboard */}
            <div className={styles.topTakersPanel}>
              <div className={styles.leaderboardHeader}>
                <div>
                  <h3 className={styles.topTakersTitle}>Employee Leave Utilization</h3>
                  <p className={styles.topTakersSubtitle}>Itemized leave breakdown per employee</p>
                </div>
                <div className={styles.leaderboardControls}>
                  <input
                    type="text"
                    placeholder="Search name/ID..."
                    value={leaderboardSearch}
                    onChange={(e) => setLeaderboardSearch(e.target.value)}
                    className={styles.filterInput}
                    style={{ minWidth: '130px', padding: '0.3rem 0.5rem' }}
                  />
                  <select
                    value={leaderboardSort}
                    onChange={(e) => setLeaderboardSort(e.target.value)}
                    className={styles.sortSelect}
                  >
                    <option value="days">Sort by Days</option>
                    <option value="unplanned">Sort by Unplanned</option>
                    <option value="apps">Sort by Applications</option>
                  </select>
                </div>
              </div>

              <div className={styles.topTakersList}>
                {processedLeaderboard.length === 0 ? (
                  <div className={styles.emptyCard}>No employees match local search</div>
                ) : (
                  processedLeaderboard.slice(0, 10).map((emp, i) => (
                    <div
                      key={emp._id || i}
                      onClick={() => openEmpLeaves(emp)}
                      className={styles.topTakerRow}
                      ref={(node) => {
                        if (!node) return;
                        node.style.setProperty("--topTakerRow-background", i === 0 ? '#faf5ff' : 'transparent');
                      }}
                    >
                      <span
                        className={styles.rank}
                        ref={(node) => {
                          if (!node) return;
                          node.style.setProperty("--rank-color", i < 3 ? ['#f59e0b', '#94a3b8', '#cd7c2f'][i] : '#cbd5e1');
                        }}
                      >
                        #{i + 1}
                      </span>
                      <div className={styles.avatar}>
                        {emp.profilePhotoUrl ? (
                          <img
                            src={emp.profilePhotoUrl}
                            alt=""
                            className={styles.avatarImage}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div
                          className={styles.avatarFallback}
                          style={{ display: emp.profilePhotoUrl ? 'none' : 'flex' }}
                        >
                          {emp.name?.[0]?.toUpperCase() || '?'}
                        </div>
                      </div>
                      <div className={styles.employeeIdentity}>
                        <p className={styles.employeeName}>{emp.name}</p>
                        <p className={styles.employeeDepartment}>{emp.department}</p>
                      </div>
                      <div className={styles.employeeTotals}>
                        <p className={styles.employeeDays}>{emp.totalApprovedDays} days</p>
                        {emp.unplannedDays > 0 && (
                          <p className={styles.employeeUnplanned}>{emp.unplannedDays} unplanned days</p>
                        )}
                      </div>
                      <ChevronRight size={16} className={styles.rowChevron} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Dual Summary Cards */}
          <div className={styles.dualTablesGrid}>
            {/* Day-based Leave Summary Table */}
            <div className={styles.summaryPanel}>
              <h3 className={styles.summaryTitle}>Day-based Leave Summary</h3>
              <div className={styles.tableScroll}>
                <table className={styles.summaryTable}>
                  <thead>
                    <tr className={styles.tableHeaderRow}>
                      <th className={styles.tableHeader}>Leave Type</th>
                      <th className={styles.tableHeader}>Approved Apps</th>
                      <th className={styles.tableHeader}>Total Days</th>
                      <th className={styles.tableHeader}>Avg Days/App</th>
                      <th className={styles.tableHeader}>
                        <span className={styles.headerTooltip} title="Share of total day-based leaves">
                          Share % <HelpCircle size={12} />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dayBasedTypes?.map((t, i) => (
                      <tr key={t.type} className={styles.tableRow}>
                        <td className={styles.typeCell}>
                          <div className={styles.typeCellContent}>
                            <div
                              className={styles.tableTypeDot}
                              ref={(node) => {
                                if (!node) return;
                                node.style.setProperty("--tableTypeDot-background", TYPE_COLORS[i % TYPE_COLORS.length]);
                              }}
                            />
                            <span className={styles.tableTypeName}>{normalizeLeaveTypeName(t.type)}</span>
                          </div>
                        </td>
                        <td className={styles.countCell}>{t.applications} apps</td>
                        <td className={styles.daysCell}>{formatDays(t.totalDays)}</td>
                        <td className={styles.averageCell}>{t.avgDaysPerApp} days</td>
                        <td className={styles.shareCell}>
                          <div className={styles.shareContent}>
                            <div className={styles.shareTrack}>
                              <div
                                className={styles.shareProgress}
                                ref={(node) => {
                                  if (!node) return;
                                  node.style.setProperty("--shareProgress-width", `${t.sharePercent}%`);
                                  node.style.setProperty("--shareProgress-background", TYPE_COLORS[i % TYPE_COLORS.length]);
                                }}
                              />
                            </div>
                            <span className={styles.shareValue}>{t.sharePercent}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hourly Leave Summary Card */}
            <div className={styles.summaryPanel}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Coffee size={18} color="#f97316" />
                <h3 className={styles.summaryTitle} style={{ margin: 0 }}>Hourly Leave Summary</h3>
              </div>
              {data.hourlyTypes?.length === 0 ? (
                <div className={styles.emptyCard}>No hourly short leaves recorded</div>
              ) : (
                <div className={styles.tableScroll}>
                  <table className={styles.summaryTable}>
                    <thead>
                      <tr className={styles.tableHeaderRow}>
                        <th className={styles.tableHeader}>Type</th>
                        <th className={styles.tableHeader}>Apps</th>
                        <th className={styles.tableHeader}>Total Hours</th>
                        <th className={styles.tableHeader}>Equivalent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.hourlyTypes?.map((ht) => (
                        <tr key={ht.type} className={styles.tableRow}>
                          <td className={styles.typeCell}>
                            <span className={styles.tableTypeName}>{normalizeLeaveTypeName(ht.type)}</span>
                          </td>
                          <td className={styles.countCell}>{ht.applications} apps</td>
                          <td className={styles.daysCell} style={{ color: '#f97316' }}>{formatHours(ht.totalHours)}</td>
                          <td className={styles.averageCell}>
                            {ht.equivalentDays !== null
                              ? `~${ht.equivalentDays} days (@ ${data.fullDayRequiredHours}h/day)`
                              : 'Excluded from day-based share'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Employee Leave Detail Modal */}
      {detailModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalIdentity}>
                <div className={styles.modalAvatar}>
                  {detailModal.emp.profilePhotoUrl ? (
                    <img
                      src={detailModal.emp.profilePhotoUrl}
                      alt=""
                      className={styles.modalAvatarImage}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className={styles.avatarFallback}
                    style={{ display: detailModal.emp.profilePhotoUrl ? 'none' : 'flex' }}
                  >
                    {detailModal.emp.name?.[0]?.toUpperCase() || '?'}
                  </div>
                </div>
                <div>
                  <p className={styles.modalEmployeeName}>{detailModal.emp.name}</p>
                  <p className={styles.modalEmployeeMeta}>
                    {detailModal.emp.department} · {year} Itemized Log ({statusFilter})
                  </p>
                </div>
              </div>
              <button onClick={() => setDetailModal(null)} className={styles.modalClose}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalSummary}>
              <div>
                <p className={styles.summaryMetricLabel}>Total Approved Days</p>
                <p className={styles.summaryDaysValue}>{formatDays(detailModal.emp.totalApprovedDays || detailModal.emp.days || 0)}</p>
              </div>
              <div>
                <p className={styles.summaryApplicationsLabel}>Applications</p>
                <p className={styles.summaryApplicationsValue}>{detailModal.emp.totalApplications || detailModal.emp.count || 0}</p>
              </div>
              <div>
                <p className={styles.summaryUnplannedLabel}>Unplanned Days</p>
                <p className={styles.summaryUnplannedValue}>{formatDays(detailModal.emp.unplannedDays || detailModal.emp.unplanned || 0)}</p>
              </div>
            </div>

            <div className={styles.modalBody}>
              {detailLoading ? (
                <div className={styles.modalLoading}>Loading employee leave records...</div>
              ) : detailModal.leaves.length === 0 ? (
                <div className={styles.modalEmpty}>No leave records match filters for {year}</div>
              ) : (
                detailModal.leaves.map((l, i) => (
                  <div key={l._id || i} className={styles.leaveRow}>
                    <div className={styles.leaveDetails}>
                      <div className={styles.leaveHeading}>
                        <span className={styles.leaveType}>{normalizeLeaveTypeName(l.leaveType)}</span>
                        <span
                          className={styles.leaveModeBadge}
                          ref={(node) => {
                            if (!node) return;
                            node.style.setProperty("--leaveModeBadge-background", l.leaveMode === 'Unplanned' ? '#fef3c7' : '#eff6ff');
                            node.style.setProperty("--leaveModeBadge-color", l.leaveMode === 'Unplanned' ? '#92400e' : '#1d4ed8');
                          }}
                        >
                          {l.leaveMode || 'Planned'}
                        </span>
                        <span
                          className={styles.leaveStatusBadge}
                          ref={(node) => {
                            if (!node) return;
                            node.style.setProperty("--leaveStatusBadge-background", l.status === 'Approved' ? '#dcfce7' : l.status === 'Rejected' ? '#fee2e2' : '#fef9c3');
                            node.style.setProperty("--leaveStatusBadge-color", l.status === 'Approved' ? '#166534' : l.status === 'Rejected' ? '#991b1b' : '#854d0e');
                          }}
                        >
                          {l.status}
                        </span>
                      </div>
                      <p className={styles.leaveDescription}>
                        {new Date(l.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        {l.endDate && l.startDate !== l.endDate ? ` – ${new Date(l.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                        {l.reason ? ` · ${l.reason.slice(0, 60)}${l.reason.length > 60 ? '...' : ''}` : ''}
                      </p>
                    </div>
                    <div className={styles.leaveDuration}>
                      <p className={styles.leaveDurationValue}>
                        {l.durationType === 'hourly' ? formatHours(l.totalHours || l.durationHours || 2) : formatDays(l.totalDays || (l.durationType === 'half_day' ? 0.5 : 1))}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className={styles.modalFooter}>
              <button onClick={() => setDetailModal(null)} className={styles.modalCloseButton}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
