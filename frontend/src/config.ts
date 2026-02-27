// API Configuration - empty string uses same origin (proxy handles /api)
export const API_URL = '';

// ElevenLabs Configuration
export const ELEVENLABS_AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || 'agent_7901khz299zdfvcbhtk3c08vcps8';

// Environment
export const IS_PRODUCTION = import.meta.env.PROD;
export const IS_DEVELOPMENT = import.meta.env.DEV;
