const CafeMenu = require('../models/CafeMenu');
const { CafeConfig } = require('../models/CafeMenu');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const normalizeItemName = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** List APIs skip embedded photos — base64 in Mongo makes responses huge and very slow. */
const MENU_LIST_PROJECTION = '-items.imageUrl -items.imageUpdatedAt';

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

function hydrateMenuImages(menu, imageMap) {
  if (!menu) return menu;
  const obj = typeof menu.toObject === 'function' ? menu.toObject() : { ...menu };
  obj.items = (obj.items || []).map(item => {
    const itemObj = typeof item.toObject === 'function' ? item.toObject() : { ...item };
    const latestImage = imageMap.get(normalizeItemName(itemObj.name));
    if (latestImage) itemObj.imageUrl = latestImage;
    return itemObj;
  });
  return obj;
}

async function syncImagesForItemName(name, imageUrl, { overwrite = false } = {}) {
  if (!imageUrl) return;
  const key = normalizeItemName(name);
  if (!key) return;
  const menus = await CafeMenu.find();
  await Promise.all(menus.map(async menu => {
    let changed = false;
    menu.items.forEach(item => {
      if (normalizeItemName(item.name) === key && (overwrite || !item.imageUrl)) {
        item.imageUrl = imageUrl;
        item.imageUpdatedAt = new Date();
        changed = true;
      }
    });
    if (changed) {
      menu.updatedAt = new Date();
      await menu.save();
    }
  }));
}

exports.getAllMenus = async (req, res, next) => {
  try {
    const menus = await CafeMenu.find().select(MENU_LIST_PROJECTION).sort({ day: 1 }).lean();
    res.json({ success: true, data: menus });
  } catch (err) { next(err); }
};

exports.getTodayMenu = async (req, res, next) => {
  try {
    // Support ?date=YYYY-MM-DD param for fetching menu of a specific date
    const requestedDate = req.query.date ? new Date(req.query.date + 'T00:00:00') : new Date();
    const dayName = DAYS[requestedDate.getDay()];
    const menu = await CafeMenu.findOne({ day: dayName }).select(MENU_LIST_PROJECTION).lean();

    // Also fetch always-available items (Snacks & Beverages) from all days
    const EVERYDAY_CATEGORIES = ['Snacks', 'Beverages'];
    const allMenus = await CafeMenu.find({ day: { $ne: dayName } }).select(MENU_LIST_PROJECTION).lean();
    const everydayItems = [];
    const seenNames = new Set((menu?.items || []).map(i => i.name.toLowerCase()));

    allMenus.forEach(m => {
      m.items.forEach(item => {
        if (
          EVERYDAY_CATEGORIES.includes(item.category) &&
          item.isAvailable &&
          !seenNames.has(item.name.toLowerCase())
        ) {
          seenNames.add(item.name.toLowerCase());
          everydayItems.push(item);
        }
      });
    });

    // Merge: today's items first, then everyday items not already present
    const mergedItems = [...(menu?.items || []), ...everydayItems];

    const result = {
      _id: menu?._id,
      day: dayName,
      items: mergedItems,
      specialNote: menu?.specialNote || '',
    };

    res.json({ success: true, data: result, today: dayName });
  } catch (err) { next(err); }
};

exports.getDayMenu = async (req, res, next) => {
  try {
    const day = req.params.day;
    const menu = await CafeMenu.findOne({ day }).select(MENU_LIST_PROJECTION).lean();
    if (!menu) {
      return res.json({ success: true, data: { day, items: [], specialNote: '' } });
    }
    res.json({ success: true, data: menu });
  } catch (err) { next(err); }
};

