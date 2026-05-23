import path from 'path';

export interface TenantConfig {
  id: string;
  name: string;
  glDataFile: string;
}

const TENANT_ID = process.env.TENANT_ID || 'default';

const TENANTS: Record<string, TenantConfig> = {
  default: {
    id: 'default',
    name: 'Master',
    glDataFile: path.join(__dirname, '..', 'data', 'gldet.json'),
  },
  demo: {
    id: 'demo',
    name: 'Demo',
    glDataFile: path.join(__dirname, '..', 'demo-data', 'gldet.json'),
  },
};

export const tenant: TenantConfig = TENANTS[TENANT_ID] || TENANTS.default;
