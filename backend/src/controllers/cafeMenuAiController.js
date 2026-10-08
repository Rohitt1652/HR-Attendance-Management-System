const { PDFParse } = require('pdf-parse');
const { OpenAI } = require('openai');
const CafeMenu = require('../models/CafeMenu');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CATEGORIES = ['Breakfast', 'Lunch', 'Snacks', 'Beverages', 'Dinner'];

const normalizeItemName = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

function imageMapFromMenus(menus) {
  const map = new Map();
  menus.forEach(menu => {
    const menuUpdatedAt = new Date(menu.updatedAt || 0).getTime();
    (menu.items || []).forEach(item => {
      const key = normalizeItemName(item.name);
      if (!key || !item.imageUrl) return;
      const updatedAt = new Date(item.imageUpdatedAt || menuUpdatedAt || 0).getTime();
      const current = map.get(key);
      if (!current || updatedAt >= current.updatedAt) {
        map.set(key, { imageUrl: item.imageUrl, updatedAt });
      }
    });
  });
  for (const [key, value] of map.entries()) map.set(key, value.imageUrl);
  return map;
}

// ─── Extract text from PDF ────────────────────────────────────────────────────

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer, verbosity: 0 });
  const result = await parser.getText();
  const text = result.text?.trim() || '';
  console.log(`[PDF] Extracted ${text.length} chars from ${result.total} page(s)`);
  return { text, pages: result.total };
}

// ─── Groq AI parser (free, fast, OpenAI-compatible) ──────────────────────────

async function parseWithGroq(rawText) {
  const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const MAX_CHARS = 12000;
  const chunks = [];
  for (let i = 0; i < rawText.length; i += MAX_CHARS) {
    chunks.push(rawText.slice(i, i + MAX_CHARS));
  }

  const allItems = [];
  const seenNames = new Set();

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const prompt = `You are a cafeteria menu parser. Extract ALL food and drink items from the text below.

IMPORTANT: This menu may be in a table format where the first column has day abbreviations (Mon, Tue, Wed, Thu, Fri, Sat, Sun). Each row's food item belongs to that day.

For each item return a JSON array with objects:
- "name": item name (string, required) — if a row has "OR" options like "Chana Bhatura OR Poori Sabzi", create TWO separate items for the same day
- "description": short description if available (string, max 100 chars, empty string if none)
- "price": price in INR as a number (0 if not found)
- "category": one of exactly: "Breakfast", "Lunch", "Snacks", "Beverages", "Dinner"
  - Use the section heading to determine category (e.g. "Daily Lunch Meal" = Lunch, "Snacks" = Snacks)
  - If no heading: tea/coffee/juice/lassi = Beverages, samosa/pakora/roll/momos = Snacks, rice/dal/curry/roti/paneer/chawal/paratha/bhatura/rajma/chole/kadhi = Lunch, poha/idli/dosa = Breakfast
  - Items like "Extra Raita", "Curd", "Salad" with no day = Lunch add-ons
  - Sweet dishes (custard, kheer, halwa, cream) = Snacks
- "isVeg": true if vegetarian, false if non-veg (default true if unclear)
- "day": map day abbreviations to full names:
  - Mon/Monday = "Monday", Tue/Tuesday = "Tuesday", Wed/Wednesday = "Wednesday"
  - Thu/Thursday = "Thursday", Fri/Friday = "Friday", Sat/Saturday = "Saturday", Sun/Sunday = "Sunday"
  - "everyday" if available all days (like beverages, add-ons with no specific day)
  - null if truly not specified

Return ONLY a valid JSON array. No explanation, no markdown, no code blocks.

Menu text:
${chunk}`;

    try {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 3000,
      });

      let response = completion.choices[0]?.message?.content?.trim() || '';
      console.log(`[Groq] Chunk ${ci + 1} response (first 200):`, response.slice(0, 200));

      // Strip markdown code blocks
      response = response.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

      // Extract JSON array
      const jsonStart = response.indexOf('[');
      const jsonEnd = response.lastIndexOf(']');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        response = response.slice(jsonStart, jsonEnd + 1);
      }

      const parsed = JSON.parse(response);
      if (!Array.isArray(parsed)) continue;

      for (const item of parsed) {
        if (!item.name || typeof item.name !== 'string') continue;
        const name = item.name.trim();
        if (name.length < 2 || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        allItems.push({
          name: name.slice(0, 100),
          description: String(item.description || '').trim().slice(0, 200),
          price: Math.max(0, parseFloat(item.price) || 0),
          category: CATEGORIES.includes(item.category) ? item.category : 'Lunch',
          isVeg: item.isVeg !== false,
          day: DAYS.includes(item.day) ? item.day : (item.day === 'everyday' ? 'everyday' : null),
        });
      }
    } catch (err) {
      console.error(`[Groq] Chunk ${ci + 1} error:`, err.message);
    }
  }

  return allItems;
}

