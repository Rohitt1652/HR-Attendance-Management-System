'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getTeamMembers } from '@/api/employeeApi';
import { Mail, Phone, Building2, Search, Crown, UsersRound, ShieldCheck } from 'lucide-react';
import styles from './TeamPage.module.css';

const ROLE_COLORS = {
  admin: '#6366f1', md: '#8b5cf6', hr: '#0ea5e9',
  team_lead: '#f59e0b', employee: '#22c55e',
};

const ROLE_LABELS = {
  admin: 'Administrator', md: 'Managing Director', hr: 'HR Manager',
  team_lead: 'Team Lead', employee: 'Employee',
};

const ROLE_RANK = { md: 0, admin: 1, hr: 2, team_lead: 3, employee: 4 };

function Avatar({ emp, size = 52 }) {
  const color = ROLE_COLORS[emp.role] || '#6366f1';
  const [imgError, setImgError] = useState(false);
  const hasPhoto = emp.profilePhotoUrl && !imgError;
  return (
    <div className={styles.avatar} style={{
      width: size, height: size,
      background: hasPhoto ? '#f8fafc' : `linear-gradient(135deg, ${color}30, ${color}15)`,
      border: `3px solid ${color}30`,
      boxShadow: `0 4px 12px ${color}20`,
    }}>
      {hasPhoto
        ? <img className={styles.avatarImage} src={emp.profilePhotoUrl} alt={emp.name} onError={() => setImgError(true)} />
        : <span className={styles.avatarInitial} style={{ fontSize: size * 0.38, color }}>{emp.name?.[0]?.toUpperCase() || '?'}</span>
      }
    </div>
  );
}

function getId(value) {
  if (!value) return '';
  return String(value._id || value);
}

function sortPeople(list) {
  return [...list].sort((a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9) || (a.name || '').localeCompare(b.name || ''));
}

function isManagingDirector(emp) {
  return emp.role === 'md' || String(emp.designation || '').toLowerCase().includes('managing director');
}

