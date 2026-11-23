// A round picture for each item, like the round icons in Structured and Tiimo, drawn as black-and-white line icons.
// Guessed from the title unless one was picked. Items saved with an emoji before keep a matching icon.
import { glyph, GLYPHS } from './glyphs.js';
const RULES = [
  [/dentist|teeth|tooth/i, 'smile'], [/doctor|dr\.?\s|clinic|checkup|appointment/i, 'stethoscope'], [/pharmacy|medicine|pills?|vitamin/i, 'pill'],
  [/gym|workout|exercise|lift|weights/i, 'dumbbell'], [/\brun\b|running|jog/i, 'activity'], [/walk/i, 'footprints'], [/swim/i, 'waves'], [/bike|cycling/i, 'bike'],
  [/groceries|grocery|shop|store|buy|order|amazon/i, 'shopping-cart'], [/call|phone|ring/i, 'phone'], [/e-?mail|inbox|reply/i, 'mail'], [/mail|post office|package/i, 'package'],
  [/meeting|meet|zoom|interview/i, 'users'], [/breakfast|lunch|dinner|supper|eat|restaurant|meal/i, 'utensils'], [/coffee/i, 'coffee'], [/cook|bake|recipe/i, 'chef-hat'],
  [/shiur|learn|gemara|gemora|chavrusa|chavrusah|seder|daf|mishna|torah|chumash/i, 'book-open'], [/daven|shacharis|shachris|mincha|maariv|minyan|shul|tefill/i, 'hand-heart'],
  [/shabbos|shabbat|candle|yom ?tov|chag/i, 'candle'], [/yahrzeit|yartzeit/i, 'candle'], [/birthday|bday/i, 'cake'], [/wedding|chasuna|chasunah|vort|engagement/i, 'gem'],
  [/simcha|party|bar mitzva|bris|kiddush/i, 'party-popper'], [/flight|fly|airport|trip|travel|vacation/i, 'plane'], [/car|oil change|mechanic|gas\b/i, 'car'],
  [/pay|bill|bank|rent|tax|invoice|money/i, 'credit-card'], [/clean|vacuum|mop|tidy/i, 'sparkles'], [/laundry|wash clothes|fold/i, 'shirt'], [/trash|garbage|recycling/i, 'trash-2'],
  [/read|book/i, 'library'], [/study|homework|test|exam|essay|class|course|college/i, 'graduation-cap'], [/school|class|teach/i, 'school'], [/work|office|project|deadline/i, 'briefcase'],
  [/kids?|children|pick ?up|drop ?off|carpool/i, 'baby'], [/haircut|barber/i, 'scissors'], [/sleep|nap|bed/i, 'bed'], [/water|drink/i, 'droplet'],
  [/music|practice|piano|guitar/i, 'music'], [/garden|plants?/i, 'sprout'], [/pet|dog|cat|vet\b/i, 'paw-print'], [/write|journal|blog/i, 'notebook-pen'], [/code|bug|deploy/i, 'laptop'],
  [/movie|show|tv\b/i, 'clapperboard'], [/game|match|ball/i, 'trophy'], [/gift|present/i, 'gift'], [/fix|repair|install/i, 'wrench'], [/plan|review/i, 'folder-kanban'],
];
const LEGACY = {'🦷': 'smile', '🩺': 'stethoscope', '💊': 'pill', '💪': 'dumbbell', '🏃': 'activity', '🚶': 'footprints', '🏊': 'waves', '🚴': 'bike', '🛒': 'shopping-cart', '📞': 'phone', '✉️': 'mail', '📬': 'package', '👥': 'users', '🍽️': 'utensils', '☕': 'coffee', '🍳': 'chef-hat', '📖': 'book-open', '🙏': 'hand-heart', '🕯️': 'candle', '🎂': 'cake', '💍': 'gem', '🎉': 'party-popper', '✈️': 'plane', '🚗': 'car', '💳': 'credit-card', '🧹': 'sparkles', '🧺': 'shirt', '🗑️': 'trash-2', '📚': 'library', '✏️': 'pencil', '🏫': 'school', '💼': 'briefcase', '🧒': 'baby', '💈': 'scissors', '😴': 'bed', '💧': 'droplet', '🎵': 'music', '🪴': 'sprout', '🐾': 'paw-print', '📝': 'notebook-pen', '💻': 'laptop', '🎬': 'clapperboard', '🏀': 'trophy', '🎁': 'gift', '🔧': 'wrench', '🗂️': 'folder-kanban', '✅': 'circle-check', '📅': 'calendar', '⭐': 'star', '🔥': 'flame', '🏠': 'house', '❤️': 'heart', '🌙': 'moon', '🛏️': 'bed', '📵': 'smartphone', '☀️': 'sun', '🌅': 'sunrise', '🌆': 'sunset', '🌇': 'sunset', '📁': 'folder', '🎯': 'target', '📍': 'map-pin'};
export const PICKS = ['circle-check', 'calendar', 'star', 'flame', 'briefcase', 'phone', 'mail', 'shopping-cart', 'utensils', 'coffee', 'dumbbell', 'activity', 'footprints', 'book-open', 'hand-heart', 'candle', 'cake', 'party-popper', 'plane', 'car', 'credit-card', 'sparkles', 'shirt', 'library', 'pencil', 'graduation-cap', 'baby', 'stethoscope', 'pill', 'bed', 'droplet', 'music', 'sprout', 'paw-print', 'notebook-pen', 'laptop', 'gift', 'wrench', 'house', 'heart', 'moon', 'sun', 'folder-kanban', 'users'];

export function guess(title, kind) {
  for (const [re, e] of RULES) if (re.test(title || '')) return e;
  return kind === 'event' ? 'calendar' : kind === 'habit' ? 'star' : kind === 'project' ? 'folder-kanban' : 'circle-check';
}
export const iconName = (rec) => { const e = LEGACY[rec.emoji] || rec.emoji; return GLYPHS[e] ? e : guess(rec.title, rec.k); };
// The icon as markup, ready to drop into a bubble.
export const emojiOf = (rec) => glyph(iconName(rec));
export { glyph };
