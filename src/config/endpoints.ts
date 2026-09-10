const V1 = '/api/v1';
const V2 = '/api/v2';

export const endpoints = {
  auth: {
    accessToken: `${V1}/login/access-token`,
  },

  reports: {
    detailedMovementWithQuality: `${V1}/detailed_movement_with_quality`,
    transportReport: `${V1}/transport_report`,
    fuelManagement: `${V1}/fuel_management`,
  },

  docs: {
    openapi: '/openapi.json',
    swagger: '/docs',
    redoc: '/redoc',
  },

  v2: {
    root: V2,
  },
} as const;
