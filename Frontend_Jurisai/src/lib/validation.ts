export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim());
}

/**
 * Enrolment numbers vary by State Bar Council (D/1234/2015, MAH/1234/2010,
 * K/567/2019 …), so only sanity-check the shape.
 */
export function isPlausibleEnrolmentNumber(input: string): boolean {
  const value = input.trim();
  return /^[A-Za-z0-9][A-Za-z0-9/.\- ]{3,29}$/.test(value) && /\d/.test(value);
}
