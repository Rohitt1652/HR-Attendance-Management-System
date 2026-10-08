'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { listTeams, createTeam, updateTeam, deleteTeam, addMember, removeMember, addEvent, updateEvent, deleteEvent } from '@/api/funTeamApi';
import { listEmployees } from '@/api/employeeApi';
import { useAuth } from '@/context/AuthContext';
import styles from './FunTeamPage.module.css';

/*
 * FunTeamPage - Style migration
 * Before: 105 inline styles
 * After: 0 JSX inline styles
 */

const ADMIN_ROLES = ['admin', 'hr', 'md'];

const COMPANY_INTRO = `Our company believes in building a friendly and wholehearted environment. We initiate time-to-time co-curricular activities with our fun teams. What makes these activities special is the determination and participation from all members of our family.`;
const DEFAULT_TEAM_COLOR = '#6366f1';

const cssVars = (vars) => (node) => {
  if (!node) return;
  Object.entries(vars).forEach(([key, value]) => node.style.setProperty(key, value));
};

const teamColorVars = (color = DEFAULT_TEAM_COLOR) => ({
  '--team-color': color,
  '--team-color-soft': `${color}10`,
  '--team-color-border': `${color}20`,
  '--team-color-tint': `${color}30`,
});

function Avatar({ person, size = 48 }) {
  const color = DEFAULT_TEAM_COLOR;
  return (
    <div
      className={`${styles.avatar} ${person?.profilePhotoUrl ? styles.avatarPhoto : ''}`}
      ref={cssVars({
        '--avatar-size': `${size}px`,
        '--avatar-bg': `${color}20`,
        '--avatar-border': `${color}30`,
        '--avatar-color': color,
        '--avatar-font-size': `${size * 0.35}px`,
      })}
    >
      {person?.profilePhotoUrl
        ? <img src={person.profilePhotoUrl} alt={person.name} className={styles.avatarImage} />
        : <span className={styles.avatarInitial}>{person?.name?.[0]?.toUpperCase() || '?'}</span>
      }
    </div>
  );
}

