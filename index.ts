import { TripAdvisorScraper } from './nodes/TripAdvisorScraper/TripAdvisorScraper.node';
import { ApifyApi } from './credentials/ApifyApi.credentials';

export const nodeTypes = [TripAdvisorScraper];

export const credentialTypes = [ApifyApi];
