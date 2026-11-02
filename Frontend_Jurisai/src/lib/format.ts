const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** yyyy-mm-dd in local time. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** "27 Sep 2026" — the style used in Indian court filings. */
export function formatDate(value: string | Date): string {
  const date =
    typeof value === 'string' ? parseIsoDate(value) ?? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatRelative(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return days === 1 ? 'Yesterday' : `${days} days ago`;
  }
  return formatDate(date);
}

/** Indian digit grouping: 450000 -> "4,50,000". */
export function formatIndianNumber(value: string | number): string {
  const [whole, fraction] = String(value).replace(/,/g, '').split('.');
  if (!/^\d+$/.test(whole)) {
    return String(value);
  }
  const lastThree = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest
    ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}`
    : lastThree;
  return fraction ? `${grouped}.${fraction}` : grouped;
}

export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${formatIndianNumber(
    Number.isInteger(rupees) ? rupees : rupees.toFixed(2),
  )}`;
}

export function maskIdentifier(identifier: string): string {
  if (identifier.includes('@')) {
    const [user, domain] = identifier.split('@');
    return `${user.slice(0, 2)}${'•'.repeat(
      Math.max(user.length - 2, 1),
    )}@${domain}`;
  }
  return `${identifier.slice(0, 3)} ${'•'.repeat(6)}${identifier.slice(-4)}`;
}
