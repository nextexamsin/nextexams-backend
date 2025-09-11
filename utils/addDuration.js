module.exports = function addDuration(date, duration) {
  const d = new Date(date);
  switch (duration) {
    case '1day':
      d.setDate(d.getDate() + 1); break;
    case '1week':
      d.setDate(d.getDate() + 7); break;
    case '1month':
      d.setMonth(d.getMonth() + 1); break;
    case '6months':
      d.setMonth(d.getMonth() + 6); break;
  }
  return d;
};
