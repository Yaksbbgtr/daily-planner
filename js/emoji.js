// A picture for each item, like the round icons in Structured and Tiimo. Guessed from the title unless one was picked.
const RULES = [
  [/dentist|teeth|tooth/i, '🦷'], [/doctor|dr\.?\s|clinic|checkup|appointment/i, '🩺'], [/pharmacy|medicine|pills?|vitamin/i, '💊'],
  [/gym|workout|exercise|lift|weights/i, '💪'], [/\brun\b|running|jog/i, '🏃'], [/walk/i, '🚶'], [/swim/i, '🏊'], [/bike|cycling/i, '🚴'],
  [/groceries|grocery|shop|store|buy|order|amazon/i, '🛒'], [/call|phone|ring/i, '📞'], [/e-?mail|inbox|reply/i, '✉️'], [/mail|post office|package/i, '📬'],
  [/meeting|meet|zoom|interview/i, '👥'], [/breakfast|lunch|dinner|supper|eat|restaurant|meal/i, '🍽️'], [/coffee/i, '☕'], [/cook|bake|recipe/i, '🍳'],
  [/shiur|learn|gemara|gemora|chavrusa|chavrusah|seder|daf|mishna|torah|chumash/i, '📖'], [/daven|shacharis|shachris|mincha|maariv|minyan|shul|tefill/i, '🙏'],
  [/shabbos|shabbat|candle|yom ?tov|chag/i, '🕯️'], [/yahrzeit|yartzeit/i, '🕯️'], [/birthday|bday/i, '🎂'], [/wedding|chasuna|chasunah|vort|engagement/i, '💍'],
  [/simcha|party|bar mitzva|bris|kiddush/i, '🎉'], [/flight|fly|airport|trip|travel|vacation/i, '✈️'], [/car|oil change|mechanic|gas\b/i, '🚗'],
  [/pay|bill|bank|rent|tax|invoice|money/i, '💳'], [/clean|vacuum|mop|tidy/i, '🧹'], [/laundry|wash clothes|fold/i, '🧺'], [/trash|garbage|recycling/i, '🗑️'],
  [/read|book/i, '📚'], [/study|homework|test|exam|essay/i, '✏️'], [/school|class|teach/i, '🏫'], [/work|office|project|deadline/i, '💼'],
  [/kids?|children|pick ?up|drop ?off|carpool/i, '🧒'], [/haircut|barber/i, '💈'], [/sleep|nap|bed/i, '😴'], [/water|drink/i, '💧'],
  [/music|practice|piano|guitar/i, '🎵'], [/garden|plants?/i, '🪴'], [/pet|dog|cat|vet\b/i, '🐾'], [/write|journal|blog/i, '📝'], [/code|bug|deploy/i, '💻'],
  [/movie|show|tv\b/i, '🎬'], [/game|match|ball/i, '🏀'], [/gift|present/i, '🎁'], [/fix|repair|install/i, '🔧'], [/plan|review/i, '🗂️'],
];
export const PICKS = ['✅', '📅', '⭐', '🔥', '💼', '📞', '✉️', '🛒', '🍽️', '☕', '💪', '🏃', '🚶', '📖', '🙏', '🕯️', '🎂', '🎉', '✈️', '🚗', '💳', '🧹', '🧺', '📚', '✏️', '🧒', '🩺', '💊', '😴', '💧', '🎵', '🪴', '🐾', '📝', '💻', '🎁', '🔧', '🏠', '❤️', '🌙'];

export function guess(title, kind) {
  for (const [re, e] of RULES) if (re.test(title || '')) return e;
  return kind === 'event' ? '📅' : kind === 'habit' ? '⭐' : kind === 'project' ? '🗂️' : '✅';
}
export const emojiOf = (rec) => rec.emoji || guess(rec.title, rec.k);
