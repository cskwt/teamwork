import { isUsableAvatar, pickAvatar, snapshotAvatar } from './helpers';

describe('avatar helpers', () => {
  const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';

  test('isUsableAvatar accepts image data URLs and http URLs', () => {
    expect(isUsableAvatar(photo)).toBe(true);
    expect(isUsableAvatar('https://cdn.example/u.png')).toBe(true);
    expect(isUsableAvatar('')).toBe(false);
    expect(isUsableAvatar('   ')).toBe(false);
    expect(isUsableAvatar('not-an-image')).toBe(false);
  });

  test('pickAvatar skips empty stripped avatars', () => {
    expect(pickAvatar('', undefined, photo)).toBe(photo);
    expect(pickAvatar(undefined, photo)).toBe(photo);
  });

  test('snapshotAvatar drops huge data URLs but keeps normal photos', () => {
    expect(snapshotAvatar(photo)).toBe(photo);
    expect(snapshotAvatar(`data:image/jpeg;base64,${'A'.repeat(250000)}`)).toBeUndefined();
    expect(snapshotAvatar('https://cdn.example/u.png')).toBe('https://cdn.example/u.png');
  });
});