// ─── Regex fallback (when GPT fails) ─────────────────────────────────────────

function regexFallback(rawText) {
  const PRICE_RE = [
    /[₹]\s*(\d+(?:\.\d{1,2})?)/,
    /Rs\.?\s*(\d+(?:\.\d{1,2})?)/i,
    /INR\s*(\d+(?:\.\d{1,2})?)/i,
    /(\d+(?:\.\d{1,2})?)\s*\/-/,
  ];

  const NON_VEG = ['chicken','mutton','fish','egg','prawn','shrimp','lamb','beef','pork',
                   'meat','keema','kheema','gosht','murgh','machli','jhinga'];

  // Category header detection — matches section headings in the PDF
  const CAT_HEADER_RE = [
    { cat: 'Breakfast', re: /^\s*(breakfast|morning\s*(menu|items?|snacks?)?)\s*$/i },
    { cat: 'Lunch',     re: /^\s*(lunch|lunch\s*(menu|items?)?|main\s*course|meal|thali)\s*$/i },
    { cat: 'Snacks',    re: /^\s*(snacks?|snack\s*(menu|items?)?|evening\s*(snacks?|menu)?|tea\s*time|starters?|light\s*bites?)\s*$/i },
    { cat: 'Beverages', re: /^\s*(beverages?|drinks?|hot\s*(beverages?|drinks?)|cold\s*(beverages?|drinks?)|juices?|tea\s*(&|and)?\s*coffee)\s*$/i },
    { cat: 'Dinner',    re: /^\s*(dinner|dinner\s*(menu|items?)?|supper)\s*$/i },
  ];

  // Inline category hints (when header is on same line as items)
  const CAT_INLINE_RE = [
    { cat: 'Beverages', re: /\b(tea|chai|coffee|juice|lassi|buttermilk|shake|smoothie|lemonade|cold\s*drink|soda|water|milk|chaas)\b/i },
    { cat: 'Snacks',    re: /\b(samosa|pakora|bhajiya|vada|pav|kachori|chaat|bhel|cutlet|tikki|momos|roll|frankie|dhokla|bun\s*maska)\b/i },
    { cat: 'Breakfast', re: /\b(poha|upma|idli|dosa|paratha|omelette|uttapam|appam|puttu|cornflakes|oats)\b/i },
    { cat: 'Lunch',     re: /\b(rice|dal|sabzi|curry|roti|chapati|naan|biryani|pulao|paneer|rajma|chole|chhole|sambar|rasam|kadhi|khichdi|thali)\b/i },
  ];

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  const seen = new Set();
  let currentCat = null; // null = not yet determined

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for explicit category section header
    let foundHeader = false;
    for (const { cat, re } of CAT_HEADER_RE) {
      if (re.test(line)) {
        currentCat = cat;
        foundHeader = true;
        break;
      }
    }
    if (foundHeader) continue;

    // Try to extract price from this line
    let price = 0;
    for (const re of PRICE_RE) {
      const m = line.match(re);
      if (m) { price = parseFloat(m[1]); break; }
    }
    // Standalone number at end
    if (!price) {
      const end = line.match(/\b(\d{1,4}(?:\.\d{1,2})?)\s*$/);
      if (end) { const v = parseFloat(end[1]); if (v >= 5 && v <= 2000) price = v; }
    }
    if (!price) continue;

    // Clean name
    let name = line;
    for (const re of PRICE_RE) name = name.replace(re, '');
    name = name
      .replace(/\bINR\b/gi, '').replace(/\bRs\.?\b/gi, '')
      .replace(/\b\d{1,4}(?:\.\d{1,2})?\s*$/, '')
      .replace(/^\d+[\.\)\-\s]+/, '')
      .replace(/[-–—|:,]+$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (name.length < 2 || name.length > 100 || /^\d+$/.test(name)) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    // Determine category: section header > inline keyword > default Lunch
    let category = currentCat;
    if (!category) {
      for (const { cat, re } of CAT_INLINE_RE) {
        if (re.test(name)) { category = cat; break; }
      }
    }
    if (!category) category = 'Lunch';

    items.push({
      name,
      description: '',
      price,
      category,
      isVeg: !NON_VEG.some(kw => name.toLowerCase().includes(kw)),
      day: null,
    });
  }
  return items;
}

