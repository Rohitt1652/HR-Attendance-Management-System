const Notification = require('../models/Notification');

/**
 * Create a notification for a user.
 * @param {string} userId - recipient user ID
 * @param {string} type - notification type
 * @param {string} title
 * @param {string} message
 * @param {string} [link] - optional deep link
 */
async function notify(userId, type, title, message, link = null) {
  try {
    await Notification.create({ userId, type, title, message, link });
  } catch (err) {
    console.error('Notification error:', err.message);
  }
}

module.exports = notify;