exports.updateDayMenu = async (req, res, next) => {
  try {
    const { items, specialNote } = req.body;
    const menu = await CafeMenu.findOneAndUpdate(
      { day: req.params.day },
      { items, specialNote, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    res.json({ success: true, data: menu });
  } catch (err) { next(err); }
};

exports.addItem = async (req, res, next) => {
  try {
    const menu = await CafeMenu.findOne({ day: req.params.day });
    if (!menu) return res.status(404).json({ success: false, message: 'Menu not found' });
    menu.items.push({
      ...req.body,
      ...(req.body.imageUrl ? { imageUpdatedAt: new Date() } : {}),
    });
    menu.updatedAt = new Date();
    await menu.save();
    await syncImagesForItemName(req.body.name, req.body.imageUrl, { overwrite: true });
    res.status(201).json({ success: true, data: menu });
  } catch (err) { next(err); }
};

exports.updateItem = async (req, res, next) => {
  try {
    const menu = await CafeMenu.findOne({ day: req.params.day });
    if (!menu) return res.status(404).json({ success: false, message: 'Menu not found' });
    const item = menu.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    const imageSubmitted = typeof req.body.imageUrl === 'string' && req.body.imageUrl.trim() !== '';
    Object.assign(item, req.body);
    if (imageSubmitted) item.imageUpdatedAt = new Date();
    menu.updatedAt = new Date();
    await menu.save();

    await syncImagesForItemName(item.name, req.body.imageUrl, { overwrite: true });

    res.json({ success: true, data: menu });
  } catch (err) { next(err); }
};

exports.deleteItem = async (req, res, next) => {
  try {
    const menu = await CafeMenu.findOne({ day: req.params.day });
    if (!menu) return res.status(404).json({ success: false, message: 'Menu not found' });
    menu.items = menu.items.filter(i => String(i._id) !== req.params.itemId);
    menu.updatedAt = new Date();
    await menu.save();
    res.json({ success: true, data: menu });
  } catch (err) { next(err); }
};

// ── Cafe Config (timings) ─────────────────────────────────────────────────────
exports.getCafeConfig = async (req, res, next) => {
  try {
    let config = await CafeConfig.findOne({ key: 'global' });
    if (!config) config = await CafeConfig.create({ key: 'global' });
    res.json({ success: true, data: config });
  } catch (err) { next(err); }
};

exports.updateCafeConfig = async (req, res, next) => {
  try {
    const { lunchCutoff, snacksCutoff } = req.body;
    let config = await CafeConfig.findOne({ key: 'global' });
    if (!config) config = await CafeConfig.create({ key: 'global' });
    if (lunchCutoff !== undefined) config.lunchCutoff = lunchCutoff;
    if (snacksCutoff !== undefined) config.snacksCutoff = snacksCutoff;
    config.updatedAt = new Date();
    await config.save();
    res.json({ success: true, data: config });
  } catch (err) { next(err); }
};

// ── Sync item images across duplicate items on different days ─────────────────
exports.syncItemImages = async (req, res, next) => {
  try {
    const { itemName } = req.body;
    if (!itemName || typeof itemName !== 'string' || itemName.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Item name is required' });
    }

    const key = normalizeItemName(itemName);
    const menus = await CafeMenu.find();
    
    // Find all instances of this item across all days
    const instances = [];
    menus.forEach(menu => {
      menu.items.forEach(item => {
        if (normalizeItemName(item.name) === key) {
          instances.push({
            menu,
            item,
            menuDay: menu.day,
            itemId: item._id,
            imageUrl: item.imageUrl,
            updatedAt: item.imageUpdatedAt || menu.updatedAt,
          });
        }
      });
    });

    if (instances.length === 0) {
      return res.status(404).json({ success: false, message: `Item "${itemName}" not found in any menu` });
    }

    if (instances.length === 1) {
      return res.status(200).json({ success: true, message: 'Item found on only one day, no sync needed', data: { synced: 0 } });
    }

    // Find the instance with the most recent image (prefer non-empty imageUrl and most recent menu update)
    let latestImage = null;
    let latestMenu = null;
    let latestTimestamp = null;

    instances.forEach(inst => {
      const hasImage = inst.imageUrl && inst.imageUrl.trim() !== '';
      const updateTime = new Date(inst.updatedAt).getTime();
      
      // Prefer: has image and is latest
      if (hasImage && (!latestTimestamp || updateTime > latestTimestamp)) {
        latestImage = inst.imageUrl;
        latestMenu = inst.menu;
        latestTimestamp = updateTime;
      }
    });

    // If no instance has an image, pick the most recent anyway
    if (!latestImage && instances.length > 0) {
      instances.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      latestImage = instances[0].imageUrl;
      latestMenu = instances[0].menu;
    }

    // Apply the latest image to all instances
    let syncedCount = 0;
    const syncedDays = [];
    for (const inst of instances) {
      if (inst.imageUrl !== latestImage) {
        inst.item.imageUrl = latestImage;
        inst.item.imageUpdatedAt = new Date();
        inst.menu.updatedAt = new Date();
        await inst.menu.save();
        syncedCount++;
        syncedDays.push(inst.menuDay);
      }
    }

    res.json({
      success: true,
      data: {
        itemName,
        synced: syncedCount,
        totalInstances: instances.length,
        latestImage,
        syncedDays,
        message: `Synced "${itemName}" image across ${instances.length} day(s). Applied latest image to ${syncedCount} instance(s).`,
      },
    });
  } catch (err) { next(err); }
};