// ─── Controllers ─────────────────────────────────────────────────────────────

exports.parsePdf = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No PDF file uploaded' });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ success: false, message: 'Groq API key not configured. Add GROQ_API_KEY to your .env file.' });
    }

    // Step 1: Extract text from PDF
    let pdfText, pages;
    try {
      ({ text: pdfText, pages } = await extractPdfText(req.file.buffer));
    } catch (err) {
      return res.status(422).json({ success: false, message: 'Failed to read PDF. Make sure it is a text-based PDF, not a scanned image.' });
    }

    if (!pdfText || pdfText.length < 20) {
      return res.status(422).json({ success: false, message: 'Could not extract text from PDF. Make sure it is a text-based PDF (not a scanned image).' });
    }

    // Step 2: Try GPT first, fall back to regex if quota/network fails
    let items = [];
    let usedFallback = false;

    try {
      items = await parseWithGroq(pdfText);
    } catch (err) {
      console.log('[PDF Parser] Groq failed:', err.message, '— using regex fallback');
    }

    if (items.length === 0) {
      console.log('[PDF Parser] GPT returned 0 items, trying regex fallback');
      items = regexFallback(pdfText);
      usedFallback = true;
    }

    if (items.length === 0) {
      return res.status(422).json({
        success: false,
        message: 'No menu items found in the PDF. Make sure it contains item names and prices.',
        rawTextPreview: pdfText.slice(0, 300),
      });
    }

    return res.json({
      success: true,
      data: items,
      totalExtracted: items.length,
      pdfPages: pages,
      ...(usedFallback && {
        warning: 'AI parsing failed — used basic extraction. Categories may need manual correction using the bulk buttons below.',
      }),
    });
  } catch (err) {
    console.error('[PDF Parser] Error:', err.message);
    next(err);
  }
};

exports.importParsed = async (req, res, next) => {
  try {
    const { items, targetDay, mode } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No items to import' });
    }

    const byDay = {};
    const everydayItems = [];

    for (const item of items) {
      const clean = {
        name: String(item.name || '').trim().slice(0, 100),
        description: String(item.description || '').trim().slice(0, 200),
        price: Math.max(0, parseFloat(item.price) || 0),
        category: CATEGORIES.includes(item.category) ? item.category : 'Lunch',
        isVeg: item.isVeg !== false,
        isAvailable: true,
        imageUrl: '',
      };

      if (item.day === 'everyday') {
        everydayItems.push(clean);
      } else {
        const day = DAYS.includes(item.day) ? item.day : (DAYS.includes(targetDay) ? targetDay : null);
        if (!day) continue;
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(clean);
      }
    }

    if (everydayItems.length > 0) {
      DAYS.forEach(d => {
        if (!byDay[d]) byDay[d] = [];
        byDay[d].push(...everydayItems);
      });
    }

    const allMenus = await CafeMenu.find();
    const globalImages = imageMapFromMenus(allMenus);
    const results = [];
    for (const [day, newItems] of Object.entries(byDay)) {
      const menu = await CafeMenu.findOne({ day });
      if (!menu) continue;
      const existingByName = new Map(menu.items.map(i => [normalizeItemName(i.name), i]));
      const mergeExistingImage = (item) => {
        const key = normalizeItemName(item.name);
        const existing = existingByName.get(key);
        return {
          ...item,
          // Menu imports never replace an image already assigned to this item.
          // A cross-day image is used only when this day has no saved image.
          imageUrl: existing?.imageUrl || globalImages.get(key) || '',
          imageUpdatedAt: existing?.imageUpdatedAt || null,
        };
      };

      if (mode === 'replace') {
        menu.items = newItems.map(mergeExistingImage);
      } else {
        for (const newItem of newItems) {
          const key = normalizeItemName(newItem.name);
          const existing = existingByName.get(key);
          if (existing) {
            existing.description = newItem.description;
            existing.price = newItem.price;
            existing.category = newItem.category;
            existing.isVeg = newItem.isVeg;
            existing.isAvailable = true;
            if (!existing.imageUrl) {
              existing.imageUrl = globalImages.get(key) || '';
            }
          } else {
            menu.items.push(mergeExistingImage(newItem));
          }
        }
      }
      menu.updatedAt = new Date();
      await menu.save();
      results.push({ day, count: newItems.length });
    }

    res.json({ success: true, data: results, message: `Imported to ${results.length} day(s)` });
  } catch (err) { next(err); }
};
