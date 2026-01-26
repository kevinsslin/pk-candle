export const normalizeRoomId = (value: string) => {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  return cleaned || 'public';
};