function EmployeeCard({ emp, compact = false }) {
  const color = ROLE_COLORS[emp.role] || '#6366f1';
  return (
    <div className={`${styles.employeeCard} ${compact ? styles.employeeCardCompact : styles.employeeCardRegular}`}>
      <Avatar emp={emp} size={compact ? 42 : 52} />
      <div className={styles.employeeBody}>
        <p className={`${styles.employeeName} ${compact ? styles.employeeNameCompact : styles.employeeNameRegular}`}>{emp.name}</p>
        <p className={styles.employeeDesignation}>{emp.designation || '-'}</p>
        <div className={styles.employeeMeta}>
          <span className={styles.roleBadge} style={{ background: `${color}15`, color }}>
            {ROLE_LABELS[emp.role] || emp.role}
          </span>
          {emp.employeeId && <span className={styles.employeeId}>{emp.employeeId}</span>}
          {emp.department && <span className={styles.departmentBadge}>{emp.department}</span>}
        </div>
      </div>
      <div className={styles.contactActions}>
        {emp.email && !emp.email.includes('@noemail.local') && (
          <a href={`mailto:${emp.email}`} title={emp.email} className={`${styles.contactLink} ${styles.mailLink}`}>
            <Mail size={13} color="#6366f1" />
          </a>
        )}
        {emp.phone && (
          <a href={`tel:${emp.phone}`} title={emp.phone} className={`${styles.contactLink} ${styles.phoneLink}`}>
            <Phone size={13} color="#22c55e" />
          </a>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, color, title, count }) {
  return (
    <div className={styles.sectionTitle}>
      <Icon size={15} color={color} />
      <h3 className={styles.sectionHeading}>{title}</h3>
      <span className={styles.countBadge}>{count}</span>
      <div className={styles.sectionRule} />
    </div>
  );
}

export default function TeamPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');

  useEffect(() => {
    const loadAll = async () => {
      try {
        const first = await getTeamMembers({ limit: 200, page: 1 });
        const { data, pagination: pg } = first.data;
        if (pg?.pages > 1) {
          const rest = await Promise.all(
            Array.from({ length: pg.pages - 1 }, (_, i) => getTeamMembers({ limit: 200, page: i + 2 }))
          );
          setEmployees([...(data || []), ...rest.flatMap(r => r.data.data || [])]);
        } else {
          setEmployees(data || []);
        }
      } catch {
        toast.error('Failed to load team');
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, []);

  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();
  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !search
      || e.name?.toLowerCase().includes(q)
      || e.designation?.toLowerCase().includes(q)
      || e.employeeId?.toLowerCase().includes(q)
      || e.department?.toLowerCase().includes(q);
    const matchDept = !dept || e.department === dept;
    return matchSearch && matchDept;
  });

  const filteredIds = new Set(filtered.map(e => e._id));
  const managingDirectors = sortPeople(filtered.filter(isManagingDirector));
  const leaders = sortPeople(filtered.filter(e => !isManagingDirector(e) && ['admin', 'hr'].includes(e.role)));
  const teamLeads = sortPeople(filtered.filter(e => e.role === 'team_lead'));
  const reportsByLead = {};

  filtered.forEach(e => {
    const leadId = getId(e.resolvedTeamLeadId || e.teamLeadId);
    if (!leadId || e.role === 'team_lead') return;
    if (!reportsByLead[leadId]) reportsByLead[leadId] = [];
    reportsByLead[leadId].push(e);
  });

  const unassigned = sortPeople(filtered.filter(e => {
    if (e.role !== 'employee') return false;
    const leadId = getId(e.resolvedTeamLeadId || e.teamLeadId);
    return !leadId || !filteredIds.has(leadId);
  }));
  const unassignedByDepartment = unassigned.reduce((acc, emp) => {
    const department = emp.department || 'No Department';
    if (!acc[department]) acc[department] = [];
    acc[department].push(emp);
    return acc;
  }, {});

  if (loading) return (
    <div className={styles.loading}>
      <p>Loading team...</p>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.memberCount}>{filtered.length} of {employees.length} active members</p>
          <p className={styles.subtitle}>Showing hierarchy from Managing Director to teams.</p>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.searchWrap}>
          <Search className={styles.searchIcon} size={15} color="#94a3b8" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, role, ID..."
            className={styles.searchInput} />
        </div>
        <select value={dept} onChange={e => setDept(e.target.value)}
          className={styles.departmentSelect}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {managingDirectors.length > 0 && (
        <section className={styles.sectionTight}>
          <SectionTitle icon={Crown} color="#8b5cf6" title="Managing Director" count={managingDirectors.length} />
          <div className={styles.directorGrid}>
            {managingDirectors.map(emp => <EmployeeCard key={emp._id} emp={emp} />)}
          </div>
        </section>
      )}

      {leaders.length > 0 && (
        <section className={styles.sectionTight}>
          <SectionTitle icon={ShieldCheck} color="#0ea5e9" title="Admin & HR" count={leaders.length} />
          <div className={styles.leaderGrid}>
            {leaders.map(emp => <EmployeeCard key={emp._id} emp={emp} />)}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <SectionTitle icon={UsersRound} color="#f59e0b" title="Teams By Reporting" count={teamLeads.length} />
        {teamLeads.map(lead => {
          const reports = sortPeople(reportsByLead[lead._id] || []);
          return (
            <div key={lead._id} className={styles.teamCard}>
              <div className={styles.teamLeadHeader}>
                <div className={styles.teamLeadCardWrap}>
                  <EmployeeCard emp={lead} compact />
                </div>
                <span className={styles.memberCountPill}>
                  {reports.length} member{reports.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className={styles.teamReports}>
                {reports.length > 0 ? (
                  <div className={`${styles.memberGrid} ${styles.reportsGrid}`}>
                    {reports.map(emp => <EmployeeCard key={emp._id} emp={emp} compact />)}
                  </div>
                ) : (
                  <p className={styles.emptyReports}>No direct reports assigned.</p>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {unassigned.length > 0 && (
        <section className={styles.sectionTight}>
          <SectionTitle icon={Building2} color="#94a3b8" title="Department Members" count={unassigned.length} />
          
          {Object.entries(unassignedByDepartment).sort(([a], [b]) => a.localeCompare(b)).map(([department, members]) => (
            <div key={department} className={styles.departmentCard}>
              <div className={styles.departmentHeader}>
                <h4 className={styles.departmentTitle}>{department}</h4>
                <span className={styles.departmentCount}>{members.length}</span>
              </div>
              <div className={styles.memberGrid}>
                {members.map(emp => <EmployeeCard key={emp._id} emp={emp} compact />)}
              </div>
            </div>
          ))}
        </section>
      )}

      {filtered.length === 0 && (
        <div className={styles.emptyState}>
          <p className="font-semibold">No team members found</p>
          <p className={styles.emptyHint}>Try adjusting your search or department filter</p>
        </div>
      )}
    </div>
  );
}
