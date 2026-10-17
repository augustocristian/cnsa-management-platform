// Google OAuth Client ID rules (pure). The storage of the ID lives in infrastructure/config.js.
export const CLIENT_ID_KEY = 'cnl:clientId'; // where this browser keeps a Client ID tried by the owner (localStorage key name)
export const CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

export const isValidClientId = (v) => /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(String(v || '').trim());
