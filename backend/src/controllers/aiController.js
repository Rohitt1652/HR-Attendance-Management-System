const { OpenAI } = require('openai');
const User = require('../models/User');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const Announcement = require('../models/Announcement');
const CafeMenu = require('../models/CafeMenu');
const PerformanceReview = require('../models/PerformanceReview');
const { buildAttendanceEmployeeFilter } = require('../utils/accessControl');
const { buildChatBalanceContext } = require('../services/leaveBalanceService');

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function getGroq() {
  return new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
}

async function groqChat(messages, maxTokens = 1000) {
  const groq = getGroq();
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.4,
    max_tokens: maxTokens,
  });
  return res.choices[0]?.message?.content?.trim() || '';
}

// ─── 1. HR CHATBOT ────────────────────────────────────────────────────────────

exports.chat = async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;
    const user = req.user;
    const today = new Date().toISOString().split('T')[0];
    const todayDay = DAYS[new Date().getDay()];

    // Gather live context based on user role
    let context = `You are WorkforceOS Assistant, a helpful HR chatbot for ${user.name}'s company.
Today is ${todayDay}, ${today}.
User: ${user.name} | Role: ${user.role} | Department: ${user.department || 'N/A'} | Designation: ${user.designation || 'N/A'}
`;

    // Leave balance — shared service used by getMyBalance API
    try {
      context += await buildChatBalanceContext(user);
    } catch {}

    // Recent attendance
    try {
      const recentAtt = await Attendance.find({ employeeId: user._id })
        .sort({ date: -1 }).limit(7).lean();
      context += `\nRecent Attendance (last 7 days): ${recentAtt.map(a => `${a.date}: ${a.status}${a.isLate ? ' (Late)' : ''}`).join(', ')}`;
    } catch {}

    // Today's menu
    try {
      const menu = await CafeMenu.findOne({ day: todayDay });
      if (menu?.items?.length) {
        context += `\nToday's Cafe Menu (${todayDay}): ${menu.items.filter(i => i.isAvailable).map(i => `${i.name} ₹${i.price}`).join(', ')}`;
      }
    } catch {}

    // Pending leaves (for managers)
    if (['admin', 'hr', 'md', 'team_lead'].includes(user.role)) {
      try {
        const pending = await Leave.find({ status: 'Pending' }).populate('employeeId', 'name department').limit(5).lean();
        if (pending.length) {
          context += `\nPending Leave Requests: ${pending.map(l => `${l.employeeId?.name} (${l.leaveTypeCode}, ${l.totalDays}d)`).join(', ')}`;
        }
      } catch {}
    }

    // Recent announcements
    try {
      const ann = await Announcement.find({ isActive: true }).sort({ createdAt: -1 }).limit(3).lean();
      if (ann.length) {
        context += `\nRecent Announcements: ${ann.map(a => a.title).join(', ')}`;
      }
    } catch {}

    // Expense summary (for managers)
    if (['admin', 'hr', 'md'].includes(user.role)) {
      try {
        const Expense = require('../models/Expense');
        const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const pendingExpenses = await Expense.countDocuments({ status: 'Pending' });
        const monthTotal = await Expense.aggregate([
          { $match: { date: { $gte: thisMonth } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        context += `\nExpenses: ${pendingExpenses} pending approval, ₹${monthTotal[0]?.total || 0} spent this month`;
      } catch {}
    }

    // Task summary
    try {
      const OfficeTask = require('../models/OfficeTask');
      const openTasks = await OfficeTask.countDocuments({ status: { $in: ['Open', 'In Progress'] } });
      const overdueTasks = await OfficeTask.countDocuments({ status: { $nin: ['Completed', 'Cancelled'] }, dueDate: { $lt: new Date() } });
      context += `\nOffice Tasks: ${openTasks} open, ${overdueTasks} overdue`;
    } catch {}

    const systemPrompt = `${context}

You are a friendly, concise HR assistant. Answer questions about:
- Leave balances, policies, and applications
- Attendance records and status
- Today's cafe menu
- Company announcements
- Expenses (pending approvals, monthly totals, categories)
- Office tasks (open, overdue, assignments)
- HR policies and procedures
- Payslips and salary info (general guidance only)

Keep responses short and helpful. Use bullet points for lists. If you don't have specific data, say so honestly.
Do NOT make up data. Only use the context provided above.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6), // last 3 exchanges
      { role: 'user', content: message },
    ];

    const reply = await groqChat(messages, 500);
    res.json({ success: true, reply });
  } catch (err) {
    console.error('[AI Chat]', err.message);
    next(err);
  }
};

// ─── 2. SMART LEAVE PARSER ────────────────────────────────────────────────────

exports.parseLeaveRequest = async (req, res, next) => {
  try {
    const { text } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const prompt = `Parse this leave request into structured JSON. Today is ${today}.

Request: "${text}"

Return ONLY valid JSON (no markdown):
{
  "leaveType": "Sick Leave" | "Casual Leave" | "Privilege Leave" | "Emergency Leave" | "Work From Home",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "totalDays": number,
  "durationType": "full_day" | "half_day",
  "halfDayPeriod": "morning" | "afternoon" | null,
  "reason": "extracted reason or empty string",
  "leaveMode": "Planned" | "Unplanned"
}

Rules:
- If "tomorrow" → next day from today
- If "next Monday" → calculate actual date
- If "2 days" → startDate to startDate+1
- If "sick" or "unwell" → Sick Leave, Unplanned
- If "vacation" or "personal" → Casual Leave, Planned
- If "half day" → durationType: half_day
- totalDays must be correct (weekdays only if possible)`;

    const reply = await groqChat([{ role: 'user', content: prompt }], 300);
    let cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[AI Leave Parser]', err.message);
    res.status(422).json({ success: false, message: 'Could not parse leave request. Please try rephrasing.' });
  }
};

// ─── 3. PERFORMANCE REVIEW WRITER ────────────────────────────────────────────

exports.generateReview = async (req, res, next) => {
  try {
    const { employeeId, ratings, period } = req.body;
    const employee = await User.findById(employeeId).select('name department designation').lean();
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const avg = Object.values(ratings).filter(v => v).reduce((a, b) => a + b, 0) / Object.values(ratings).filter(v => v).length;
    const grade = avg >= 4.5 ? 'A+' : avg >= 4 ? 'A' : avg >= 3.5 ? 'B+' : avg >= 3 ? 'B' : avg >= 2.5 ? 'C' : 'D';

    const prompt = `Write a professional performance review for ${employee.name} (${employee.designation}, ${employee.department}) for ${period}.

Ratings (out of 5):
- Punctuality: ${ratings.punctuality}/5
- Productivity: ${ratings.productivity}/5
- Teamwork: ${ratings.teamwork}/5
- Communication: ${ratings.communication}/5
- Initiative: ${ratings.initiative}/5
- Work Quality: ${ratings.quality}/5
Overall Score: ${avg.toFixed(1)}/5 (Grade: ${grade})

Write 4 sections, each 1-2 sentences:
1. STRENGTHS: What they excel at (based on high ratings)
2. IMPROVEMENTS: Areas to work on (based on low ratings)
3. GOALS: 2-3 specific goals for next period
4. MANAGER_COMMENTS: Overall assessment

Return ONLY valid JSON:
{
  "strengths": "...",
  "improvements": "...",
  "goals": "...",
  "managerComments": "..."
}`;

    const reply = await groqChat([{ role: 'user', content: prompt }], 600);
    let cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[AI Review]', err.message);
    next(err);
  }
};

// ─── 4. ATTENDANCE ANOMALY DETECTION ─────────────────────────────────────────

exports.detectAnomalies = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const startDate = new Date(year || new Date().getFullYear(), (month || new Date().getMonth() + 1) - 1, 1);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    const filter = {
      date: { $gte: startDate.toISOString().split('T')[0], $lte: endDate.toISOString().split('T')[0] },
    };

    const employeeScope = await buildAttendanceEmployeeFilter(req);
    if (employeeScope) {
      filter.employeeId = employeeScope;
    }

    const attendance = await Attendance.find(filter).populate('employeeId', 'name department').lean();

    // Aggregate stats per employee with pseudonymized aliases
    const stats = {};
    const aliasMap = new Map();
    let aliasCounter = 1;

    for (const rec of attendance) {
      const empObj = rec.employeeId;
      if (!empObj) continue;
      const id = (empObj._id || empObj).toString();
      if (!stats[id]) {
        const alias = `EMP_${String(aliasCounter++).padStart(3, '0')}`;
        aliasMap.set(alias, {
          name: empObj.name || 'Employee',
          dept: empObj.department || '',
        });
        stats[id] = { alias, late: 0, absent: 0, present: 0, total: 0 };
      }
      stats[id].total++;
      if (rec.isLate) stats[id].late++;
      if (rec.status === 'Absent') stats[id].absent++;
      if (rec.status === 'Present') stats[id].present++;
    }

    const summary = Object.values(stats).filter(s => s.total > 0);
    if (summary.length === 0) return res.json({ success: true, data: [], message: 'No attendance data for this period.' });

    // Payload sent to Groq contains ONLY opaque aliases and aggregated metrics
    const outboundPayload = summary.slice(0, 30).map(s => ({
      alias: s.alias,
      late: s.late,
      absent: s.absent,
      present: s.present,
      total: s.total,
    }));

    // Local rule-based anomaly detector fallback
    const buildRuleBasedAnomalies = () => {
      return summary
        .filter(s => s.late >= 3 || s.absent >= 3)
        .slice(0, 10)
        .map(s => {
          const emp = aliasMap.get(s.alias) || {};
          const isHigh = s.late >= 5 || s.absent >= 4;
          return {
            employeeName: emp.name || 'Employee',
            department: emp.dept || '',
            issue: s.late >= 3 ? `${s.late} late check-ins recorded this month.` : `${s.absent} explicit absences recorded this month.`,
            severity: isHigh ? 'high' : 'medium',
            recommendation: s.late >= 3 ? 'Review morning shift start alignment.' : 'Conduct attendance reconciliation check-in.',
          };
        });
    };

    if (!process.env.GROQ_API_KEY) {
      return res.json({ success: true, data: buildRuleBasedAnomalies(), totalAnalyzed: summary.length, isFallback: true });
    }

    try {
      const prompt = `Analyze this aggregated attendance data for ${startDate.toLocaleString('default', { month: 'long' })} ${year || new Date().getFullYear()} and identify anomalies.

Data: ${JSON.stringify(outboundPayload)}

Identify employee aliases with:
- High late arrivals (3+ times)
- High absences (3+ days)
- Concerning patterns

Return ONLY valid JSON array (max 10 items):
[
  {
    "alias": "EMP_001",
    "issue": "brief description",
    "severity": "high" | "medium" | "low",
    "recommendation": "brief action"
  }
]
If no anomalies, return empty array [].`;

      const reply = await groqChat([{ role: 'user', content: prompt }], 800);
      let cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      const start = cleaned.indexOf('['), end = cleaned.lastIndexOf(']');
      if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
      
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) throw new Error('AI response is not an array');

      // Map pseudonyms back to employee names safely
      const anomalies = [];
      for (const item of parsed) {
        if (!item || !item.alias || !aliasMap.has(item.alias)) continue;
        const emp = aliasMap.get(item.alias);
        const validSeverity = ['high', 'medium', 'low'].includes(String(item.severity).toLowerCase()) ? item.severity.toLowerCase() : 'medium';
        anomalies.push({
          employeeName: emp.name,
          department: emp.dept,
          issue: String(item.issue || 'Attendance anomaly flagged'),
          severity: validSeverity,
          recommendation: String(item.recommendation || 'Review attendance logs'),
        });
      }

      res.json({ success: true, data: anomalies, totalAnalyzed: summary.length });
    } catch (aiErr) {
      console.warn('[AI Anomaly Fallback]', aiErr.message);
      res.json({ success: true, data: buildRuleBasedAnomalies(), totalAnalyzed: summary.length, isFallback: true });
    }
  } catch (err) {
    console.error('[AI Anomaly]', err.message);
    next(err);
  }
};

// ─── 5. JOB DESCRIPTION GENERATOR ────────────────────────────────────────────

exports.generateJobDescription = async (req, res, next) => {
  try {
    const { title, experience, skills, department, type = 'Full-time' } = req.body;

    const prompt = `Write a professional job posting for:
Title: ${title}
Department: ${department || 'Not specified'}
Experience: ${experience || 'Not specified'}
Key Skills: ${skills || 'Not specified'}
Type: ${type}

Return ONLY valid JSON:
{
  "title": "exact job title",
  "summary": "2-3 sentence role overview",
  "responsibilities": ["responsibility 1", "responsibility 2", "responsibility 3", "responsibility 4", "responsibility 5"],
  "requirements": ["requirement 1", "requirement 2", "requirement 3", "requirement 4"],
  "niceToHave": ["nice to have 1", "nice to have 2"],
  "benefits": ["benefit 1", "benefit 2", "benefit 3"]
}`;

    const reply = await groqChat([{ role: 'user', content: prompt }], 800);
    let cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[AI JD]', err.message);
    next(err);
  }
};

// ─── 6. ANNOUNCEMENT WRITER ───────────────────────────────────────────────────

exports.generateAnnouncement = async (req, res, next) => {
  try {
    const { topic, tone = 'professional', details = '' } = req.body;

    const prompt = `Write a company announcement about: "${topic}"
Additional details: ${details || 'none'}
Tone: ${tone} (professional/friendly/urgent)

Return ONLY valid JSON:
{
  "title": "announcement title (max 80 chars)",
  "content": "full announcement text (2-4 paragraphs, professional tone)"
}`;

    const reply = await groqChat([{ role: 'user', content: prompt }], 500);
    let cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[AI Announcement]', err.message);
    next(err);
  }
};

// ─── 7. EXPENSE INSIGHTS ─────────────────────────────────────────────────────

exports.expenseInsights = async (req, res, next) => {
  try {
    const Expense = require('../models/Expense');
    const { month, year } = req.query;
    const startDate = new Date(year || new Date().getFullYear(), (month || new Date().getMonth() + 1) - 1, 1);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

    const expenses = await Expense.find({
      date: { $gte: startDate, $lte: endDate },
    }).populate('submittedBy', 'name department').lean();

    if (expenses.length === 0) return res.json({ success: true, data: { summary: 'No expenses found for this period.', insights: [] } });

    const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);
    const byCategory = {};
    const byDept = {};
    const byStatus = { Pending: 0, Approved: 0, Rejected: 0 };
    expenses.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      const dept = e.submittedBy?.department || 'Unknown';
      byDept[dept] = (byDept[dept] || 0) + e.amount;
      byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    });

    const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
    const topDept = Object.entries(byDept).sort((a, b) => b[1] - a[1])[0];

    const prompt = `Analyze this expense data and provide 3-5 brief insights:

Period: ${startDate.toLocaleString('default', { month: 'long' })} ${startDate.getFullYear()}
Total: ₹${totalAmount} across ${expenses.length} expenses
By Category: ${JSON.stringify(byCategory)}
By Department: ${JSON.stringify(byDept)}
Status: ${JSON.stringify(byStatus)}
Top Category: ${topCategory?.[0]} (₹${topCategory?.[1]})
Top Department: ${topDept?.[0]} (₹${topDept?.[1]})

Return ONLY valid JSON:
{
  "summary": "one sentence overview",
  "insights": [
    { "text": "insight text", "type": "info" | "warning" | "success" }
  ],
  "recommendations": ["recommendation 1", "recommendation 2"]
}`;

    const reply = await groqChat([{ role: 'user', content: prompt }], 500);
    let cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
    const parsed = JSON.parse(cleaned);
    res.json({ success: true, data: { ...parsed, totalAmount, count: expenses.length, byCategory, byStatus } });
  } catch (err) {
    console.error('[AI Expense]', err.message);
    next(err);
  }
};

// ─── 8. SMART EXPENSE ENTRY ──────────────────────────────────────────────────

exports.parseExpense = async (req, res, next) => {
  try {
    const { text } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const prompt = `Parse this expense description into structured JSON. Today is ${today}.

Text: "${text}"

Return ONLY valid JSON:
{
  "title": "short expense title",
  "amount": number in INR,
  "category": one of "Travel" | "Food" | "Office Supplies" | "Software" | "Hardware" | "Training" | "Entertainment" | "Utilities" | "Maintenance" | "Other",
  "date": "YYYY-MM-DD",
  "description": "brief description"
}

Rules:
- "yesterday" = day before today
- "last week" = 7 days ago
- If amount has "k" suffix, multiply by 1000
- Infer category from context (cab/uber/flight = Travel, lunch/dinner = Food, laptop/mouse = Hardware)`;

    const reply = await groqChat([{ role: 'user', content: prompt }], 300);
    let cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[AI Expense Parse]', err.message);
    res.status(422).json({ success: false, message: 'Could not parse expense. Please try rephrasing.' });
  }
};

// ─── 9. OFFICE TASK INSIGHTS ─────────────────────────────────────────────────

exports.taskInsights = async (req, res, next) => {
  try {
    const OfficeTask = require('../models/OfficeTask');
    const tasks = await OfficeTask.find({}).populate('assignedTo', 'name department').lean();

    if (tasks.length === 0) return res.json({ success: true, data: { summary: 'No tasks found.', insights: [] } });

    const byStatus = {};
    const byPriority = {};
    const byCategory = {};
    const overdue = [];
    const today = new Date();

    tasks.forEach(t => {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
      byCategory[t.category] = (byCategory[t.category] || 0) + 1;
      if (t.dueDate && new Date(t.dueDate) < today && t.status !== 'Completed' && t.status !== 'Cancelled') {
        overdue.push({ title: t.title, assignee: t.assignedTo?.name, dueDate: t.dueDate });
      }
    });

    const prompt = `Analyze office task data and provide insights:

Total Tasks: ${tasks.length}
By Status: ${JSON.stringify(byStatus)}
By Priority: ${JSON.stringify(byPriority)}
By Category: ${JSON.stringify(byCategory)}
Overdue Tasks: ${overdue.length} (${overdue.slice(0, 5).map(t => `"${t.title}" assigned to ${t.assignee || 'unassigned'}`).join(', ')})

Return ONLY valid JSON:
{
  "summary": "one sentence overview",
  "insights": [
    { "text": "insight text", "type": "info" | "warning" | "success" }
  ],
  "recommendations": ["action 1", "action 2"]
}`;

    const reply = await groqChat([{ role: 'user', content: prompt }], 500);
    let cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
    const parsed = JSON.parse(cleaned);
    res.json({ success: true, data: { ...parsed, total: tasks.length, overdue: overdue.length, byStatus, byPriority } });
  } catch (err) {
    console.error('[AI Task Insights]', err.message);
    next(err);
  }
};

// ─── 10. SMART TASK CREATION ─────────────────────────────────────────────────

exports.parseTask = async (req, res, next) => {
  try {
    const { text } = req.body;
    const today = new Date().toISOString().split('T')[0];

    // Get employee names for matching
    const employees = await User.find({ status: 'Active' }).select('name').lean();
    const empNames = employees.map(e => e.name).slice(0, 50).join(', ');

    const prompt = `Parse this task description into structured JSON. Today is ${today}.

Text: "${text}"
Available employees: ${empNames}

Return ONLY valid JSON:
{
  "title": "task title",
  "description": "detailed description",
  "category": one of "Maintenance" | "Cleaning" | "Security" | "IT Support" | "Plumbing" | "Electrical" | "Carpentry" | "Pest Control" | "Renovation" | "Procurement" | "Other",
  "priority": "Low" | "Medium" | "High" | "Urgent",
  "assigneeName": "matched employee name or null",
  "dueDate": "YYYY-MM-DD or null",
  "estimatedCost": number or null
}

Rules:
- Match assignee name to closest employee from the list
- "by Friday" = next Friday from today
- "urgent" or "ASAP" = priority Urgent
- "fix" or "repair" = Maintenance, "clean" = Cleaning, "install" = IT Support`;

    const reply = await groqChat([{ role: 'user', content: prompt }], 400);
    let cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);

    // Match assignee name to actual employee ID
    if (parsed.assigneeName) {
      const match = employees.find(e => e.name.toLowerCase().includes(parsed.assigneeName.toLowerCase()));
      if (match) parsed.assigneeId = match._id;
    }

    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[AI Task Parse]', err.message);
    res.status(422).json({ success: false, message: 'Could not parse task. Please try rephrasing.' });
  }
};
