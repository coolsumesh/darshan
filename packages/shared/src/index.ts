export const APP_NAME = "darshan" as const;

export type HealthResponse = {
  ok: true;
  service: string;
  time: string;
};
