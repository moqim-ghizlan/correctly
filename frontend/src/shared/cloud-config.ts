// Public Firebase identifiers for the optional account backup (V5.17). None
// of these is a secret: security comes from Google sign-in and the Firestore
// rules (`firebase/firestore.rules`). Never put an OAuth client secret
// (`GOCSPX-...`) or a service-account file here; `scripts/audit-dist.mjs`
// refuses the build if one appears.

export interface CloudConfig {
  apiKey: string;
  projectId: string;
  oauthClientId: string;
}

const CONFIG: CloudConfig = {
  apiKey: 'AIzaSyDrmbw6ODIePS7OgdZLKjfuhCHoCn64UR4',
  projectId: 'correctly-a1b2c',
  oauthClientId:
    '680252772392-94lq61gt0dvuaoqeoqt36eevtatvs118.apps.googleusercontent.com',
};

/** The configuration, or null when a value is missing (zero request then). */
export function cloudConfig(config: CloudConfig = CONFIG): CloudConfig | null {
  const ok =
    /^AIza[\w-]{35}$/.test(config.apiKey) &&
    /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.projectId) &&
    /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(config.oauthClientId);
  return ok ? { ...config } : null;
}