function TeamForm({ team, employees, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:        team?.name || '',
    description: team?.description || '',
    color:       team?.color || '#6366f1',
    captain:     team?.captain?._id || team?.captain || '',
    members:     (team?.members || []).map(m => m._id || m),
  });
  const [logo, setLogo]     = useState(null);
  const [saving, setSaving] = useState(false);

  const toggleMember = (id) => {
    setForm(f => ({
      ...f,
      members: f.members.includes(id) ? f.members.filter(m => m !== id) : [...f.members, id],
    }));
  };

  const handleSave = async () => {
    if (!form.name) return toast.error('Team name required');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('description', form.description);
      fd.append('color', form.color);
      if (form.captain) fd.append('captain', form.captain);
      form.members.forEach(m => fd.append('members', m));
      if (logo) fd.append('logo', logo);
      if (team) await updateTeam(team._id, fd);
      else await createTeam(fd);
      toast.success(team ? 'Team updated' : 'Team created');
      onSave();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop">
      <div className={`bg-white rounded-2xl ${styles.modal} ${styles.teamModal}`}>
        <h3 className={`font-bold text-heading ${styles.modalTitle}`}>{team ? 'Edit Team' : 'New Fun Team'}</h3>
        <div className={styles.formStack}>
          <div className={styles.formGrid}>
            <div>
              <label className={`d-block text-base font-semibold text-body-clr ${styles.label}`}>Team Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Eagles" className={styles.input} />
            </div>
            <div>
              <label className={`d-block text-base font-semibold text-body-clr ${styles.label}`}>Color</label>
              <div className="d-flex align-center gap-2">
                <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className={styles.colorInput} />
                <input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className={`${styles.input} ${styles.colorTextInput}`} />
              </div>
            </div>
          </div>
          <div>
            <label className={`d-block text-base font-semibold text-body-clr ${styles.label}`}>Description</label>
            <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={`${styles.input} ${styles.textarea}`} />
          </div>
          <div>
            <label className={`d-block text-base font-semibold text-body-clr ${styles.label}`}>Team Logo</label>
            <input type="file" accept="image/*" onChange={e => setLogo(e.target.files[0])} className={styles.fileInput} />
          </div>
          <div>
            <label className={`d-block text-base font-semibold text-body-clr ${styles.label}`}>Captain</label>
            <select value={form.captain} onChange={e => setForm(f => ({ ...f, captain: e.target.value }))} className={styles.input}>
              <option value="">- Select Captain -</option>
              {employees.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className={`d-block text-base font-semibold text-body-clr ${styles.membersLabel}`}>Members ({form.members.length} selected)</label>
            <div className={styles.memberPicker}>
              {employees.map(e => (
                <label key={e._id} className={`row-center gap-2 cursor-pointer ${styles.memberOption} ${form.members.includes(e._id) ? styles.memberOptionSelected : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.members.includes(e._id)}
                    onChange={() => toggleMember(e._id)}
                    className={styles.memberCheckbox}
                    ref={cssVars({ '--team-color': form.color })}
                  />
                  <Avatar person={e} size={28} />
                  <span className={`text-body-clr ${styles.memberName}`}>{e.name}</span>
                  <span className={`text-muted ${styles.memberMeta}`}>{e.designation || e.department || ''}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.formActions}>
          <button onClick={onCancel} className={styles.secondaryButton}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className={styles.primaryButton}
            ref={cssVars({ '--button-bg': form.color })}>
            {saving ? 'Saving...' : 'Save Team'}
          </button>
        </div>
      </div>
    </div>
  );
}

function isYouTubeUrl(url) { return /youtube\.com|youtu\.be/.test(url); }
function getYouTubeEmbed(url) {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

function EventForm({ teamId, event, onSave, onClose }) {
  const [form, setForm] = useState({
    title:       event?.title || '',
    description: event?.description || '',
    date:        event?.date ? event.date.slice(0, 10) : '',
    videoUrls:   (event?.videoUrls || []).join('\n'),
  });
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!form.title) return toast.error('Event title required');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description);
      if (form.date) fd.append('date', form.date);
      form.videoUrls.split('\n').map(v => v.trim()).filter(Boolean).forEach(v => fd.append('videoUrls', v));
      images.forEach(img => fd.append('images', img));
      if (event) (event.images || []).forEach(img => fd.append('existingImages', img));
      if (event) await updateEvent(teamId, event._id, fd);
      else await addEvent(teamId, fd);
      toast.success(event ? 'Event updated' : 'Event added');
      onSave();
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className={`modal-backdrop ${styles.eventBackdrop}`}>
      <div className={`bg-white rounded-2xl ${styles.modal} ${styles.eventModal}`}>
        <div className={`row-between ${styles.eventHeader}`}>
          <h3 className="font-bold text-heading m-0">{event ? 'Edit Event' : 'Add Event'}</h3>
          <button onClick={onClose} className={`btn-ghost-base cursor-pointer text-secondary ${styles.closeButton}`}>X</button>
        </div>
        <div className={styles.formStack}>
          <div><label className={styles.label}>Event Title *</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={`${styles.input} ${styles.eventInput}`} /></div>
          <div><label className={styles.label}>Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={`${styles.input} ${styles.eventInput}`} /></div>
          <div><label className={styles.label}>Description</label><textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={`${styles.input} ${styles.eventInput} ${styles.textarea}`} /></div>
          <div>
            <label className={styles.label}>Photos (upload images)</label>
            <input type="file" accept="image/*" multiple onChange={e => setImages(Array.from(e.target.files))} className={styles.fileInput} />
            {images.length > 0 && <p className={`text-primary-clr ${styles.helperText}`}>{images.length} file(s) selected</p>}
            {event?.images?.length > 0 && <p className={`text-muted ${styles.helperText}`}>{event.images.length} existing image(s) will be kept</p>}
          </div>
          <div>
            <label className={styles.label}>Video URLs (one per line - YouTube or direct)</label>
            <textarea rows={3} value={form.videoUrls} onChange={e => setForm(f => ({ ...f, videoUrls: e.target.value }))} placeholder="https://youtube.com/watch?v=..." className={`${styles.input} ${styles.eventInput} ${styles.textarea}`} />
          </div>
        </div>
        <div className={styles.formActions}>
          <button onClick={onClose} className={styles.secondaryButton}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className={styles.primaryButton}>
            {saving ? 'Saving...' : 'Save Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FunTeamPage() {
  const { user }   = useAuth();
  const isAdmin    = ADMIN_ROLES.includes(user?.role);
  const [teams, setTeams]               = useState([]);
  const [employees, setEmployees]       = useState([]);
  const [activeTab, setActiveTab]       = useState(0);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editTeam, setEditTeam]         = useState(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editEvent, setEditEvent]       = useState(null);

  const fetchTeams = async () => {
    try { const res = await listTeams(); setTeams(res.data.data || []); }
    catch { toast.error('Failed to load teams'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchTeams();
    if (isAdmin) listEmployees({ status: 'Active' }).then(res => setEmployees(res.data.data || [])).catch(() => {});
  }, [isAdmin]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this team?')) return;
    try { await deleteTeam(id); toast.success('Team deleted'); fetchTeams(); }
    catch { toast.error('Failed to delete'); }
  };

  const handleDeleteEvent = async (teamId, eventId) => {
    if (!confirm('Delete this event?')) return;
    try { await deleteEvent(teamId, eventId); toast.success('Event deleted'); fetchTeams(); }
    catch { toast.error('Failed to delete event'); }
  };

  const activeTeam = teams[activeTab];

  if (loading) return <div className={`text-muted ${styles.loading}`}>Loading...</div>;

  return (
    <div className={styles.page}>

      {/* Header */}
      <div className={`row-between gap-4 ${styles.header}`}>
        <div className="row-center gap-3">
          <div className={`d-flex align-center justify-center ${styles.headerIcon}`}>FT</div>
          <div>
            <h2 className={`font-extrabold text-heading ${styles.title}`}>Fun Team</h2>
            <p className={`text-muted ${styles.subtitle}`}>{teams.length} active teams</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditTeam(null); setShowForm(true); }} className={`cursor-pointer font-semibold text-white flex-shrink-0 ${styles.newTeamButton}`}>
            + New Team
          </button>
        )}
      </div>

      {/* Company intro */}
      <div className={`bg-white rounded-2xl border-default ${styles.introCard}`}>
        <p className={`text-secondary ${styles.introText}`}>{COMPANY_INTRO}</p>
      </div>

      {teams.length === 0 ? (
        <div className={`text-muted bg-white rounded-2xl border-default ${styles.emptyState}`}>
          {isAdmin ? 'No teams yet. Create the first one!' : 'No fun teams have been created yet.'}
        </div>
      ) : (
        <div className={`bg-white rounded-2xl border-default overflow-hidden ${styles.teamShell}`}>

          {/* Tabs - active color is team.color (data-driven) */}
          <div className={`d-flex overflow-hidden ${styles.tabs}`}>
            {teams.map((team, i) => (
              <button
                key={team._id}
                onClick={() => setActiveTab(i)}
                className={`cursor-pointer ${styles.tabButton} ${activeTab === i ? styles.tabButtonActive : ''}`}
                ref={cssVars(teamColorVars(team.color))}
              >
                {team.name}
              </button>
            ))}
          </div>

          {/* Active team content */}
          {activeTeam && (
            <div className={styles.teamContent}>
              <div className={`d-flex flex-wrap ${styles.teamTop}`}>
                {/* Logo */}
                {activeTeam.logoUrl && (
                  <div className={`overflow-hidden border-default flex-shrink-0 ${styles.logoBox}`}>
                    <img src={activeTeam.logoUrl} alt={activeTeam.name} className={styles.logoImage} />
                  </div>
                )}
                <div className="flex-1">
                  <div className={`row-center gap-3 ${styles.teamTitleRow}`}>
                    <h3 className={`font-extrabold ${styles.teamName}`} ref={cssVars({ '--team-color': activeTeam.color || '#1e293b' })}>{activeTeam.name}</h3>
                    {isAdmin && (
                      <div className={`d-flex gap-2 ${styles.adminActions}`}>
                        <button onClick={() => { setEditTeam(activeTeam); setShowForm(true); }} className={`cursor-pointer font-semibold ${styles.smallEditButton}`}>Edit</button>
                        <button onClick={() => handleDelete(activeTeam._id)} className={`cursor-pointer font-semibold ${styles.smallDeleteButton}`}>Delete</button>
                      </div>
                    )}
                  </div>
                  {activeTeam.description && (
                    <p className={`text-secondary ${styles.teamDescription}`}>{activeTeam.description}</p>
                  )}
                  {activeTeam.captain && (
                    <div className={`row-center gap-3 ${styles.captainCard}`} ref={cssVars(teamColorVars(activeTeam.color))}>
                      <Avatar person={activeTeam.captain} size={44} />
                      <div>
                        <p className={`font-bold text-heading ${styles.captainName}`}>{activeTeam.captain.name}</p>
                        <p className={`font-semibold ${styles.captainMeta}`}>Captain - {activeTeam.captain.designation || 'Team Lead'}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Members */}
              {activeTeam.members?.length > 0 && (
                <div>
                  <p className={`font-bold uppercase text-muted ${styles.sectionLabel}`}>
                    Members - {activeTeam.members.length}
                  </p>
                  <div className={styles.memberGrid}>
                    {activeTeam.members.map(member => (
                      <div key={member._id} className={`row-center gap-2 border-default ${styles.memberCard}`}>
                        <Avatar person={member} size={36} />
                        <div className="min-w-0">
                          <p className={`font-semibold text-heading text-truncate ${styles.memberCardName}`}>{member.name}</p>
                          <p className={`text-muted text-truncate ${styles.memberCardMeta}`}>{member.designation || member.department || ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Events */}
              <div className={styles.eventsSection}>
                <div className={`row-between ${styles.eventsHeader}`}>
                  <p className={`font-bold uppercase text-muted ${styles.eventsLabel}`}>
                    Events - {activeTeam.events?.length || 0}
                  </p>
                  {isAdmin && (
                    <button onClick={() => { setEditEvent(null); setShowEventForm(true); }} className={`cursor-pointer font-semibold ${styles.addEventButton}`}>
                      + Add Event
                    </button>
                  )}
                </div>
                {(!activeTeam.events || activeTeam.events.length === 0) ? (
                  <p className={`text-muted ${styles.emptyEvents}`}>No events yet.</p>
                ) : (
                  <div className="d-flex-col gap-4">
                    {[...activeTeam.events].reverse().map(ev => (
                      <div key={ev._id} className={`bg-subtle border-default overflow-hidden ${styles.eventCard}`}>
                        <div className={styles.eventBody}>
                          <div className="row-between">
                            <div>
                              <p className={`font-bold text-heading ${styles.eventTitle}`}>{ev.title}</p>
                              {ev.date && <p className={`text-muted ${styles.eventDate}`}>Date: {new Date(ev.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>}
                              {ev.description && <p className={`text-secondary ${styles.eventDescription}`}>{ev.description}</p>}
                            </div>
                            {isAdmin && (
                              <div className={`d-flex gap-2 flex-shrink-0 ${styles.eventActions}`}>
                                <button onClick={() => { setEditEvent(ev); setShowEventForm(true); }} className={`cursor-pointer font-semibold ${styles.eventSmallButton} ${styles.smallEditButton}`}>Edit</button>
                                <button onClick={() => handleDeleteEvent(activeTeam._id, ev._id)} className={`cursor-pointer font-semibold ${styles.eventSmallButton} ${styles.smallDeleteButton}`}>Delete</button>
                              </div>
                            )}
                          </div>
                        </div>
                        {ev.images?.length > 0 && (
                          <div className={`d-flex overflow-hidden ${styles.mediaScroller}`}>
                            {ev.images.map((img, i) => (
                              <a key={i} href={img} target="_blank" rel="noreferrer" className={styles.mediaLink}>
                                <img src={img} alt={`event-${i}`} className={`border-default ${styles.eventImage}`} />
                              </a>
                            ))}
                          </div>
                        )}
                        {ev.videoUrls?.length > 0 && (
                          <div className={`d-flex overflow-hidden ${styles.mediaScroller} ${styles.videoScroller}`}>
                            {ev.videoUrls.map((url, i) => {
                              const embedUrl = isYouTubeUrl(url) ? getYouTubeEmbed(url) : null;
                              return embedUrl ? (
                                <iframe key={i} src={embedUrl} title={`video-${i}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
                                  className={`border-default flex-shrink-0 ${styles.eventVideo}`} />
                              ) : (
                                <a key={i} href={url} target="_blank" rel="noreferrer"
                                  className={`row-center gap-2 border-default bg-white flex-shrink-0 ${styles.videoLink}`}>
                                  Video {i + 1}
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <TeamForm
          team={editTeam}
          employees={employees}
          onSave={() => { setShowForm(false); setEditTeam(null); fetchTeams(); }}
          onCancel={() => { setShowForm(false); setEditTeam(null); }}
        />
      )}
      {showEventForm && activeTeam && (
        <EventForm
          teamId={activeTeam._id}
          event={editEvent}
          onSave={() => { setShowEventForm(false); setEditEvent(null); fetchTeams(); }}
          onClose={() => { setShowEventForm(false); setEditEvent(null); }}
        />
      )}
    </div>
  );
}
